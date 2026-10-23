/** The one messaging policy (DESIGN 2026-10-18 s.2): GATES in order, first objection decides;
 * the budget runs last so a duplicate is dropped, not merged into the digest.
 * Pure: no I/O, flags or clock; imports only the zone math and its types. @module services/messaging/policy */
import { isValidTimeZone, wallTimeIn, zonedWallTimeToUtc } from '../../utils/time-zone.js';
import { DAILY_TEXT_CAP, DAILY_TEXT_WINDOW_MS } from './types.js';
import type { Channel, Decision, Intent, LocalWindow, MessageKind, PolicyCtx } from './types.js';

type Requester = Intent['requestedBy'];
type Entry = PolicyCtx['ledger'][number];
const [MIN_MS, HOUR_MS, DAY_MS] = [60_000, 3_600_000, 86_400_000];

/** 21:00-08:00; the owner's saved window replaces it for messages to them (4-16 h long). */
export const DEFAULT_QUIET: LocalWindow = { startMin: 21 * 60, endMin: 8 * 60 };
export const CRISIS_QUIET_MS = 14 * DAY_MS;
export const APP_DAILY_BUDGET = 6; // push and in-app share it; texts: DAILY_TEXT_CAP
export const SAME_BODY_MS = 12 * HOUR_MS;
export const LIVE_REPLY_MS = 30 * MIN_MS; // a reply this soon after their text: they're awake
export const RATE_LIMITS = {
  code: { gapMs: 30_000 }, // per destination (phone hash)
  codesPerPerson: { perHour: 5, perDay: 10, destinationsPerDay: 3 }, // no SMS pumping
  reply: { perInbound: 5, perHour: 20 },
  requested: { perDay: 10 }, // the user's own requests, which skip the budget
} as const;
const FALLBACK_ZONES = ['America/New_York', 'America/Los_Angeles']; // no zone: either coast

/** Per kind: priority when the budget is short, the gap between two (today's guarded-text gaps), digestible. */
const KINDS: Readonly<Record<MessageKind, { priority: number; gapMs: number; digest: boolean }>> = {
  transactional: { priority: 95, gapMs: 0, digest: false },
  reply: { priority: 90, gapMs: 0, digest: false },
  reminder: { priority: 80, gapMs: MIN_MS, digest: false }, // REMINDER_TEXT_GAP_MS
  'on-behalf': { priority: 75, gapMs: 10 * MIN_MS, digest: false }, // ON_BEHALF_GAP_MS
  'post-call-check-in': { priority: 60, gapMs: 20 * HOUR_MS, digest: false }, // RATE_LIMIT_MS
  'follow-up': { priority: 55, gapMs: 20 * HOUR_MS, digest: true }, // FOLLOW_UP_GAP_MS
  'check-in': { priority: 50, gapMs: 20 * HOUR_MS, digest: true },
  'morning-brief': { priority: 45, gapMs: 20 * HOUR_MS, digest: false },
  'commitment-nudge': { priority: 40, gapMs: 20 * HOUR_MS, digest: true },
  proactive: { priority: 30, gapMs: 4 * HOUR_MS, digest: true }, // none today; the budget rules
  digest: { priority: 20, gapMs: DAY_MS, digest: false }, // one a day
};

export const priorityOf = (kind: MessageKind, requestedBy: Requester): number =>
  requestedBy === 'user' ? 100 : KINDS[kind].priority;
export const isDigestible = (kind: MessageKind): boolean => KINDS[kind].digest;

// Kinds that answer the person rather than reach out to them.
const RESPONSIVE: ReadonlySet<MessageKind> = new Set(['reply', 'transactional']);

const ferniInitiated = (kind: MessageKind, by: Requester | undefined): boolean =>
  (by ?? 'ferni') === 'ferni' && !RESPONSIVE.has(kind);
const countsTowardBudget = (kind: MessageKind, by: Requester | undefined): boolean =>
  ferniInitiated(kind, by) && kind !== 'digest';
const isProactive = (i: Intent): boolean => ferniInitiated(i.kind, i.requestedBy);
const byPhone = (c: Channel): c is 'sms' | 'call' => c === 'sms' || c === 'call';
/** The owner chose the time ("remind me at 6:30"), so it goes when they said. */
const ownerTimed = (i: Intent): boolean =>
  i.recipient === 'owner' && i.requestedBy === 'user' && i.requestedAt !== undefined;
/** A code or confirmation the user asked for, to them or to the number they are verifying. */
const userCode = (i: Intent): boolean =>
  i.kind === 'transactional' &&
  i.requestedBy === 'user' &&
  (i.recipient === 'owner' || i.verifyingNumber === true);
const liveReply = (i: Intent, { now, lastInboundAt: at }: PolicyCtx): boolean =>
  i.kind === 'reply' && at !== undefined && now.getTime() - at.getTime() < LIVE_REPLY_MS;
const recent = (e: { readonly at: Date }, ctx: PolicyCtx, ms: number): boolean =>
  ctx.now.getTime() - e.at.getTime() < ms;

const drop = (reason: Decision['reason']): Decision => ({ action: 'drop', reason });
const hold = (reason: Decision['reason'], until?: Date): Decision =>
  until ? { action: 'hold', reason, holdUntil: until } : { action: 'hold', reason };

/** The UTC instant of a local wall time `dayOffset` days after `at`'s local date. */
function localAt(at: Date, zone: string, dayOffset: number, minutes: number): Date {
  const w = wallTimeIn(at, zone);
  const d = new Date(Date.UTC(w.year, w.month - 1, w.day + dayOffset));
  const [year, month, day] = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
  const hour = Math.floor(minutes / 60);
  return zonedWallTimeToUtc({ year, month, day, hour, minute: minutes % 60 }, zone);
}

const minuteIn = (at: Date, zone: string): number =>
  ((w) => w.hour * 60 + w.minute)(wallTimeIn(at, zone));
const toMin = (hhmm: string): number | null => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** The quiet window for this recipient: the owner's saved one when valid, else 21:00-08:00. */
function quietWindow(i: Intent, ctx: PolicyCtx): LocalWindow {
  const { quietStart = '', quietEnd = '' } = i.recipient === 'owner' ? ctx.prefs : {};
  const [startMin, endMin] = [toMin(quietStart), toMin(quietEnd)];
  if (startMin === null || endMin === null) return DEFAULT_QUIET;
  const span = (endMin - startMin + 1440) % 1440;
  return span >= 240 && span <= 960 ? { startMin, endMin } : DEFAULT_QUIET;
}

/** When the quiet window ends, if it is quiet now in any of the zones (the latest end). */
function quietUntil(now: Date, zones: readonly string[], w: LocalWindow): Date | null {
  let until: Date | null = null;
  for (const zone of zones) {
    const min = minuteIn(now, zone);
    if (!inWindow(w, min)) continue;
    const end = localAt(now, zone, w.startMin > w.endMin && min >= w.startMin ? 1 : 0, w.endMin);
    if (!until || end > until) until = end;
  }
  return until;
}

const zonesOf = (ctx: PolicyCtx): string[] =>
  isValidTimeZone(ctx.zone) ? [ctx.zone] : FALLBACK_ZONES;

const inWindow = (w: LocalWindow, min: number): boolean =>
  w.startMin <= w.endMin
    ? min >= w.startMin && min < w.endMin
    : min >= w.startMin || min < w.endMin;

function nextWindow(now: Date, zone: string, windows: readonly LocalWindow[]): Date | null {
  const min = minuteIn(now, zone);
  if (windows.some((w) => inWindow(w, min))) return null;
  const opens = windows.map((w) => localAt(now, zone, w.startMin > min ? 0 : 1, w.startMin));
  return opens.reduce((a, b) => (b < a ? b : a));
}

/** 1. Only a verified owner number; a third party only by phone and about something real. */
function recipientGate(i: Intent, ctx: PolicyCtx): Decision | null {
  if (i.recipient === 'owner') {
    const verifying = userCode(i) && i.verifyingNumber === true;
    if (byPhone(i.channel) && !ctx.verifiedRecipient && !verifying)
      return drop('no-verified-phone');
  } else if (!byPhone(i.channel)) return drop('bad-channel');
  const grounded = i.anchor !== undefined && i.anchor.trim() !== '';
  return !grounded && (i.recipient === 'third-party' || isProactive(i)) ? drop('no-anchor') : null;
}

/** 2. STOP on this channel drops it; a third party who never said yes waits for consent. */
function consentGate(i: Intent, ctx: PolicyCtx): Decision | null {
  const consent = byPhone(i.channel) ? ctx.consent[i.channel] : 'in';
  if (consent === 'out') return drop('opted-out');
  return consent === 'unknown' && i.recipient === 'third-party' ? hold('needs-consent') : null;
}

/** 3. The owner turned texts off: nothing by SMS except an answer to them. */
function textsOffGate(i: Intent, ctx: PolicyCtx): Decision | null {
  const off = ctx.prefs.textsOff && i.recipient === 'owner' && i.channel === 'sms';
  return off && !RESPONSIVE.has(i.kind) ? drop('sms-off') : null;
}

/** 4. For 14 days after a crisis only a code they asked for goes; Ferni's own drop, the rest hold. */
function crisisGate(i: Intent, ctx: PolicyCtx): Decision | null {
  const ends = (ctx.crisis.lastCrisisAt?.getTime() ?? -Infinity) + CRISIS_QUIET_MS;
  if (ctx.now.getTime() >= ends || userCode(i)) return null;
  return isProactive(i) ? drop('crisis-quiet') : hold('crisis-quiet', new Date(ends));
}

/**
 * 4b. A Focus they put Ferni in: what Ferni starts holds until the Focus ends (or its cap), by
 * text, push or call. A reminder they timed goes unless they said not to; a reply, a code they
 * asked for and anything in the app always go.
 */
function focusGate(i: Intent, ctx: PolicyCtx): Decision | null {
  const f = ctx.focus;
  if (!f || i.recipient !== 'owner' || ctx.now.getTime() >= f.capUntil.getTime()) return null;
  if (i.channel === 'in_app' || i.kind === 'reply' || userCode(i)) return null;
  const held = ownerTimed(i) ? !f.remindersThrough : isProactive(i);
  return held ? hold('focus-hold', f.capUntil) : null;
}

/** 5. Quiet hours and their windows; a time the owner chose, a user's code and a live reply go. */
function timeGate(i: Intent, ctx: PolicyCtx): Decision | null {
  if (i.channel === 'in_app' || i.kind === 'reply' || ownerTimed(i) || userCode(i)) return null;
  const known = isValidTimeZone(ctx.zone);
  if (!known && isProactive(i)) return hold('no-timezone');
  const until = quietUntil(ctx.now, zonesOf(ctx), quietWindow(i, ctx));
  if (until) return hold('quiet-hours', until);
  const windows = ctx.prefs.windows ?? [];
  const opens =
    known && isProactive(i) && windows.length ? nextWindow(ctx.now, ctx.zone, windows) : null;
  return opens ? hold('outside-window', opens) : null;
}

const budgetGroup = (c: Channel): 'sms' | 'app' | null =>
  c === 'sms' ? 'sms' : c === 'push' || c === 'in_app' ? 'app' : null;

const smsCap = ({ prefs: { maxPerDay: m } }: PolicyCtx): number =>
  m === undefined || !Number.isFinite(m)
    ? DAILY_TEXT_CAP
    : Math.max(0, Math.min(DAILY_TEXT_CAP, Math.floor(m)));

/** The digest it joins: today's in the recipient's zone, or tomorrow's once today's went. */
function digestKey(ctx: PolicyCtx): string {
  const zone = isValidTimeZone(ctx.zone) ? ctx.zone : 'Etc/UTC';
  const day = (at: Date): string => {
    const w = wallTimeIn(at, zone);
    return `${w.year}-${String(w.month).padStart(2, '0')}-${String(w.day).padStart(2, '0')}`;
  };
  const today = day(ctx.now);
  const went = ctx.ledger.some(
    (e) => e.kind === 'digest' && e.status === 'sent' && day(e.at) === today
  );
  return `digest:${went ? day(localAt(ctx.now, zone, 1, 12 * 60)) : today}`;
}

/**
 * 10. The daily budget, rolling 24 h: spent, it merges or drops. A slot a held message
 * claims goes to this one only if it outranks one (that one finds the budget spent later).
 */
function budgetGate(i: Intent, ctx: PolicyCtx): Decision | null {
  const group = budgetGroup(i.channel);
  if (!group || !countsTowardBudget(i.kind, i.requestedBy)) return null;
  const cap = group === 'sms' ? smsCap(ctx) : APP_DAILY_BUDGET;
  const today = ctx.ledger.filter(
    (e) =>
      budgetGroup(e.channel) === group &&
      countsTowardBudget(e.kind, e.requestedBy) &&
      recent(e, ctx, DAILY_TEXT_WINDOW_MS)
  );
  const sent = today.filter((e) => e.status === 'sent').length;
  const queued = today.filter((e) => e.status === 'held' && e.intentKey !== i.intentKey);
  const lowest = Math.min(...queued.map((e) => e.priority));
  if (sent < cap && (sent + queued.length < cap || i.priority >= lowest)) return null;
  if (!isDigestible(i.kind)) return drop('over-budget');
  return { action: 'merge', reason: 'over-budget', mergeInto: digestKey(ctx) };
}

/** 6. Once per intent; the same words twice in 12 hours is a duplicate too. */
function dedupeGate(i: Intent, ctx: PolicyCtx): Decision | null {
  const again = (e: Entry): boolean => e.status === 'sent' || (e.status === 'held' && !i.redecide);
  const sameBody = (e: Entry): boolean =>
    i.bodyHash !== undefined && e.bodyHash === i.bodyHash && e.status === 'sent';
  const dup = ctx.ledger.some(
    (e) =>
      (e.intentKey === i.intentKey && again(e)) || (sameBody(e) && recent(e, ctx, SAME_BODY_MS))
  );
  return dup ? drop('duplicate') : null;
}

/** 7. Not two of a kind on a channel inside that kind's gap. */
function gapGate(i: Intent, ctx: PolicyCtx): Decision | null {
  const gap = KINDS[i.kind].gapMs;
  const close = ctx.ledger.some(
    (e) =>
      e.kind === i.kind && e.channel === i.channel && e.status === 'sent' && recent(e, ctx, gap)
  );
  return gap > 0 && close ? drop('recently-sent') : null;
}

const tries = (ctx: PolicyCtx, match: (e: Entry) => boolean, ms: number): Entry[] =>
  ctx.ledger.filter(
    (e) => e.status !== 'held' && e.status !== 'skipped' && match(e) && recent(e, ctx, ms)
  );

/** 8. Codes, asked for or not: per number, and per person across numbers (no SMS pumping). */
function codeRateGate(i: Intent, ctx: PolicyCtx): Decision | null {
  if (i.kind !== 'transactional') return null;
  const tried = (match: (e: Entry) => boolean, ms: number): number => tries(ctx, match, ms).length;
  const person = RATE_LIMITS.codesPerPerson;
  const anyCode = (e: Entry): boolean => e.kind === 'transactional';
  const code = (e: Entry): boolean => anyCode(e) && e.destination === i.destination;
  const byThem =
    tried(anyCode, HOUR_MS) >= person.perHour || tried(anyCode, DAY_MS) >= person.perDay;
  if (tried(code, RATE_LIMITS.code.gapMs) > 0 || byThem) return drop('transactional-rate');
  const numbers = new Set(tries(ctx, anyCode, DAY_MS).map((e) => e.destination));
  const newNumber = !numbers.has(i.destination) && numbers.size >= person.destinationsPerDay;
  return newNumber ? drop('too-many-destinations') : null;
}

/** 9. Live replies per inbound text and per hour; the user's own requests per day. */
function rateGate(i: Intent, ctx: PolicyCtx): Decision | null {
  const tried = (match: (e: Entry) => boolean, ms: number): number => tries(ctx, match, ms).length;
  if (i.kind === 'reply') {
    const { perInbound, perHour } = RATE_LIMITS.reply;
    const reply = (e: Entry): boolean => e.kind === 'reply';
    const burst = ctx.now.getTime() - (ctx.lastInboundAt?.getTime() ?? 0) + 1; // since their text
    return tried(reply, burst) >= perInbound || tried(reply, HOUR_MS) >= perHour
      ? drop('reply-rate')
      : null;
  }
  const asked = (e: Entry): boolean => e.requestedBy === 'user' && e.kind !== 'transactional';
  const overAsked =
    i.requestedBy === 'user' && tried(asked, DAY_MS) >= RATE_LIMITS.requested.perDay;
  return overAsked ? drop('requested-rate') : null;
}

/** 11. Send. A third party's first text from Ferni says who is writing and for whom. */
function sendDecision(i: Intent, ctx: PolicyCtx): Decision {
  const inQuiet = ownerTimed(i) && quietUntil(ctx.now, zonesOf(ctx), quietWindow(i, ctx)) !== null;
  const introRequired = i.recipient === 'third-party' && ctx.isFirstContact;
  return { action: 'send', reason: inQuiet ? 'requested-time' : 'ok', introRequired };
}

type Gate = (i: Intent, ctx: PolicyCtx) => Decision | null;

export const GATES: ReadonlyArray<readonly [string, Gate]> = [
  ['recipient', recipientGate],
  ['consent', consentGate],
  ['texts-off', textsOffGate],
  ['crisis', crisisGate],
  ['focus', focusGate],
  ['quiet-hours', timeGate],
  ['dedupe', dedupeGate],
  ['gap', gapGate],
  ['code-rate', codeRateGate],
  ['rate', rateGate],
  ['budget', budgetGate],
];

/** A reply with no text from them in the last 30 min answers nothing: it's proactive, and recorded so. */
export function decide(intent: Intent, ctx: PolicyCtx): Decision {
  const stale = intent.kind === 'reply' && !liveReply(intent, ctx);
  const i: Intent = stale ? { ...intent, kind: 'proactive' } : intent;
  const replyBound = stale ? rateGate(intent, ctx) : null; // still bounded as a reply
  const d = replyBound ?? GATES.reduce<Decision | null>((hit, [, g]) => hit ?? g(i, ctx), null);
  const decided = d ?? sendDecision(i, ctx);
  return stale ? { ...decided, recordAs: 'proactive' } : decided;
}

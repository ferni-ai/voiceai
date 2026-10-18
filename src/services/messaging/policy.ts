/**
 * The one messaging policy (DESIGN 2026-10-18, section 2): whether a message
 * goes now, waits, joins the day's digest or is dropped. Today seven
 * quiet-hour rules and no cross-kind cap decide that per sender.
 *
 * Gates in order, the first that objects decides (GATES): recipient, consent,
 * texts off, crisis quiet, quiet hours, dedupe, per-kind gap, daily budget,
 * then send. DESIGN lists the budget before dedupe; it runs last so a
 * duplicate is dropped, not merged into the digest.
 *
 * Pure: no I/O, flags or clock (all in the context); imports only the zone
 * math and its types (policy-purity.test.ts).
 *
 * @module services/messaging/policy
 */
import { isValidTimeZone, wallTimeIn, zonedWallTimeToUtc } from '../../utils/time-zone.js';
import type {
  Channel,
  Decision,
  Intent,
  LedgerEntry,
  LocalWindow,
  MessageKind,
  PolicyCtx,
  ReasonCode,
  RequestedBy,
} from './types.js';

const MIN_MS = 60_000;
const HOUR_MS = 60 * MIN_MS;
const DAY_MS = 24 * HOUR_MS;

export const QUIET_START_HOUR = 21;
export const QUIET_END_HOUR = 8;
export const CRISIS_QUIET_MS = 14 * DAY_MS;
/** Ferni-initiated texts per person per rolling 24 h (every kind and persona); push + in-app share 6. */
export const SMS_DAILY_BUDGET = 3;
export const APP_DAILY_BUDGET = 6;
export const SAME_BODY_MS = 12 * HOUR_MS;
const FALLBACK_ZONES = ['America/New_York', 'America/Los_Angeles']; // no zone: either coast

/**
 * Per kind: priority when the budget is short (a user's request outranks them
 * all), the least gap between two on a channel (today's guarded-text gaps)
 * and whether it can wait for the digest rather than be lost.
 */
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

export const priorityOf = (kind: MessageKind, requestedBy: RequestedBy): number =>
  requestedBy === 'user' ? 100 : KINDS[kind].priority;
export const isDigestible = (kind: MessageKind): boolean => KINDS[kind].digest;

// Kinds that answer the person rather than reach out to them.
const RESPONSIVE: ReadonlySet<MessageKind> = new Set(['reply', 'transactional']);

const ferniInitiated = (kind: MessageKind, by: RequestedBy | undefined): boolean =>
  (by ?? 'ferni') === 'ferni' && !RESPONSIVE.has(kind);
const countsTowardBudget = (kind: MessageKind, by: RequestedBy | undefined): boolean =>
  ferniInitiated(kind, by) && kind !== 'digest';
const isProactive = (i: Intent): boolean => ferniInitiated(i.kind, i.requestedBy);
const byPhone = (c: Channel): c is 'sms' | 'call' => c === 'sms' || c === 'call';
/** The owner chose the time ("remind me at 6:30"), so it goes when they said. */
const ownerTimed = (i: Intent): boolean =>
  i.recipient === 'owner' && i.requestedBy === 'user' && i.requestedAt !== undefined;
const recent = (e: LedgerEntry, ctx: PolicyCtx, ms: number): boolean =>
  ctx.now.getTime() - e.at.getTime() < ms;

const drop = (reason: ReasonCode): Decision => ({ action: 'drop', reason });
const hold = (reason: ReasonCode, until?: Date): Decision =>
  until ? { action: 'hold', reason, holdUntil: until } : { action: 'hold', reason };

/** The UTC instant of a local wall time `dayOffset` days after `at`'s local date. */
function localAt(at: Date, zone: string, dayOffset: number, minutes: number): Date {
  const w = wallTimeIn(at, zone);
  const d = new Date(Date.UTC(w.year, w.month - 1, w.day + dayOffset));
  const [year, month, day] = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
  const hour = Math.floor(minutes / 60);
  return zonedWallTimeToUtc({ year, month, day, hour, minute: minutes % 60 }, zone);
}

/** When quiet hours end, if it is quiet now in any of the zones (the latest end). */
function quietUntil(now: Date, zones: readonly string[]): Date | null {
  let until: Date | null = null;
  for (const zone of zones) {
    const { hour } = wallTimeIn(now, zone);
    if (hour < QUIET_START_HOUR && hour >= QUIET_END_HOUR) continue;
    const end = localAt(now, zone, hour >= QUIET_START_HOUR ? 1 : 0, QUIET_END_HOUR * 60);
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

/** The next opening of the person's own windows, or null when one is open now. */
function nextWindow(now: Date, zone: string, windows: readonly LocalWindow[]): Date | null {
  const { hour, minute } = wallTimeIn(now, zone);
  const min = hour * 60 + minute;
  if (windows.some((w) => inWindow(w, min))) return null;
  const opens = windows.map((w) => localAt(now, zone, w.startMin > min ? 0 : 1, w.startMin));
  return opens.reduce((a, b) => (b < a ? b : a));
}

/** 1. Only a verified owner number; a third party only by phone and about something real. */
function recipientGate(i: Intent, ctx: PolicyCtx): Decision | null {
  if (i.recipient === 'owner') {
    if (byPhone(i.channel) && !ctx.verifiedRecipient) return drop('no-verified-phone');
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

/** 4. For 14 days after a crisis nothing Ferni starts; their reminders and replies still go. */
function crisisGate(i: Intent, ctx: PolicyCtx): Decision | null {
  const at = ctx.crisis.lastCrisisAt;
  const quiet = at !== undefined && ctx.now.getTime() - at.getTime() < CRISIS_QUIET_MS;
  return quiet && isProactive(i) ? drop('crisis-quiet') : null;
}

/**
 * 5. Quiet hours and the person's own windows; a time the owner chose goes
 * anyway. In-app notes wait for them to look.
 */
function timeGate(i: Intent, ctx: PolicyCtx): Decision | null {
  if (i.channel === 'in_app' || ownerTimed(i)) return null;
  const known = isValidTimeZone(ctx.zone);
  if (!known && isProactive(i)) return hold('no-timezone');
  const until = quietUntil(ctx.now, zonesOf(ctx));
  if (until) return hold('quiet-hours', until);
  const windows = ctx.prefs.windows ?? [];
  const opens =
    known && isProactive(i) && windows.length ? nextWindow(ctx.now, ctx.zone, windows) : null;
  return opens ? hold('outside-window', opens) : null;
}

const budgetGroup = (c: Channel): 'sms' | 'app' | null =>
  c === 'sms' ? 'sms' : c === 'push' || c === 'in_app' ? 'app' : null;

function smsCap(ctx: PolicyCtx): number {
  const lower = ctx.prefs.maxPerDay;
  if (lower === undefined || !Number.isFinite(lower)) return SMS_DAILY_BUDGET;
  return Math.max(0, Math.min(SMS_DAILY_BUDGET, Math.floor(lower)));
}

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
 * 8. The daily budget, rolling 24 h. A sent message can't be taken back, so a
 * spent budget merges or drops. Slots still open but claimed by held messages
 * go to this one only if it outranks one of them (that one re-decides later
 * and finds the budget spent). The user's requests and replies don't count.
 */
function budgetGate(i: Intent, ctx: PolicyCtx): Decision | null {
  const group = budgetGroup(i.channel);
  if (!group || !countsTowardBudget(i.kind, i.requestedBy)) return null;
  const cap = group === 'sms' ? smsCap(ctx) : APP_DAILY_BUDGET;
  const today = ctx.ledger.filter(
    (e) =>
      budgetGroup(e.channel) === group &&
      countsTowardBudget(e.kind, e.requestedBy) &&
      recent(e, ctx, DAY_MS)
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
  const dup = ctx.ledger.some(
    (e) =>
      (e.intentKey === i.intentKey &&
        (e.status === 'sent' || (e.status === 'held' && !i.redecide))) ||
      (i.bodyHash !== undefined &&
        e.bodyHash === i.bodyHash &&
        e.status === 'sent' &&
        recent(e, ctx, SAME_BODY_MS))
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

/** 9. Send. A third party's first text from Ferni says who is writing and for whom. */
function sendDecision(i: Intent, ctx: PolicyCtx): Decision {
  const inQuiet = ownerTimed(i) && quietUntil(ctx.now, zonesOf(ctx)) !== null;
  return {
    action: 'send',
    reason: inQuiet ? 'requested-time' : 'ok',
    introRequired: i.recipient === 'third-party' && ctx.isFirstContact,
  };
}

type Gate = (i: Intent, ctx: PolicyCtx) => Decision | null;

/** In order; the first that objects decides. */
export const GATES: ReadonlyArray<readonly [string, Gate]> = [
  ['recipient', recipientGate],
  ['consent', consentGate],
  ['texts-off', textsOffGate],
  ['crisis', crisisGate],
  ['quiet-hours', timeGate],
  ['dedupe', dedupeGate],
  ['gap', gapGate],
  ['budget', budgetGate],
];

export function decide(intent: Intent, ctx: PolicyCtx): Decision {
  for (const [, gate] of GATES) {
    const d = gate(intent, ctx);
    if (d) return d;
  }
  return sendDecision(intent, ctx);
}

// SMS segments. Twilio splits rather than truncates; the old sms-delivery path
// cut to 160 and reported success (#1929). Count, never cut.

const GSM_BASIC = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡' +
    'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'
);
/** GSM-7 extension characters: an escape plus the character, two septets. */
const GSM_EXT = new Set('\f^{}\\[~]|€');

/**
 * How many SMS segments the text takes: GSM-7 (160 in one, else 153 each) or,
 * with any other character, UCS-2 (70, else 67 UTF-16 units each). A
 * two-unit character never straddles two segments.
 */
export function segments(text: string): number {
  const chars = [...text];
  const gsm = chars.every((c) => GSM_BASIC.has(c) || GSM_EXT.has(c));
  const cost = (c: string): number => (gsm ? (GSM_EXT.has(c) ? 2 : 1) : c.length);
  const [single, part] = gsm ? [160, 153] : [70, 67];
  if (chars.reduce((n, c) => n + cost(c), 0) <= single) return 1;
  let [count, used] = [1, 0];
  for (const c of chars) {
    if (used + cost(c) > part) [count, used] = [count + 1, 0];
    used += cost(c);
  }
  return count;
}

export function fitsSms(text: string, maxSegments = 3): boolean {
  return segments(text) <= maxSegments;
}

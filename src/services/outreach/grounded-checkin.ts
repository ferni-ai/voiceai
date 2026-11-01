/**
 * The rules a between-calls check-in must pass before Ferni sends it, the way
 * a close friend texts: about something you actually said, when it matters,
 * and not so often it feels like an app.
 *
 * - Grounded: the caller's own words from that call back it up. No quote,
 *   no message. A summary line is the model's paraphrase, so it doesn't count.
 * - Timed to the thing: a dated item ("the interview is Thursday") goes out
 *   the evening of that day, their time. An undated one only after a few days
 *   without a call; otherwise Ferni just asks next time they talk.
 * - Not right after a call: nothing within JUST_TALKED_HOURS of the last one,
 *   and nothing about a dated thing once they have talked since it was due.
 * - Rare: at most WEEKLY_CAP a week and one a day.
 * - Ferni's voice: one short question, no "just checking in" or "thinking of
 *   you" (PR 898 flagged that phrase becoming a tic).
 *
 * Pure: the Firestore reads live in proactive-channels/pondered-triggers.ts.
 * On by default; OUTREACH_GROUNDED_CHECKINS=off brings back the generic
 * daily check-ins (kill switch only, not a recommended setting).
 *
 * @module services/outreach/grounded-checkin
 */

import { flagOn } from '../../config/env-flag.js';
import { JUST_TALKED_HOURS, justTalked } from './outreach-cadence.js';

export function isGroundedCheckInsOn(
  env: Record<string, string | undefined> = process.env
): boolean {
  return flagOn('OUTREACH_GROUNDED_CHECKINS', env);
}

/**
 * True when the daily scheduler must not send its own check-ins. Every type it
 * picks is generic: nothing the user said backs it up, and in production it is
 * the same "Thinking of you. How are things going?" for everyone. With grounded
 * check-ins on, only the proactive run's quote-backed follow-ups reach out
 * (proactive-channels/pondered-triggers.ts, behind OUTREACH_PONDERED_NOTES).
 */
export function blocksGenericCheckIns(
  env: Record<string, string | undefined> = process.env
): boolean {
  return isGroundedCheckInsOn(env);
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** Evening, their time, as PR 734's follow-ups. */
export const SEND_HOUR = 17;
/** An undated item waits this long without a call; before that it is for the next call. */
export const UNDATED_GAP_DAYS = 3;
export const WEEKLY_CAP = 2;
export const MAX_CHARS = 120;
export const HORIZON_DAYS = 7;

/** Something Ferni could ask about between calls (a pondering follow-up). */
export interface CheckInItem {
  id: string;
  /** The question itself, said to them. */
  text: string;
  /** YYYY-MM-DD it is worth asking, if the call said when. */
  when?: string;
  /** The summary it came from. */
  basis: string;
}

/** One past call: its day and the caller's own lines. */
export interface SourceCall {
  date: string;
  /** When the call ended (ms). */
  endedAt: number;
  userLines: string[];
}

export interface PlannedCheckIn {
  id: string;
  message: string;
  sendAt: Date;
  quote: string;
  callDate: string;
  when?: string;
}

export interface PlanContext {
  now: Date;
  timezone: string;
  name?: string;
  lastTalkedAt?: number;
  calls: ReadonlyMap<string, SourceCall>;
  /** Grounded check-ins already sent in the past week. */
  sent: readonly Date[];
  horizonDays?: number;
}

const STOP = new Set(
  `about after again also been before being could does doing done from going gonna have here
  into just know like make more much next only really said should since some still sure talk
  than that their them then there these they thing things think this those time very want was
  well were what when where which while will with would yeah your yours youre how's what's
  over work working progress lately latest doing`.split(/\s+/)
);

function stem(w: string): string {
  return w.length > 5 ? w.replace(/(?:ing|ed|es|s)$/, '') : w;
}

function contentWords(s: string): Set<string> {
  const words = s
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/);
  return new Set(words.filter((w) => w.length >= 4 && !STOP.has(w)).map(stem));
}

const FIRST_PERSON = /\b(?:i|i'm|im|i've|i'll|i'd|my|me|mine|we|we're|our)\b/i;
const ABOUT_FERNI = /\byour\b|\byou\b.*\?\s*$/i;

/**
 * About the caller's own life: said in the first person, not a question to
 * Ferni or about Ferni ("I meant your martial arts training" is about her;
 * the 2026-10-11 dry run quoted exactly that line).
 */
function aboutThemselves(line: string): boolean {
  return FIRST_PERSON.test(line) && !ABOUT_FERNI.test(line);
}

/** The caller's line about their own life that backs the item up (shares its key words), or undefined. */
export function groundingQuote(item: string, lines: readonly string[]): string | undefined {
  const want = contentWords(item);
  if (want.size === 0) return undefined;
  const need = Math.min(2, want.size);
  let best: { line: string; hits: number } | undefined;
  for (const line of lines.filter(aboutThemselves)) {
    const hits = [...contentWords(line)].filter((w) => want.has(w)).length;
    if (hits >= need && (!best || hits > best.hits)) best = { line, hits };
  }
  return best?.line.replace(/\s+/g, ' ').trim().slice(0, 200);
}

const BANNED = [
  /\bchecking in\b/i,
  /\bcheck(?:ed)? in on you\b/i,
  /\bthinking (?:of|about) you\b/i,
  /\bthought of you\b/i,
  /\bon my mind\b/i,
  /\bno (?:pressure|agenda)\b/i,
  /\bhope (?:you're|you are|all is)\b/i,
  /\bwanted to (?:reach out|see how|say)\b/i,
  /\bi'm (?:here|always here) (?:for you|if)\b/i,
];
const EMOJI = /\p{Extended_Pictographic}/u;
const QUESTION_START =
  /^(?:how|how's|what|what's|did|does|do|is|are|was|were|any|when|where|who|has|have|will|can)\b/i;

/** One short question, none of the stock phrases. */
export function inFerniVoice(text: string): boolean {
  const t = text.trim();
  return (
    t.length <= MAX_CHARS &&
    t.endsWith('?') &&
    (t.match(/\?/g) ?? []).length === 1 &&
    !EMOJI.test(t) &&
    !BANNED.some((re) => re.test(t))
  );
}

/** "How did the demo go?" → "Hey Seth, how did the demo go?", or undefined if it can't be said that way. */
export function composeMessage(question: string, name?: string): string | undefined {
  const q = question.replace(/\s+/g, ' ').trim();
  const body = QUESTION_START.test(q) ? q.charAt(0).toLowerCase() + q.slice(1) : q;
  const message = /^(?:hey|hi)\b/i.test(q) ? q : `Hey${name ? ` ${name}` : ''}, ${body}`;
  return inFerniVoice(message) ? message : undefined;
}

function localDay(at: Date | number, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(at);
}

/** Wall-clock minutes since the epoch, as seen in timezone. */
function wallMs(at: number, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(at);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
}

/** The instant `day` at `hour` happens in timezone (two passes settle a DST change). */
export function atLocal(day: string, hour: number, timezone: string): Date {
  const [year, month, d] = day.split('-').map(Number);
  const wall = Date.UTC(year, month - 1, d, hour, 0);
  let guess = wall;
  for (let i = 0; i < 2; i++) guess += wall - wallMs(guess, timezone);
  return new Date(guess);
}

function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** When to send it, or why not. */
export function sendTimeFor(item: CheckInItem, call: SourceCall, ctx: PlanContext): Date | string {
  const { now, timezone: tz, lastTalkedAt } = ctx;
  const horizon = now.getTime() + (ctx.horizonDays ?? HORIZON_DAYS) * DAY_MS;
  let at: Date;
  if (item.when) {
    if (item.when < call.date) return 'dated before the call it came from';
    at = atLocal(item.when, SEND_HOUR, tz);
    if (lastTalkedAt !== undefined && lastTalkedAt >= at.getTime()) {
      return 'talked since, so it is for the call';
    }
  } else {
    const last = Math.max(lastTalkedAt ?? 0, call.endedAt);
    at = atLocal(addDays(localDay(last, tz), UNDATED_GAP_DAYS), SEND_HOUR, tz);
  }
  if (at.getTime() < now.getTime()) {
    if (now.getTime() - at.getTime() >= DAY_MS) return 'the moment passed';
    at = now;
  }
  if (at.getTime() > horizon) return 'not this week';
  if (justTalked(lastTalkedAt, at.getTime())) {
    return `talked in the last ${JUST_TALKED_HOURS} hours`;
  }
  return at;
}

export interface Plan {
  planned: PlannedCheckIn[];
  dropped: Array<{ id: string; text: string; why: string }>;
}

/** The check-ins worth sending in the coming week, soonest first, and why the rest aren't. */
export function planCheckIns(items: readonly CheckInItem[], ctx: PlanContext): Plan {
  const plan: Plan = { planned: [], dropped: [] };
  const drop = (i: CheckInItem, why: string): number =>
    plan.dropped.push({ id: i.id, text: i.text, why });
  const timed: Array<{
    item: CheckInItem;
    call: SourceCall;
    at: Date;
    quote: string;
    message: string;
  }> = [];
  for (const item of items) {
    const call = ctx.calls.get(item.basis);
    const quote = call && groundingQuote(item.text, call.userLines);
    if (!call || !quote) {
      drop(item, 'no quote from the caller');
      continue;
    }
    const message = composeMessage(item.text, ctx.name);
    if (!message) {
      drop(item, "not one short question in Ferni's voice");
      continue;
    }
    const at = sendTimeFor(item, call, ctx);
    if (typeof at === 'string') drop(item, at);
    else timed.push({ item, call, at, quote, message });
  }
  timed.sort((a, b) => a.at.getTime() - b.at.getTime());
  for (const t of timed) {
    const all = [...ctx.sent, ...plan.planned.map((p) => p.sendAt)];
    if (all.some((s) => localDay(s, ctx.timezone) === localDay(t.at, ctx.timezone))) {
      drop(t.item, 'one a day');
    } else if (
      all.filter((s) => Math.abs(t.at.getTime() - s.getTime()) < 7 * DAY_MS).length >= WEEKLY_CAP
    ) {
      drop(t.item, 'weekly cap');
    } else {
      plan.planned.push({
        id: t.item.id,
        message: t.message,
        sendAt: t.at,
        quote: t.quote,
        callDate: t.call.date,
        ...(t.item.when && { when: t.item.when }),
      });
    }
  }
  return plan;
}

/** The planned check-ins due now (within a day of their time). */
export function dueNow(planned: readonly PlannedCheckIn[], now: Date): PlannedCheckIn[] {
  return planned.filter((p) => p.sendAt <= now && now.getTime() - p.sendAt.getTime() < DAY_MS);
}

/**
 * The one follow-up thread Ferni would raise on the caller's next call, or none
 * and the gate that stopped him (right-moment program B1, plan §4, §8, §8b).
 * Gates run in this order. Holds empty the list before any candidate is scored;
 * a hold that could not be read counts as held.
 *
 * - G1 crisis, G2 minor-care, G3 hold (opt-out, STOP, DV): stop the plan.
 * - G4 forgotten: stops the plan when the list is unreadable, else drops that candidate.
 * - Candidates: G5 not-callers-own (Ferni's promise, a read-back action), G6
 *   premature (event not over in the caller's zone), G7 stale (not open, or
 *   rightMoment says expire), G8 asked-48h (it or its topic raised in 48 h, or
 *   still snoozed or backing off).
 * - Cadence, the plan waits: G9 every-other-call (the call that just ended had
 *   a Ferni-started ask), G10 weekly-cap (asks in 7 days reach
 *   weeklyAskBudget), G11 heavy-wait (a heavy or sensitive thread under 7 days old).
 *
 * G6 reads `eventAt` at its precision: 'time' must have passed, 'day' and
 * 'week' the end of that day or week (weeks start Monday). With no `eventAt`
 * the `dueAt` must have passed; an undated thread passes. Survivors rank as the
 * opener ranks them; call news (the hello's own pick) wins at runtime, in B3.
 *
 * The plan names a follow-up and nothing else: no time to act, no channel, so
 * it can neither schedule nor send, and it is for the next call, which the
 * caller starts, so quiet hours and the night window hold by construction.
 * Pure: no IO, no clock, no flags.
 *
 * @module services/follow-through/arbiter
 */
import { weeklyAskBudget, type Appetite } from './appetite.js';
import { byOpenerOrder, isCallersOwn } from './askable.js';
import type { FollowUp } from './follow-up.js';
import { rightMoment } from './right-moment.js';
import { wallTimeIn, zonedWallTimeToUtc } from '../../utils/time-zone.js';

export const GATE_IDS = [
  'crisis',
  'minor-care',
  'hold',
  'forgotten',
  'not-callers-own',
  'premature',
  'stale',
  'asked-48h',
  'every-other-call',
  'weekly-cap',
  'heavy-wait',
] as const;
export type GateId = (typeof GATE_IDS)[number];

/** One time Ferni raised or asked a follow-up (follow-up.ts `surfaced` and `asks`). */
export interface AskEvent {
  readonly followUpId: string;
  readonly topicKey?: string;
  readonly at: string;
}

/** crisis, minorCare and held are true when a read failed. forgotten is null when unreadable. */
export interface ArbiterInput {
  readonly crisis: boolean;
  readonly minorCare: boolean;
  readonly held: boolean;
  readonly forgotten: ((text: string) => boolean) | null;
  readonly candidates: readonly FollowUp[];
  /** Every ask or raise of the caller's follow-ups in at least the last 7 days. */
  readonly asks: readonly AskEvent[];
  readonly callStartedAt: Date;
  readonly appetite: Appetite;
}

export interface ThreadPlan {
  readonly pick: FollowUp | null;
  readonly blockedBy: GateId | null;
  readonly dropped: Partial<Record<GateId, number>>;
}
/** Which candidate gate drops a follow-up, or null when it survives. */
export type CandidateScorer = (f: FollowUp, input: ArbiterInput, now: Date) => GateId | null;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const ASKED_WITHIN_MS = 48 * HOUR_MS;
export const WEEK_MS = 7 * DAY_MS;
const HEAVY_WAIT_MS = 7 * DAY_MS;
const after = (iso: string | undefined | null, now: Date): boolean =>
  !!iso && Date.parse(iso) > now.getTime();

/** The instant the thing has surely happened by, in the follow-up's zone; null when undated. */
function eventOverAt(f: FollowUp): Date | null {
  if (!f.eventAt || f.eventPrecision === 'none') return f.dueAt ? new Date(f.dueAt) : null;
  const at = new Date(f.eventAt);
  if (f.eventPrecision !== 'day' && f.eventPrecision !== 'week') return at;
  const { year, month, day } = wallTimeIn(at, f.zone);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sunday
  const days = f.eventPrecision === 'day' ? 1 : (8 - weekday) % 7 || 7; // to the next Monday
  return zonedWallTimeToUtc({ year, month, day: day + days, hour: 0, minute: 0 }, f.zone);
}
const sameThread = (a: AskEvent, f: FollowUp): boolean =>
  a.followUpId === f.id || (!!f.topicKey && a.topicKey === f.topicKey);

/** G4 to G8 for one candidate. */
export const scoreCandidate: CandidateScorer = (f, input, now) => {
  if (input.forgotten?.(f.text)) return 'forgotten';
  if (!isCallersOwn(f) || f.owner === 'ferni') return 'not-callers-own';
  const over = eventOverAt(f);
  if (over && over.getTime() > now.getTime()) return 'premature';
  if (f.status !== 'open' || rightMoment(f, now) === 'expire') return 'stale';
  const recent = input.asks.some(
    (a) => sameThread(a, f) && now.getTime() - Date.parse(a.at) < ASKED_WITHIN_MS
  );
  if (recent || after(f.snoozedUntil, now) || after(f.nextEligibleAt, now)) return 'asked-48h';
  return null;
};

const isHeavy = (f: FollowUp): boolean =>
  f.salience?.heavy === true || f.salience?.sensitive === true;

/** G9 to G11: whether the whole plan waits. */
function cadenceGate(input: ArbiterInput, now: Date): GateId | null {
  const at = (a: AskEvent): number => Date.parse(a.at);
  if (input.asks.some((a) => at(a) >= input.callStartedAt.getTime())) return 'every-other-call';
  const thisWeek = input.asks.filter((a) => now.getTime() - at(a) < WEEK_MS).length;
  if (thisWeek >= weeklyAskBudget(input.appetite)) return 'weekly-cap';
  const young = (f: FollowUp): boolean => now.getTime() - Date.parse(f.createdAt) < HEAVY_WAIT_MS;
  if (input.candidates.some((f) => isHeavy(f) && young(f))) return 'heavy-wait';
  return null;
}

const HOLDS: ReadonlyArray<[GateId, (input: ArbiterInput) => boolean]> = [
  ['crisis', (i) => i.crisis],
  ['minor-care', (i) => i.minorCare],
  ['hold', (i) => i.held],
  ['forgotten', (i) => i.forgotten === null],
];

/** The next call's one thread. `score` is a parameter so a test can prove holds run first. */
export function pickThread(input: ArbiterInput, now: Date, score = scoreCandidate): ThreadPlan {
  const hold = HOLDS.find(([, held]) => held(input));
  if (hold) return { pick: null, blockedBy: hold[0], dropped: {} };
  const dropped: Partial<Record<GateId, number>> = {};
  const survivors = input.candidates.filter((f) => {
    const gate = score(f, input, now);
    if (gate) dropped[gate] = (dropped[gate] ?? 0) + 1;
    return gate === null;
  });
  if (survivors.length === 0) return { pick: null, blockedBy: null, dropped };
  const waits = cadenceGate(input, now);
  if (waits) return { pick: null, blockedBy: waits, dropped };
  return { pick: [...survivors].sort(byOpenerOrder)[0], blockedBy: null, dropped };
}

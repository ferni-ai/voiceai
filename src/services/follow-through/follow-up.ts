/**
 * A follow-up: one thing Ferni should follow through on for a person, and the
 * rules for how it moves from open to closed.
 *
 * Reminders, commitments, Ferni's own promises, threads from the last call,
 * dates and doses each kept their own record, and almost none of them ever
 * came back (docs/plans/2026-10-12-follow-through.md). Here they are one
 * record with one life: open, raised once at the right moment (surfaced), then
 * done, released or expired. A repeating follow-up goes back to open with its
 * next due time when it's done.
 *
 * Pure: no storage, no clock, no flags. The caller passes `now`.
 *
 * @module services/follow-through/follow-up
 */

import { failure, success, type Result } from '../../types/result.js';
import { wallTimeIn, zonedWallTimeToUtc } from '../../utils/time-zone.js';

export type FollowUpKind = 'reminder' | 'commitment' | 'promise' | 'thread' | 'date' | 'dose';
export type FollowUpStatus = 'open' | 'surfaced' | 'done' | 'released' | 'expired';
export type SurfacedVia = 'opener' | 'in-call' | 'text';

/**
 * Something Ferni read back to do for the caller, a call or a text
 * (outreach-confirm.ts). `waitingOn: 'you'` while it waits for the caller's
 * yes; gone once it was sent or dropped.
 */
export interface FollowUpAction {
  /** The tool that would act, e.g. callOnBehalf or reachOut. */
  readonly tool: string;
  /** The saved contact it goes to. Never the number itself. */
  readonly contactId?: string;
  readonly waitingOn?: 'you';
  /** After the yes: the tool ran and said it sent, said it didn't, or said nothing we can read. */
  readonly outcome?: 'sent' | 'failed' | 'unknown';
}

/** Repeats at `at` ("08:00") in the follow-up's zone. */
export interface Repeat {
  readonly every: 'day' | 'week' | 'year';
  readonly at: string;
}

export interface FollowUp {
  readonly id: string;
  readonly userId: string;
  readonly kind: FollowUpKind;
  /** What to bring up, in the caller's words where we have them. */
  readonly text: string;
  /** UTC ISO instant, or null for "the next good moment". */
  readonly dueAt: string | null;
  /** The caller's IANA zone. */
  readonly zone: string;
  readonly repeat: Repeat | null;
  /** Where it came from, so an import never makes it twice. */
  readonly source: { readonly store: string; readonly ref: string };
  readonly status: FollowUpStatus;
  readonly surfaced: ReadonlyArray<{ readonly at: string; readonly via: SurfacedVia }>;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly closedAt?: string;
  /** Why it was released, when a rule (not the person's answer) closed it. */
  readonly closedReason?: CloseReason;
  readonly action?: FollowUpAction;

  // Follow-up brain fields (follow-up brain design §2.2). All optional: rows
  // written before them still parse, and nothing on a live path reads them yet.
  /** Canonical topic ("interview sister"): the merge key across sources. */
  readonly topicKey?: string;
  /** Every source that proposed it, once two merged; the id stays the first one's. */
  readonly sources?: ReadonlyArray<{ readonly store: string; readonly ref: string }>;
  /** When the thing happens or happened (UTC ISO), apart from dueAt (when to ask). */
  readonly eventAt?: string | null;
  readonly eventPrecision?: EventPrecision;
  readonly askType?: AskType;
  readonly salience?: Salience;
  /** 'ferni': a promise-ledger row, told and never asked. */
  readonly owner?: 'caller' | 'ferni';
  /** Each time Ferni actually asked it, and what the caller said. */
  readonly asks?: readonly Ask[];
  /** Open but not to be asked before this instant. */
  readonly snoozedUntil?: string;
  /** Spacing and backoff after an answer: not asked again before this instant. */
  readonly nextEligibleAt?: string;
}

export const EVENT_PRECISIONS = ['time', 'day', 'week', 'none'] as const;
export type EventPrecision = (typeof EVENT_PRECISIONS)[number];
export const ASK_TYPES = [
  'how-did-it-go',
  'how-is-it-going',
  'good-luck',
  'how-do-you-feel',
  'tell-outcome',
] as const;
export type AskType = (typeof ASK_TYPES)[number];
export const ASK_ANSWERS = [
  'done',
  'not-yet',
  'dodge',
  'irritated',
  'already-discussed',
  'forget',
  'cancelled',
  'none',
] as const;
export type AskAnswer = (typeof ASK_ANSWERS)[number];
export const VALENCES = ['good', 'bad', 'mixed'] as const;
export type Valence = (typeof VALENCES)[number];

export interface Salience {
  /** 0..1: how much a friend would remember to ask. */
  readonly weight: number;
  readonly heavy: boolean;
  readonly sensitive: boolean;
  readonly by: 'llm' | 'rule';
  readonly v: number;
}

export interface Ask {
  readonly at: string;
  readonly via: SurfacedVia;
  readonly personaId: string;
  readonly sessionId: string;
  readonly answer?: AskAnswer;
  /** "done" is not "went well". */
  readonly valence?: Valence;
  readonly answeredAt?: string;
  readonly by?: 'live' | 'llm';
}

/**
 * Why a rule or an answer closed it. forgotten: the person asked Ferni to
 * forget what it is about (memory/recall/forget.ts). The rest come from the
 * caller's answer to an ask (answer() below) or, later, the arbiter.
 */
export const CLOSE_REASONS = [
  'forgotten',
  'answered-done',
  'not-doing',
  'already-discussed',
  'irritated',
  'dodged-twice',
  'not-yet-x3',
  'stale',
  'crisis',
  'mentioned-unprompted',
] as const;
export type CloseReason = (typeof CLOSE_REASONS)[number];

export type FollowUpEvent =
  | { readonly type: 'surface'; readonly via: SurfacedVia }
  | { readonly type: 'done' }
  | { readonly type: 'replan'; readonly dueAt: string }
  | { readonly type: 'release'; readonly reason?: CloseReason }
  | { readonly type: 'expire' };

const CLOSED: ReadonlySet<FollowUpStatus> = new Set(['done', 'released', 'expired']);

export const isClosed = (f: FollowUp): boolean => CLOSED.has(f.status);

/** The first time `repeat` comes round strictly after `after`, in `zone`. */
export function nextOccurrence(repeat: Repeat, zone: string, after: Date): Date {
  const [hour, minute] = repeat.at.split(':').map(Number);
  let { year, month, day } = wallTimeIn(after, zone);
  for (let i = 0; i < 3; i++) {
    const at = zonedWallTimeToUtc({ year, month, day, hour, minute }, zone);
    if (at.getTime() > after.getTime()) return at;
    ({ year, month, day } = stepDay(year, month, day, repeat.every));
  }
  return zonedWallTimeToUtc({ year, month, day, hour, minute }, zone);
}

/** The calendar day one step on. A yearly 29 February falls on the 28th. */
function stepDay(
  y: number,
  m: number,
  d: number,
  every: Repeat['every']
): { year: number; month: number; day: number } {
  if (every === 'year') {
    const last = new Date(Date.UTC(y + 1, m, 0)).getUTCDate();
    return { year: y + 1, month: m, day: Math.min(d, last) };
  }
  const next = new Date(Date.UTC(y, m - 1, d + (every === 'week' ? 7 : 1)));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

/**
 * The follow-up after `event` at `now`, or why it can't happen. A closed
 * follow-up takes no more events.
 */
export function apply(f: FollowUp, event: FollowUpEvent, now: Date): Result<FollowUp, string> {
  if (isClosed(f)) return failure(`follow-up ${f.id} is already ${f.status}`);
  const at = now.toISOString();
  const touched = { ...f, updatedAt: at };
  switch (event.type) {
    case 'surface':
      return success({
        ...touched,
        status: 'surfaced',
        surfaced: [...f.surfaced, { at, via: event.via }],
      });
    case 'done':
      if (f.repeat) {
        const next = nextOccurrence(f.repeat, f.zone, now);
        return success({ ...touched, status: 'open', dueAt: next.toISOString() });
      }
      return success({ ...touched, status: 'done', closedAt: at });
    case 'replan':
      if (Number.isNaN(Date.parse(event.dueAt))) return failure(`bad dueAt ${event.dueAt}`);
      return success({ ...touched, status: 'open', dueAt: event.dueAt });
    case 'release':
      return success({
        ...touched,
        status: 'released',
        closedAt: at,
        ...(event.reason ? { closedReason: event.reason } : {}),
      });
    case 'expire':
      return success({ ...touched, status: 'expired', closedAt: at });
  }
}

// ---------------------------------------------------------------------------
// Asking (follow-up brain design §2.2, §3.3). Dormant: nothing calls these yet.
// `surfaced` keeps meaning "raised" for the readers that exist; an ask is only
// what Ferni actually said, and it is recorded in both.
// ---------------------------------------------------------------------------

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** Never the same topic twice within this long, whatever the answer (Seth, 2026-10-18). */
export const ASK_SPACING_MS = 48 * HOUR_MS;

export interface AskInput {
  readonly via: SurfacedVia;
  readonly personaId: string;
  readonly sessionId: string;
}

export interface AnswerInput {
  readonly answer: AskAnswer;
  readonly valence?: Valence;
  readonly by: 'live' | 'llm';
  /** The time they gave for a "not yet" ("next week"), when it could be read. */
  readonly whenAgain?: string;
}

const later = (iso: string | undefined, now: Date): boolean =>
  iso !== undefined && Date.parse(iso) > now.getTime();
const plus = (now: Date, ms: number): string => new Date(now.getTime() + ms).toISOString();

export const isSnoozed = (f: FollowUp, now: Date): boolean => later(f.snoozedUntil, now);

/** When Ferni last actually asked it, or null if never. */
export function lastAskedAt(f: FollowUp): string | null {
  const asks = f.asks ?? [];
  return asks.length > 0 ? asks[asks.length - 1].at : null;
}

/** True when any row on `topicKey` was asked under `ms` before `now` (the 48 h spacing). */
export function topicAskedWithin(
  rows: readonly FollowUp[],
  topicKey: string,
  now: Date,
  ms: number = ASK_SPACING_MS
): boolean {
  return rows.some((f) => {
    const at = f.topicKey === topicKey ? lastAskedAt(f) : null;
    return at !== null && now.getTime() - Date.parse(at) < ms;
  });
}

/** Why it can't be asked at `now`, or null when it can. */
function askRefusal(f: FollowUp, now: Date): string | null {
  if (isClosed(f)) return `follow-up ${f.id} is already ${f.status}`;
  if (f.owner === 'ferni') return `follow-up ${f.id} is Ferni's own promise: told, never asked`;
  if (isSnoozed(f, now)) return `follow-up ${f.id} is snoozed until ${f.snoozedUntil}`;
  if (later(f.nextEligibleAt, now)) return `follow-up ${f.id} waits until ${f.nextEligibleAt}`;
  const last = lastAskedAt(f);
  if (last !== null && now.getTime() - Date.parse(last) < ASK_SPACING_MS)
    return `follow-up ${f.id} was asked at ${last}, under 48 h ago`;
  return null;
}

/**
 * Ferni asked it, out loud. Refused when it is closed, Ferni's own promise,
 * snoozed, not yet eligible, or asked under 48 h ago.
 */
export function ask(f: FollowUp, input: AskInput, now: Date): Result<FollowUp, string> {
  const refused = askRefusal(f, now);
  if (refused) return failure(refused);
  const at = now.toISOString();
  return success({
    ...f,
    status: 'surfaced',
    updatedAt: at,
    surfaced: [...f.surfaced, { at, via: input.via }],
    asks: [...(f.asks ?? []), { at, ...input }],
  });
}

/** Keeps it open but not asked before `until`. */
export function snooze(f: FollowUp, until: string, now: Date): Result<FollowUp, string> {
  if (isClosed(f)) return failure(`follow-up ${f.id} is already ${f.status}`);
  if (!later(until, now)) return failure(`snooze until ${until} is not a later time`);
  return success({ ...f, status: 'open', snoozedUntil: until, updatedAt: now.toISOString() });
}

const RELEASED_BY: Partial<Record<AskAnswer, CloseReason>> = {
  irritated: 'irritated',
  'already-discussed': 'already-discussed',
  forget: 'forgotten',
  cancelled: 'not-doing',
};

/** Where an answered follow-up goes (§3.3); `times` counts this answer among its asks. */
function settle(base: FollowUp, input: AnswerInput, times: number, now: Date): FollowUp {
  const at = now.toISOString();
  const close = (closedReason: CloseReason, status: FollowUpStatus = 'released'): FollowUp => ({
    ...base,
    status,
    closedAt: at,
    closedReason,
  });
  const reopen = (over: Partial<FollowUp>): FollowUp => ({ ...base, status: 'open', ...over });
  const released = RELEASED_BY[input.answer];
  if (released) return close(released);
  if (input.answer === 'done')
    return base.repeat
      ? reopen({ dueAt: nextOccurrence(base.repeat, base.zone, now).toISOString() })
      : close('answered-done', 'done');
  if (input.answer === 'not-yet') {
    if (times >= 3) return close('not-yet-x3');
    const stated = times === 1 && later(input.whenAgain, now) ? input.whenAgain : undefined;
    return reopen({ snoozedUntil: stated ?? plus(now, (times === 1 ? 3 : 7) * DAY_MS) });
  }
  if (input.answer === 'dodge')
    return times >= 2 ? close('dodged-twice') : reopen({ nextEligibleAt: plus(now, 7 * DAY_MS) });
  // none: they moved on or the call ended; it counts as an ask
  return reopen({ nextEligibleAt: plus(now, 2 * DAY_MS) });
}

/**
 * What the caller said to the last ask, and where that leaves it (§3.3):
 * done closes it (a repeating one comes round again); no answer waits 2 days;
 * not yet snoozes to their time or 3 days, then 7, and a third drops it; a
 * dodge waits 7 days and a second drops it; irritated, already discussed,
 * forget and cancelled release it. Refused when there is no unanswered ask.
 */
export function answer(f: FollowUp, input: AnswerInput, now: Date): Result<FollowUp, string> {
  if (isClosed(f)) return failure(`follow-up ${f.id} is already ${f.status}`);
  const asks = f.asks ?? [];
  const last = asks.at(-1);
  if (!last || last.answer) return failure(`follow-up ${f.id} has no unanswered ask`);
  const at = now.toISOString();
  const all: Ask[] = [
    ...asks.slice(0, -1),
    {
      ...last,
      answer: input.answer,
      answeredAt: at,
      by: input.by,
      ...(input.valence ? { valence: input.valence } : {}),
    },
  ];
  const times = all.filter((a) => a.answer === input.answer).length;
  return success(settle({ ...f, asks: all, updatedAt: at }, input, times, now));
}

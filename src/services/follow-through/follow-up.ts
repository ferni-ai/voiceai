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
  readonly action?: FollowUpAction;
}

export type FollowUpEvent =
  | { readonly type: 'surface'; readonly via: SurfacedVia }
  | { readonly type: 'done' }
  | { readonly type: 'replan'; readonly dueAt: string }
  | { readonly type: 'release' }
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
      return success({ ...touched, status: 'released', closedAt: at });
    case 'expire':
      return success({ ...touched, status: 'expired', closedAt: at });
  }
}

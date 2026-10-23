/**
 * "Ferni's on it" (engagement spec 5.3, PR O1): what Ferni is holding and
 * doing for one person, as the app's four sections, each left out when empty.
 *
 * - waitingOnYou: a call or text Ferni read back that waits on their yes, and
 *   an errand's open question.
 * - doing: open errands, one line from where each one is.
 * - holding: whatFerniHolds (follow-through/holding.ts).
 * - done: follow-ups that closed in the last 7 days, with honest outcomes.
 *
 * A read model over the existing readers only: no store of its own, nothing
 * that can send. Approvals (cards with exact words) need ActionGate and come
 * later (O3); until then nothing here names a recipient or quotes words Ferni
 * would send, and phone numbers and email addresses in any text are blanked.
 * Anything about a topic the person asked Ferni to forget is left out; a
 * forgotten check that throws makes the whole read throw (fail closed).
 * Errand outcomes in done wait on a store read of closed errands (none yet).
 *
 * Pure: the caller passes the rows, the forgotten check and `now`.
 *
 * @module services/on-it/on-it
 */

import { isClosed as errandClosed, type Errand } from '../errands/index.js';
import {
  isClosed,
  whatFerniHolds,
  withoutContactDetails,
  type FollowUp,
} from '../follow-through/index.js';
import {
  ERRAND_PERSONA,
  FOLLOW_UP_PERSONA,
  ON_BEHALF,
  ON_BEHALF_DONE,
  SECTION_TITLE,
  WAITING_ON_YES,
  asLine,
  askDetail,
  closedLine,
  doingDetail,
  holdingDetail,
  slipped,
  type DoingState,
  type OnItPersona,
  type OnItSectionId,
} from './on-it-copy.js';

export type { OnItPersona, OnItSectionId } from './on-it-copy.js';

export const DONE_DAYS = 7;
export const MAX_ROWS = 20;

/** One row as the app shows it. Mapped field by field, never a spread of a stored row. */
export interface OnItRow {
  readonly id: string;
  readonly section: OnItSectionId;
  readonly personaId: OnItPersona;
  readonly line: string;
  readonly detail?: string;
  /** UTC ISO: when it's due, when it picks back up, or when it closed. */
  readonly at?: string;
}

export interface OnItSection {
  readonly id: OnItSectionId;
  readonly title: string;
  readonly rows: readonly OnItRow[];
}

export interface OnItView {
  /** In screen order, only the ones with something in them. */
  readonly sections: readonly OnItSection[];
  readonly asOf: string;
}

export interface OnItInput {
  readonly userId: string;
  /** Their open or surfaced follow-ups. */
  readonly live: readonly FollowUp[];
  /** Follow-ups changed in the last DONE_DAYS days (closed ones are kept). */
  readonly changed: readonly FollowUp[];
  /** Their open errands, or null while errands are off. */
  readonly errands: readonly Errand[] | null;
  /** True for text about a topic they asked Ferni to forget. May throw: the read then throws. */
  readonly forgotten: (text: string) => boolean;
  readonly now: Date;
}

const ORDER: readonly OnItSectionId[] = ['waitingOnYou', 'doing', 'holding', 'done'];
const CLOSED = new Set(['done', 'released', 'expired'] as const);
type ClosedStatus = 'done' | 'released' | 'expired';
const isClosedStatus = (s: string): s is ClosedStatus => CLOSED.has(s as ClosedStatus);
/** Candidates still worth trying: not yet reached, or due another go. */
const UNTRIED = new Set(['new', 'lookup', 'retry']);

const waitsOnYou = (f: FollowUp): boolean => f.action?.waitingOn === 'you';
const isCall = (f: FollowUp): boolean => /call/i.test(f.action?.tool ?? '');

function waitingRow(f: FollowUp): OnItRow {
  return {
    id: `follow-up:${f.id}`,
    section: 'waitingOnYou',
    personaId: FOLLOW_UP_PERSONA[f.kind],
    line: isCall(f) ? ON_BEHALF.call : ON_BEHALF.text,
    detail: WAITING_ON_YES,
  };
}

function errandRow(e: Errand): OnItRow {
  const personaId = ERRAND_PERSONA[e.kind];
  const base = { id: `errand:${e.id}`, personaId, line: asLine(withoutContactDetails(e.goal)) };
  if (e.pending) {
    return {
      ...base,
      section: 'waitingOnYou',
      detail: askDetail(e.pending.action.verb, personaId),
    };
  }
  const state = e.state as DoingState; // closed errands were filtered out before
  const left = e.candidates.filter((c) => UNTRIED.has(c.status)).length;
  return {
    ...base,
    section: 'doing',
    detail: doingDetail(state, personaId, left),
    ...(state === 'scheduled' && e.nextWakeAt ? { at: e.nextWakeAt } : {}),
  };
}

function doneLine(f: FollowUp, status: ClosedStatus): string {
  if (!f.action && f.source.store !== 'outreach_confirm') {
    return closedLine(status, withoutContactDetails(f.text));
  }
  // A plain release with no rule's reason is the person's no to the read-back (confirm-thread.ts)
  if (status === 'released') return f.closedReason ? ON_BEHALF_DONE.held : ON_BEHALF_DONE.notSent;
  if (status === 'expired') return ON_BEHALF_DONE.passed;
  const outcome = f.action?.outcome;
  if (outcome === 'sent') return isCall(f) ? ON_BEHALF_DONE.sentCall : ON_BEHALF_DONE.sentText;
  return outcome === 'failed' ? ON_BEHALF_DONE.failed : ON_BEHALF_DONE.unknown;
}

const closedAt = (f: FollowUp): string => f.closedAt ?? f.updatedAt;

/** What Ferni is holding and doing for `userId`, as the app's sections. */
export function buildOnIt(input: OnItInput): OnItView {
  const { userId, forgotten, now } = input;
  // The stores read under bogle_users/{userId}; this keeps a stray row from ever leaking.
  const keep = (f: FollowUp): boolean => f.userId === userId && !forgotten(f.text);
  const live = input.live.filter((f) => f.userId === userId && !isClosed(f));
  const errands = (input.errands ?? []).filter(
    (e) => e.userId === userId && !errandClosed(e) && !forgotten(e.goal)
  );
  const errandRows = errands.map(errandRow);
  const since = now.getTime() - DONE_DAYS * 86_400_000;

  const rows: Record<OnItSectionId, OnItRow[]> = {
    waitingOnYou: [
      ...live.filter((f) => waitsOnYou(f) && keep(f)).map(waitingRow),
      ...errandRows.filter((r) => r.section === 'waitingOnYou'),
    ],
    doing: errandRows.filter((r) => r.section === 'doing'),
    holding: whatFerniHolds(
      userId,
      live.filter((f) => !waitsOnYou(f)),
      forgotten,
      now
    ).items.map((h): OnItRow => ({
      id: `follow-up:${h.id}`,
      section: 'holding',
      personaId: FOLLOW_UP_PERSONA[h.kind],
      line: h.slipped ? slipped(h.text) : asLine(h.text),
      ...(h.slipped ? {} : { detail: holdingDetail(h.kind) }),
      ...(h.dueAt ? { at: h.dueAt } : {}),
    })),
    done: input.changed
      .filter((f) => isClosedStatus(f.status) && Date.parse(closedAt(f)) >= since && keep(f))
      .sort((a, b) => closedAt(b).localeCompare(closedAt(a)))
      .map((f) => ({
        id: `follow-up:${f.id}`,
        section: 'done' as const,
        personaId: FOLLOW_UP_PERSONA[f.kind],
        line: doneLine(f, f.status as ClosedStatus),
        at: closedAt(f),
      })),
  };

  return {
    sections: ORDER.filter((id) => rows[id].length > 0).map((id) => ({
      id,
      title: SECTION_TITLE[id],
      rows: rows[id].slice(0, MAX_ROWS),
    })),
    asOf: now.toISOString(),
  };
}

/**
 * "Ferni's on it" (engagement spec 5.3, O1): what Ferni is holding and doing
 * for one person, as the app's sections, empty ones left out. Read only, over
 * the existing readers. In-app only, behind sign-in and Memory Lock (spec 5.5):
 * the person's own words show as they said them, names included, because a
 * list that says "call someone" helps no one. Numbers and emails are blanked,
 * and calls or texts Ferni makes for them use fixed copy: until approval cards
 * (O3, ActionGate) nothing names a recipient or quotes words Ferni would send.
 * Never feed this view to a push, widget, Live Activity or Spotlight as is.
 * Forgotten topics are left out, and a forgotten check that throws makes the
 * read throw. Errand outcomes wait on a read of closed errands (none yet).
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
  HOLDING,
  ON_BEHALF,
  ON_BEHALF_DONE,
  SECTION_TITLE,
  asLine,
  askDetail,
  closedLine,
  doingDetail,
  slipped,
  type ClosedStatus,
  type DoingState,
  type OnItPersona,
  type OnItSectionId,
} from './on-it-copy.js';

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

export interface OnItView {
  readonly sections: ReadonlyArray<{ id: OnItSectionId; title: string; rows: OnItRow[] }>;
  readonly asOf: string;
}

export interface OnItInput {
  readonly userId: string;
  /** Open or surfaced follow-ups. */
  readonly live: readonly FollowUp[];
  /** Follow-ups changed in the last DONE_DAYS days. */
  readonly changed: readonly FollowUp[];
  /** Open errands, or null while errands are off. */
  readonly errands: readonly Errand[] | null;
  /** True for text about a forgotten topic. May throw: the read then throws. */
  readonly forgotten: (text: string) => boolean;
  readonly now: Date;
}

const ORDER: readonly OnItSectionId[] = ['waitingOnYou', 'doing', 'holding', 'done'];
const CLOSED: ReadonlySet<string> = new Set(['done', 'released', 'expired']);
/** Places still worth trying: not reached yet, or due another go. */
const UNTRIED: ReadonlySet<string> = new Set(['new', 'lookup', 'retry']);

const waitsOnYou = (f: FollowUp): boolean => f.action?.waitingOn === 'you';
const isCall = (f: FollowUp): boolean => /call/i.test(f.action?.tool ?? '');
const closedAt = (f: FollowUp): string => f.closedAt ?? f.updatedAt;
const fuRow = (
  f: Pick<FollowUp, 'id' | 'kind'>,
  section: OnItSectionId,
  line: string,
  more: Pick<OnItRow, 'detail' | 'at'> = {}
): OnItRow => ({
  id: `follow-up:${f.id}`,
  section,
  personaId: FOLLOW_UP_PERSONA[f.kind],
  line,
  ...more,
});

function errandRow(e: Errand): OnItRow {
  const personaId = ERRAND_PERSONA[e.kind];
  const base = { id: `errand:${e.id}`, personaId, line: asLine(withoutContactDetails(e.goal)) };
  const verb = e.pending?.action.verb;
  if (verb) return { ...base, section: 'waitingOnYou', detail: askDetail(verb, personaId) };
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
  // A release with no rule's reason is the person's no to the read-back (confirm-thread.ts)
  if (status === 'released') return f.closedReason ? ON_BEHALF_DONE.held : ON_BEHALF_DONE.notSent;
  if (status === 'expired') return ON_BEHALF_DONE.passed;
  const outcome = f.action?.outcome;
  if (outcome === 'sent') return isCall(f) ? ON_BEHALF_DONE.sentCall : ON_BEHALF_DONE.sentText;
  return outcome === 'failed' ? ON_BEHALF_DONE.failed : ON_BEHALF_DONE.unknown;
}

/** What Ferni is holding and doing for `userId`, as the app's sections. */
export function buildOnIt(input: OnItInput): OnItView {
  const { userId, forgotten, now } = input;
  // The stores read under bogle_users/{userId}; this keeps a stray row from ever leaking.
  const keep = (f: FollowUp): boolean => f.userId === userId && !forgotten(f.text);
  const live = input.live.filter((f) => f.userId === userId && !isClosed(f));
  const errandRows = (input.errands ?? [])
    .filter((e) => e.userId === userId && !errandClosed(e) && !forgotten(e.goal))
    .map(errandRow);
  const since = now.getTime() - DONE_DAYS * 86_400_000;
  const notWaiting = live.filter((f) => !waitsOnYou(f));
  const held = whatFerniHolds(userId, notWaiting, forgotten, now).items;

  const rows: Record<OnItSectionId, OnItRow[]> = {
    waitingOnYou: [
      ...live
        .filter((f) => waitsOnYou(f) && keep(f))
        .map((f) =>
          fuRow(f, 'waitingOnYou', isCall(f) ? ON_BEHALF.call : ON_BEHALF.text, {
            detail: ON_BEHALF.waiting,
          })
        ),
      ...errandRows.filter((r) => r.section === 'waitingOnYou'),
    ],
    doing: errandRows.filter((r) => r.section === 'doing'),
    holding: held.map((h) =>
      fuRow(h, 'holding', h.slipped ? slipped(h.text) : asLine(h.text), {
        ...(h.slipped ? {} : { detail: HOLDING[h.kind] }),
        ...(h.dueAt ? { at: h.dueAt } : {}),
      })
    ),
    done: input.changed
      .filter((f) => CLOSED.has(f.status) && Date.parse(closedAt(f)) >= since && keep(f))
      .sort((a, b) => closedAt(b).localeCompare(closedAt(a)))
      .map((f) => fuRow(f, 'done', doneLine(f, f.status as ClosedStatus), { at: closedAt(f) })),
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

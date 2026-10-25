/**
 * Reading what the world reports about places, for every rules version: who
 * may be called, how often a number was called, what a search found and what
 * a call settled. Pure.
 *
 * @module services/errands/candidates
 */

import {
  isSafePlaceId,
  type Candidate,
  type Errand,
  type NewCandidate,
  type Outcome,
  type Signal,
} from './errand.js';

/** Only a looked-up landline or VoIP line is ever called. */
export const callable = (c: Candidate): boolean =>
  c.lineChecked === true && (c.lineType === 'landline' || c.lineType === 'voip');

/** Every call placed to this number, from any place that shares it. */
export const dialsTo = (e: Errand, phone: string): string[] =>
  e.candidates.flatMap((c) => (c.phone === phone ? (c.dials ?? []) : []));

/**
 * New places from a search, as fresh candidates, and how many were dropped.
 * A place id that could read as a separator is dropped, and so is any line
 * type the search claims: only a lookup says what kind of line it is.
 */
export function shortlist(
  known: readonly Candidate[],
  found: readonly NewCandidate[]
): { added: Candidate[]; unsafe: number } {
  const seen = new Set(known.map((c) => c.placeId));
  const added: Candidate[] = [];
  let unsafe = 0;
  for (const { placeId, name, phone, why, hours } of found) {
    if (!isSafePlaceId(placeId)) unsafe++;
    else if (!seen.has(placeId)) {
      seen.add(placeId);
      const fresh = { placeId, name, phone, why, ...(hours ? { hours } : {}) };
      added.push({ ...fresh, status: 'new', attempts: 0, lineChecked: false });
    }
  }
  return { added, unsafe };
}

type CallOutcome = Extract<Signal, { type: 'call_outcome' }>;

/** What a call settled, minus its status. A blank confirmation counts as none. */
export function agreed(s: CallOutcome): Omit<Outcome, 'status'> {
  return {
    placeId: s.placeId,
    ...(s.when ? { when: s.when } : {}),
    ...(s.confirmation?.trim() ? { confirmation: s.confirmation.trim() } : {}),
    ...(s.contactName ? { contactName: s.contactName } : {}),
    ...(s.readBack !== undefined ? { readBack: s.readBack } : {}),
    ...(s.callId ? { evidence: s.callId } : {}),
  };
}

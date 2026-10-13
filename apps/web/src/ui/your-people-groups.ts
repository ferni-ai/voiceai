/**
 * Your People groups and loading
 *
 * The list is grouped under one heading per relationship. A relationship with no heading
 * of its own goes under "Other": the list used to drop those people, so every
 * "professional" contact (a doctor, a lawyer) vanished from the panel.
 */

import { t } from '../i18n/index.js';

/** How long the panel waits for an answer before showing the error state */
export const PEOPLE_LOAD_TIMEOUT_MS = 10_000;

/** Group headings in display order; relationship ids map to a heading key. */
const GROUP_HEADINGS: ReadonlyArray<readonly [string, string]> = [
  ['family', 'yourPeople.groups.family'],
  ['friend', 'yourPeople.groups.friends'],
  ['colleague', 'yourPeople.groups.work'],
  ['professional', 'yourPeople.groups.professional'],
  ['mentor', 'yourPeople.groups.mentor'],
  ['acquaintance', 'yourPeople.groups.acquaintance'],
  ['other', 'yourPeople.groups.misc'],
];
const HEADED = new Set(GROUP_HEADINGS.map(([id]) => id));

/** The heading a person is listed under: their relationship's, or "other" */
function headingId(relationship: string | undefined): string {
  const id = (relationship || 'other').toLowerCase();
  return HEADED.has(id) ? id : 'other';
}

export function groupByRelationship<P extends { relationship?: string }>(
  people: P[]
): Array<[string, P[]]> {
  return GROUP_HEADINGS.map(([id, key]): [string, P[]] => [
    t(key),
    people.filter((person) => headingId(person.relationship) === id),
  ]).filter(([, members]) => members.length > 0);
}

/** The answer, or a rejection once `ms` pass first, so the loading state always ends */
export function settleWithin<T>(promise: Promise<T>, ms = PEOPLE_LOAD_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`No answer within ${ms} ms`)), ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

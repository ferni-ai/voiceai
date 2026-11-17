/**
 * Whether a caught phrase names a place or an organisation ("Denver", "New York", "Acme"),
 * as said. Shared by the small-detail tracker and fast capture (#4028).
 *
 * Pure: no I/O.
 *
 * @module memory/domain/place-name
 */

import { relationOf } from './person-key.js';
import { CLAUSE_WORDS, NOT_A_NAME } from './person-name.js';

/** Months and times of day or year: when something happens, not where. */
const CALENDAR = new Set(
  'january february march april may june july august september october november december tonight noon midnight weekend'.split(
    ' '
  )
);

/**
 * The phrase as a place or organisation name, or null: capitalised as said, not a relation
 * ("Mom"), and not only clause, weekday, month or pronoun words. "up to Friday", "in March"
 * and "from work" are no place; "New York" keeps its "New".
 */
export function properNameAsSaid(phrase: string | undefined): string | null {
  const said = phrase?.trim();
  if (!said || !/^\p{Lu}/u.test(said) || relationOf(said)) return null;
  const words = said.toLowerCase().split(/\s+/);
  return words.every((w) => CLAUSE_WORDS.has(w) || NOT_A_NAME.has(w) || CALENDAR.has(w))
    ? null
    : said;
}

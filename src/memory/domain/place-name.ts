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
 * Places said as capitals. A fixed list, never "any capitals": that saved "AA" (from "in AA
 * meetings"), "ICU", "HR" and "OK" as places (#4029, #4034). No "US": properNameAsSaid reads
 * it as the pronoun "us", so it could never be saved ("USA" is).
 */
const PLACE_ABBREVIATIONS = ['NYC', 'LA', 'SF', 'DC', 'UK', 'USA', 'UAE', 'NOLA'];

/** One word of a place, as regex source: capitalised ("Denver") or a listed abbreviation, whole. */
const PLACE_WORD = `(?:[A-Z][a-z]+|(?:${PLACE_ABBREVIATIONS.join('|')})(?![A-Za-z]))`;

/** A place of one or two words after `cues` (regex source), captured as group 1. Case-sensitive. */
export function placeAfter(cues: string): RegExp {
  return new RegExp(String.raw`\b(?:${cues})\s+(${PLACE_WORD}(?:\s+${PLACE_WORD})?)\b`, 'g');
}

/**
 * The phrase as a place or organisation name, or null: capitalised as said, not a relation
 * ("Mom"), and not only clause, weekday, month or pronoun words. "up to Friday", "in March"
 * and "from work" are no place; "New York" keeps its "New". Capitals pass ("IBM" is a
 * company): which ones can be a place is up to `placeAfter`, not this check.
 */
export function properNameAsSaid(phrase: string | undefined): string | null {
  const said = phrase?.trim();
  if (!said || !/^\p{Lu}/u.test(said) || relationOf(said)) return null;
  const words = said.toLowerCase().split(/\s+/);
  return words.every((w) => CLAUSE_WORDS.has(w) || NOT_A_NAME.has(w) || CALENDAR.has(w))
    ? null
    : said;
}

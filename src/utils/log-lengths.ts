/**
 * Lengths, never words, for log fields that carry what a caller said (#4322).
 *
 * A reminder's message, an alarm's label or a note's title is the caller's own words, and logs
 * carry ids, enums, counts and lengths only. `lengthsOf({ label })` gives `{ labelLength: 5 }`:
 * enough to see that a field was set and how long it was, without the text.
 *
 * @module utils/log-lengths
 */

/** Each string field as `<name>Length`. A field that is not a string is left out. */
export function lengthsOf(fields: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [name, value] of Object.entries(fields)) {
    if (typeof value === 'string') out[`${name}Length`] = value.length;
  }
  return out;
}

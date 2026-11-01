/**
 * Mood logs in time order for the teammate briefings. getMoodLogs returns them
 * newest first (orderBy date desc), but Peter, Maya and Jordan read the last
 * entry as the latest and compare the first half with the second as earlier vs
 * later. Read that way the newest-first list showed the oldest mood as "last
 * logged" and a rising mood as declining (#3044).
 *
 * @module intelligence/context-builders/personas/mood-log-order
 */

/** A copy of the logs ordered oldest first, whatever order the store returned them in. */
export function oldestFirst<T extends { date: string }>(logs: readonly T[]): T[] {
  return [...logs].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}

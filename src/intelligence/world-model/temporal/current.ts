/**
 * What is true about someone right now, said the way a friend would:
 * "Mindy (sister), recovering from knee surgery since Tuesday".
 *
 * Only current facts render: closed ones (validTo set) never do, nor ones the
 * extractor was unsure of, nor an event that passed weeks ago with no word on
 * how it went (that is stale, not current).
 *
 * @module intelligence/world-model/temporal/current
 */

import { daysBetween, localDay, sayDay } from './dates.js';
import { REPLACEABLE_ATTRIBUTES, type TemporalFact } from './types.js';

export const MIN_CONFIDENCE = 0.5;
/** A passed event with no update after this many days is stale. */
export const STALE_EVENT_DAYS = 14;
/** A change this recent gets its start day ("since Tuesday"). */
export const RECENT_CHANGE_DAYS = 14;

export interface WhenContext {
  now: Date | string;
  timeZone?: string;
}

export function isCurrent(fact: TemporalFact, when: WhenContext): boolean {
  if (fact.validTo !== null || fact.confidence < MIN_CONFIDENCE) return false;
  if (!fact.eventDate) return true;
  return daysBetween(fact.eventDate, localDay(when.now, when.timeZone)) <= STALE_EVENT_DAYS;
}

export function currentFacts(facts: readonly TemporalFact[], when: WhenContext): TemporalFact[] {
  return facts.filter((f) => isCurrent(f, when));
}

function describeFact(fact: TemporalFact, today: string, timeZone?: string): string {
  if (fact.eventDate) {
    const day = sayDay(fact.eventDate, today);
    return fact.eventDate < today
      ? `${fact.value} (was ${day})`
      : `${fact.value} ${day === 'today' ? 'today' : `on ${day}`}`;
  }
  const from = localDay(fact.validFrom, timeZone);
  const age = daysBetween(from, today);
  return age > 0 && age <= RECENT_CHANGE_DAYS
    ? `${fact.value} since ${sayDay(from, today)}`
    : fact.value;
}

/**
 * What is going on with one subject now, newest state first, at most two
 * parts: "recovering from knee surgery since Tuesday". Undefined when nothing.
 */
export function describeSubject(
  facts: readonly TemporalFact[],
  subjectKey: string,
  when: WhenContext
): string | undefined {
  const today = localDay(when.now, when.timeZone);
  const mine = currentFacts(facts, when).filter((f) => f.subjectKey === subjectKey);
  const states = mine
    .filter((f) => REPLACEABLE_ATTRIBUTES.has(f.attribute))
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom));
  // Then dated things nearest today (upcoming before passed), then the rest, newest first.
  const distance = (f: TemporalFact) =>
    f.eventDate
      ? Math.abs(daysBetween(today, f.eventDate)) + (f.eventDate < today ? 0.5 : 0)
      : Infinity;
  const others = mine
    .filter((f) => !REPLACEABLE_ATTRIBUTES.has(f.attribute))
    .sort((a, b) => distance(a) - distance(b) || b.observedAt.localeCompare(a.observedAt));
  const parts = [...states, ...others]
    .slice(0, 2)
    .map((f) => describeFact(f, today, when.timeZone));
  return parts.length > 0 ? parts.join('; ') : undefined;
}

/** One line per subject with something current, people first, at most `max`. */
export function formatCurrentWorld(
  facts: readonly TemporalFact[],
  when: WhenContext,
  max = 6
): string[] {
  const current = currentFacts(facts, when);
  const order = (f: TemporalFact) =>
    f.subjectKind === 'person' ? 0 : f.subjectKind === 'self' ? 1 : 2;
  const subjects = new Map<string, TemporalFact>();
  for (const fact of [...current].sort(
    (a, b) => order(a) - order(b) || b.observedAt.localeCompare(a.observedAt)
  )) {
    if (!subjects.has(fact.subjectKey)) subjects.set(fact.subjectKey, fact);
  }
  const lines: string[] = [];
  for (const [key, fact] of subjects) {
    const what = describeSubject(current, key, when);
    if (!what) continue;
    const who =
      fact.subjectKind === 'self'
        ? 'Them'
        : fact.relation
          ? `${fact.subject} (${fact.relation})`
          : fact.subject;
    lines.push(`${who}, ${what}`);
    if (lines.length >= max) break;
  }
  return lines;
}

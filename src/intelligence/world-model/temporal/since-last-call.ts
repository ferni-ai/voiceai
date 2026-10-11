/**
 * "Since we last talked": at most three things a friend would have in mind
 * when the phone rings — what came due since the last call (Mindy's surgery
 * was Tuesday: ask how it went), what is coming up in the next few days, and
 * what changed that came in outside a call.
 *
 * Pure: computed once at call start from facts already loaded.
 *
 * @module intelligence/world-model/temporal/since-last-call
 */

import { MIN_CONFIDENCE, STALE_EVENT_DAYS, type WhenContext } from './current.js';
import { daysBetween, localDay, sayDay } from './dates.js';
import type { TemporalFact } from './types.js';

export const SINCE_LAST_CALL_MAX = 3;
/** "Coming up" looks this many days ahead. */
export const SOON_DAYS = 3;

export interface SinceLastCallItem {
  kind: 'due' | 'soon' | 'changed';
  factId: string;
  text: string;
}

export interface SinceLastCallInput extends WhenContext {
  /** Current facts (validTo null). */
  facts: readonly TemporalFact[];
  /** When the previous call ended; null on a first call. */
  lastCallEndedAt: Date | string | null;
  /**
   * Text the call already carries about the past (the proactive reason
   * opener, the last-call block). An item that repeats it is dropped.
   */
  alreadySaid?: readonly string[];
  max?: number;
}

const STOP = new Set(
  'the a an and or of to in on at for with about from is was be has had her his their them they it'.split(
    ' '
  )
);

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3 && !STOP.has(w))
  );
}

/** True when `said` names the subject and at least one word of the value. */
function repeats(fact: TemporalFact, said: Set<string>): boolean {
  const subject = fact.subjectKind === 'self' ? [] : [...words(fact.subject)];
  if (subject.length > 0 && !subject.every((w) => said.has(w))) return false;
  return [...words(fact.value)].some((w) => said.has(w));
}

function who(fact: TemporalFact): string {
  if (fact.subjectKind === 'self') return 'Them';
  return fact.relation ? `${fact.subject} (${fact.relation})` : fact.subject;
}

export function sinceLastCall(input: SinceLastCallInput): SinceLastCallItem[] {
  if (!input.lastCallEndedAt) return [];
  const lastEnded = new Date(input.lastCallEndedAt).toISOString();
  const today = localDay(input.now, input.timeZone);
  const lastDay = localDay(lastEnded, input.timeZone);
  const said = words((input.alreadySaid ?? []).join(' '));
  const facts = input.facts.filter(
    (f) => f.validTo === null && f.confidence >= MIN_CONFIDENCE && !repeats(f, said)
  );

  const due: Array<SinceLastCallItem & { at: string }> = [];
  const soon: Array<SinceLastCallItem & { at: string }> = [];
  const changed: Array<SinceLastCallItem & { at: string }> = [];
  for (const f of facts) {
    if (f.eventDate) {
      const ahead = daysBetween(today, f.eventDate);
      const heardBefore = localDay(f.observedAt, input.timeZone) <= f.eventDate;
      if (ahead <= 0 && f.eventDate >= lastDay && heardBefore && -ahead <= STALE_EVENT_DAYS) {
        const day = sayDay(f.eventDate, today);
        const text =
          ahead === 0
            ? `${who(f)}: ${f.value}, today.`
            : `${who(f)}: ${f.value} was ${day}. Ask how it went.`;
        due.push({ kind: 'due', factId: f.id, text, at: f.eventDate });
        continue;
      }
      if (ahead > 0 && ahead <= SOON_DAYS) {
        soon.push({
          kind: 'soon',
          factId: f.id,
          text: `${who(f)}: ${f.value}, ${sayDay(f.eventDate, today)}.`,
          at: f.eventDate,
        });
        continue;
      }
    }
    // Heard after the last call ended: it came in some other way (a text, the app).
    if (f.observedAt > lastEnded) {
      const was = f.replaced ? ` (was: ${f.replaced})` : '';
      changed.push({
        kind: 'changed',
        factId: f.id,
        text: `${who(f)}: now ${f.value}${was}.`,
        at: f.observedAt,
      });
    }
  }

  due.sort((a, b) => b.at.localeCompare(a.at));
  soon.sort((a, b) => a.at.localeCompare(b.at));
  changed.sort((a, b) => b.at.localeCompare(a.at));
  return [...due, ...soon, ...changed]
    .slice(0, input.max ?? SINCE_LAST_CALL_MAX)
    .map(({ kind, factId, text }) => ({ kind, factId, text }));
}

/** The block for the opener and first turn, or null when there is nothing. */
export function formatSinceLastCall(items: readonly SinceLastCallItem[]): string | null {
  if (items.length === 0) return null;
  return [
    '[SINCE YOU LAST TALKED]',
    ...items.map((i) => `- ${i.text}`),
    'Bring up at most one, early, the way a friend who remembered would. Never list them.',
  ].join('\n');
}

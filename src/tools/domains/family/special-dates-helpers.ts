/**
 * Helpers for the important-date voice tools: reading reminder lead times
 * ("a week before"), titles, and spoken-friendly date wording.
 *
 * @module tools/domains/family/special-dates-helpers
 */

import type { ImportantDateKind } from '../../../services/important-dates/index.js';
import { monthDayName } from '../../../services/important-dates/copy.js';
import { parseStoredDate } from '../../../services/important-dates/date-math.js';

const WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  ten: 10,
  fourteen: 14,
};

/** One lead-time phrase → days before ("a week before" → 7, "the day of" → 0). */
export function parseLeadTime(phrase: string): number | null {
  const t = phrase.toLowerCase().trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t);
  if (/\b(day of|on the day|same day|that day|morning of)\b/.test(t)) return 0;
  if (/\bday before\b/.test(t) && !/\d|two|three|few/.test(t)) return 1;
  const m = /(\d+|[a-z]+)\s+(day|days|week|weeks|month|months)\b/.exec(t);
  if (m) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : WORDS[m[1]];
    if (n === undefined) return null;
    if (m[2].startsWith('week')) return n * 7;
    if (m[2].startsWith('month')) return n * 30;
    return n;
  }
  if (/\bweek\b/.test(t)) return 7;
  if (/\bmonth\b/.test(t)) return 30;
  if (/\bday\b/.test(t)) return 1;
  return null;
}

/** Lead times from tool args: a number, a list, or a phrase ("a week and a day before"). */
export function parseLeadTimes(value: unknown): number[] | null {
  if (value === undefined || value === null || value === '') return null;
  const items: unknown[] = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/,|\band\b/)
      : [value];
  const out = new Set<number>();
  for (const item of items) {
    const n =
      typeof item === 'number' ? item : typeof item === 'string' ? parseLeadTime(item) : null;
    if (n === null || !Number.isInteger(n) || n < 0 || n > 365) continue;
    out.add(n);
  }
  return out.size > 0 ? [...out].sort((a, b) => b - a) : null;
}

const SELF = new Set(['me', 'my', 'mine', 'myself', 'i', 'our', 'us', 'we', 'self', 'you']);

export function isSelf(person?: string): boolean {
  return !person || SELF.has(person.toLowerCase().trim());
}

/** "Sam's birthday", "Your anniversary", "Tax return deadline". */
export function titleFor(kind: ImportantDateKind, person?: string, label?: string): string {
  if (label && label.trim()) return label.trim();
  const noun = kind === 'other' ? 'special day' : kind;
  if (isSelf(person)) return kind === 'birthday' ? 'Your birthday' : `Your ${noun}`;
  const name = person!.trim();
  return `${name}${name.endsWith('s') ? "'" : "'s"} ${noun}`;
}

/** "June 12" / "June 12, 2026" for a stored date. */
export function spokenDate(stored: string): string {
  const p = parseStoredDate(stored);
  if (!p) return stored;
  const md = monthDayName(p.month, p.day);
  return p.year === undefined ? md : `${md}, ${p.year}`;
}

/** "a week before", "the day before and on the day". */
export function spokenLeadTimes(offsets: readonly number[]): string {
  const parts = [...offsets]
    .sort((a, b) => b - a)
    .map((o) =>
      o === 0
        ? 'on the day'
        : o === 1
          ? 'the day before'
          : o === 7
            ? 'a week before'
            : o % 7 === 0
              ? `${o / 7} weeks before`
              : `${o} days before`
    );
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** Map loose kind words from the LLM onto the store's kinds. */
export function kindFrom(value: unknown): { kind: ImportantDateKind; subtype?: string } {
  const v = typeof value === 'string' ? value.toLowerCase() : '';
  if (v === 'birthday' || v === 'anniversary' || v === 'event' || v === 'deadline')
    return { kind: v };
  if (v === 'memorial') return { kind: 'other', subtype: 'memorial' };
  return { kind: 'other' };
}

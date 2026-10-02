/**
 * Turn spoken date phrases into stored dates.
 *
 * Handles "June 12", "June 12th, 2015", "12th of June", "6/12", "6/12/2015",
 * "2015-06-12", "today", "tomorrow", "in 3 days", "next Friday", "Friday".
 * Numeric m/d is read US-style (month first) unless the first number can't be
 * a month.
 *
 * @module services/important-dates/date-parsing
 */

import {
  addDays,
  compareCivil,
  formatStoredDate,
  isValidCivil,
  isValidMonthDay,
  nextOccurrence,
  type CivilDate,
  type StoredDateParts,
} from './date-math.js';

const MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const WORD_NUMBERS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fourteen: 14,
  thirty: 30,
};

export interface ParsedSpokenDate {
  parts: StoredDateParts;
  /** True when the phrase pinned a specific day (relative words, weekday). */
  relative: boolean;
}

function civilWeekday(d: CivilDate): number {
  return new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();
}

function withYear(month: number, day: number, year?: number): StoredDateParts | null {
  if (year !== undefined) {
    const full = { year, month, day };
    return isValidCivil(full) ? full : null;
  }
  return isValidMonthDay(month, day) ? { month, day } : null;
}

function expandYear(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  if (raw.length === 2) return n + 2000;
  return n;
}

function parseRelative(text: string, today: CivilDate): CivilDate | null {
  if (/\btoday\b|\btonight\b/.test(text)) return today;
  if (/\bday after tomorrow\b/.test(text)) return addDays(today, 2);
  if (/\btomorrow\b/.test(text)) return addDays(today, 1);

  const inN = /\bin\s+(\d+|[a-z]+)\s+(day|days|week|weeks)\b/.exec(text);
  if (inN) {
    const n = /^\d+$/.test(inN[1]) ? Number(inN[1]) : WORD_NUMBERS[inN[1]];
    if (n !== undefined) return addDays(today, inN[2].startsWith('week') ? n * 7 : n);
  }

  const wd =
    /\b(next\s+|this\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/.exec(text);
  if (wd) {
    const target = WEEKDAYS[wd[2]];
    let delta = (target - civilWeekday(today) + 7) % 7;
    if (delta === 0) delta = wd[1]?.startsWith('next') ? 7 : 0;
    return addDays(today, delta);
  }
  return null;
}

/**
 * Parse a spoken or typed date. `today` is the user's local day, used for
 * relative phrases. Returns null when nothing date-like is found.
 */
export function parseSpokenDate(input: string, today: CivilDate): ParsedSpokenDate | null {
  const text = input.toLowerCase().replace(/[,]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return null;

  const iso = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(text);
  if (iso) {
    const p = withYear(Number(iso[2]), Number(iso[3]), Number(iso[1]));
    return p ? { parts: p, relative: false } : null;
  }

  const monthDayRe =
    /\b([a-z]+)\.?\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?(?:\s+(?:of\s+)?(\d{4}))?\b/g;
  for (const m of text.matchAll(monthDayRe)) {
    if (MONTHS[m[1]] === undefined) continue;
    const p = withYear(MONTHS[m[1]], Number(m[2]), expandYear(m[3]));
    if (p) return { parts: p, relative: false };
  }

  const dayMonthRe =
    /\b(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]+)(?:\s+(\d{4}))?\b/g;
  for (const m of text.matchAll(dayMonthRe)) {
    if (MONTHS[m[2]] === undefined) continue;
    const p = withYear(MONTHS[m[2]], Number(m[1]), expandYear(m[3]));
    if (p) return { parts: p, relative: false };
  }

  const numeric = /\b(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2}|\d{4}))?\b/.exec(text);
  if (numeric) {
    const a = Number(numeric[1]);
    const b = Number(numeric[2]);
    const year = expandYear(numeric[3]);
    const p = (a <= 12 ? withYear(a, b, year) : null) ?? withYear(b, a, year);
    if (p) return { parts: p, relative: false };
  }

  const rel = parseRelative(text, today);
  if (rel) return { parts: rel, relative: true };
  return null;
}

/**
 * The value to store for a parsed date. Recurring dates without a year become
 * `--MM-DD`. A one-off date without a year means its next occurrence.
 */
export function toStoredDate(
  parsed: ParsedSpokenDate,
  recurring: boolean,
  today: CivilDate
): string {
  const { parts } = parsed;
  if (recurring) {
    return formatStoredDate(parsed.relative ? { month: parts.month, day: parts.day } : parts);
  }
  if (parts.year !== undefined) return formatStoredDate(parts);
  const next = nextOccurrence(parts, true, today) ?? today;
  return formatStoredDate(compareCivil(next, today) >= 0 ? next : today);
}

/**
 * Resolves what a caller said about when ("the 14th", "next Thursday", "in
 * two weeks", "October 3rd", "Christmas") to a calendar day, in code, against
 * the call's own date in the caller's timezone (TIMEX3's document-creation-time
 * anchor). The extraction model only copies the words; it never does the date
 * arithmetic, which models get wrong near month and week boundaries ("the 3rd"
 * said on Oct 30 is Nov 3, not Oct 3).
 *
 * Where two readings are plausible ("next Thursday" said on a Monday, "the
 * 3rd" said on the 5th) the result is marked ambiguous, so Ferni confirms it
 * instead of stating it. A phrase with no single day ("next month", "in the
 * spring") resolves to null: a wrong date is worse than none.
 *
 * A time of day ("at 3", "3pm", "15:00", "three o'clock", "noon") is kept
 * beside the day as `at`, never folded into it, so the day logic is the same
 * with or without one (Bookends, ENGAGEMENT-SPEC §2.3).
 *
 * @module intelligence/world-model/dates/timex
 */

export interface Resolved {
  /** YYYY-MM-DD */
  date: string;
  ambiguous: boolean;
  /** HH:MM, 24-hour, in the caller's zone: only when the words named a time. */
  at?: string;
}

const DAY_MS = 86_400_000;
const MONTHS = 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ');
const WEEKDAYS = 'sunday monday tuesday wednesday thursday friday saturday'.split(' ');
const COUNTS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, couple: 2, 'a couple': 2, 'a couple of': 2,
}; // prettier-ignore
const UNITS = 'first second third fourth fifth sixth seventh eighth ninth'.split(' ');
const TEENS = 'tenth eleventh twelfth thirteenth fourteenth fifteenth sixteenth seventeenth eighteenth nineteenth'.split(' '); // prettier-ignore
/** "third" -> 3, "twenty first" -> 21, "thirtieth" -> 30. */
const ORDINALS = new Map<string, number>([
  ...UNITS.map((w, i) => [w, i + 1] as const),
  ...TEENS.map((w, i) => [w, i + 10] as const),
  ['twentieth', 20],
  ...UNITS.map((w, i) => [`twenty ${w}`, 21 + i] as const),
  ['thirtieth', 30],
  ['thirty first', 31],
]);
/** Fixed-date holidays, and floating ones as [month, weekday, nth]. */
const FIXED: Record<string, string> = {
  'christmas eve': '12-24', christmas: '12-25', 'christmas day': '12-25',
  "new year's eve": '12-31', "new year's day": '01-01', "new year's": '01-01',
  "valentine's day": '02-14', halloween: '10-31', 'fourth of july': '07-04',
  'independence day': '07-04',
}; // prettier-ignore
const FLOATING: Record<string, [number, number, number]> = {
  thanksgiving: [11, 4, 4],
  "mother's day": [5, 0, 2],
  "father's day": [6, 0, 3],
};

const pad = (n: number): string => String(n).padStart(2, '0');
const at = (day: string): number => Date.parse(`${day}T00:00:00Z`);
export const addDays = (day: string, n: number): string =>
  new Date(at(day) + n * DAY_MS).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string): number =>
  Math.round((at(to) - at(from)) / DAY_MS);
const weekday = (day: string): number => new Date(at(day)).getUTCDay();

/** YYYY-MM-DD when y-m-d is a real day (Feb 30 is not), else null. */
function ymd(y: number, m: number, d: number): string | null {
  const day = `${y}-${pad(m)}-${pad(d)}`;
  const t = at(day);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === day ? day : null;
}

const exact = (day: string | null): Resolved | null =>
  day ? { date: day, ambiguous: false } : null;

/** The first day on or after `from` with this month and day; Feb 29 falls on Feb 28 off leap years. */
export function nextOccurrence(monthDay: string, from: string): string {
  const [m, d] = monthDay.split('-').map(Number);
  const year = Number(from.slice(0, 4));
  for (const y of [year, year + 1]) {
    const day = ymd(y, m, d) ?? ymd(y, m, d - 1);
    if (day && day >= from) return day;
  }
  return ymd(year + 1, m, d) ?? `${year + 1}-${monthDay}`;
}

/** The last day on or before `from` with this month and day. */
function lastOccurrence(monthDay: string, from: string): string {
  const year = Number(from.slice(0, 4));
  const thisYear = nextOccurrence(monthDay, `${year}-01-01`);
  return thisYear <= from ? thisYear : nextOccurrence(monthDay, `${year - 1}-01-01`);
}

const onOrAround = (monthDay: string, anchor: string, past: boolean): string =>
  past ? lastOccurrence(monthDay, anchor) : nextOccurrence(monthDay, anchor);

function nthWeekday(year: number, month: number, dow: number, nth: number): string {
  const first = `${year}-${pad(month)}-01`;
  return addDays(first, ((dow - weekday(first) + 7) % 7) + (nth - 1) * 7);
}

function holiday(text: string, anchor: string, past: boolean): string | null {
  if (FIXED[text]) return onOrAround(FIXED[text], anchor, past);
  const rule = FLOATING[text];
  if (!rule) return null;
  const year = Number(anchor.slice(0, 4));
  const days = [year - 1, year, year + 1].map((y) => nthWeekday(y, rule[0], rule[1], rule[2]));
  return past ? days.filter((d) => d <= anchor).pop()! : days.find((d) => d >= anchor)!;
}

/** Monday-start week number (1970-01-01 was a Thursday). */
const weekOf = (day: string): number => Math.floor((at(day) / DAY_MS + 3) / 7);

function weekdayPhrase(text: string, anchor: string, past: boolean): Resolved | null {
  const m = text.match(
    /^(?:(next|this|coming|last|past) )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?: (after next|next week|this week))?$/
  );
  if (!m) return null;
  const [, mod, name, tail] = m;
  const dow = WEEKDAYS.indexOf(name);
  const ahead = (dow - weekday(anchor) + 7) % 7 || 7;
  if (mod === 'last' || mod === 'past' || (past && !mod && !tail)) {
    return { date: addDays(anchor, -((weekday(anchor) - dow + 7) % 7 || 7)), ambiguous: false };
  }
  const bare = addDays(anchor, ahead);
  if (tail === 'after next') return { date: addDays(bare, 7), ambiguous: false };
  if (tail) {
    // Monday-start weeks: "Thursday next week" is in the week after this one.
    const monday = addDays(anchor, -((weekday(anchor) + 6) % 7));
    const offset = ((dow + 6) % 7) + (tail === 'next week' ? 7 : 0);
    return { date: addDays(monday, offset), ambiguous: false };
  }
  if (mod === 'next') {
    // Later this week: "next Thursday" on a Monday is this week's or next week's.
    const thisWeek = weekOf(bare) === weekOf(anchor);
    return thisWeek
      ? { date: addDays(bare, 7), ambiguous: true }
      : { date: bare, ambiguous: false };
  }
  // "Thursday" said on a Thursday: today, or a week out.
  return { date: bare, ambiguous: ahead === 7 };
}

function monthIndex(word: string): number {
  return MONTHS.indexOf(word.slice(0, 3)) + 1;
}

/** A day number from "14", "14th" or "fourteenth". */
function dayNumber(word: string): number | null {
  const n = /^(\d{1,2})(?:st|nd|rd|th)?$/.exec(word)?.[1];
  const day = n ? Number(n) : (ORDINALS.get(word) ?? null);
  return day && day >= 1 && day <= 31 ? day : null;
}

function monthDayPhrase(text: string, anchor: string, past: boolean): Resolved | null {
  const MONTH = '(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*';
  const DAY = '(\\d{1,2}(?:st|nd|rd|th)?|(?:twenty |thirty )?[a-z]+(?:st|nd|rd|th))';
  const a = new RegExp(`^${MONTH} ${DAY}(?: (\\d{4}))?$`).exec(text);
  const b = new RegExp(`^${DAY} (?:of )?${MONTH}(?: (\\d{4}))?$`).exec(text);
  const [month, day, year] = a ? [a[1], a[2], a[3]] : b ? [b[2], b[1], b[3]] : [];
  const d = day ? dayNumber(day) : null;
  if (!month || !d) return null;
  const m = monthIndex(month);
  if (year) return exact(ymd(Number(year), m, d));
  if (!ymd(2024, m, d)) return null; // Feb 29 exists in a leap year; Apr 31 never does
  return { date: onOrAround(`${pad(m)}-${pad(d)}`, anchor, past), ambiguous: false };
}

/** "the 14th" with no month: this month's if still ahead, else next month's (past: the reverse). */
function dayOnlyPhrase(text: string, anchor: string, past: boolean): Resolved | null {
  const d = dayNumber(text);
  if (!d) return null;
  let y = Number(anchor.slice(0, 4));
  let m = Number(anchor.slice(5, 7));
  for (let i = 0; i < 14; i++) {
    const day = ymd(y, m, d);
    if (day && (past ? day <= anchor : day >= anchor)) {
      // Just passed (or long ago): the other reading is close enough to ask.
      const gap = Math.abs(daysBetween(anchor, day));
      return { date: day, ambiguous: gap > 24 };
    }
    m += past ? -1 : 1;
    if (m === 13) [y, m] = [y + 1, 1];
    if (m === 0) [y, m] = [y - 1, 12];
  }
  return null;
}

function offsetPhrase(text: string, anchor: string): Resolved | null {
  const m = /^(?:in )?(\d+|[a-z]+(?: [a-z]+){0,2}?) (day|week|month)s?(?: (from now|from today|later|ago))?$/.exec(text); // prettier-ignore
  if (!m || (!text.startsWith('in ') && !m[3])) return null;
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : COUNTS[m[1]];
  if (!n || n > 400) return null;
  const sign = m[3] === 'ago' ? -1 : 1;
  if (m[2] !== 'month') return { date: addDays(anchor, sign * n * (m[2] === 'week' ? 7 : 1)), ambiguous: false }; // prettier-ignore
  const total = Number(anchor.slice(0, 4)) * 12 + Number(anchor.slice(5, 7)) - 1 + sign * n;
  const y = Math.floor(total / 12);
  const mo = (total % 12) + 1;
  const d = Number(anchor.slice(8, 10));
  return { date: ymd(y, mo, d) ?? ymd(y, mo, 28)!, ambiguous: false };
}

const RELATIVE: Record<string, number> = {
  today: 0, tonight: 0, 'this morning': 0, 'this afternoon': 0, 'this evening': 0,
  tomorrow: 1, 'tomorrow night': 1, 'tomorrow morning': 1, 'day after tomorrow': 2,
  'the day after tomorrow': 2, yesterday: -1, 'last night': -1, 'day before yesterday': -2,
}; // prettier-ignore

/** Lower case, no filler: "On the 14th!" -> "14th", "this coming Friday" -> "this friday". */
export function normaliseWhen(when: string): string {
  return when
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[^a-z0-9'/ -]+/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\b(?:on|by|around|at|the|this coming|coming up|until)\b/g, (w) =>
      w === 'this coming' ? 'this' : ''
    )
    .replace(/\s+/g, ' ')
    .trim();
}

const HOUR_WORDS = 'one two three four five six seven eight nine ten eleven twelve'.split(' ');
const HOUR = `(\\d{1,2}|${HOUR_WORDS.join('|')})`;
const hourOf = (w: string): number => (/^\d/.test(w) ? Number(w) : HOUR_WORDS.indexOf(w) + 1);

/**
 * An hour said with no am or pm, read the way people book things: 7 to 11 are
 * the morning, 12 is noon, and 1 to 6 are the afternoon, so "biopsy at 3" is
 * 15:00, not 03:00. Words for part of the day win: "3 in the morning" is
 * 03:00, "8 tonight" is 20:00.
 */
function bookableHour(h: number, words: string): number {
  if (h === 12) return 12;
  if (/\b(?:afternoon|evening|night|tonight)\b/.test(words)) return h + 12;
  if (/\bmorning\b/.test(words)) return h;
  return h <= 6 ? h + 12 : h;
}

const hhmm = (h: number, m: number): string | null =>
  h >= 0 && h <= 23 && m >= 0 && m <= 59 ? `${pad(h)}:${pad(m)}` : null;

/**
 * The time of day in `when`, and the words without it. "3pm" and "3:30 pm";
 * "15:00" and "3:30"; "three o'clock"; "noon"; a bare hour only after "at"
 * ("at 3"), since "on the 3rd" is a day.
 */
export function timeOfDay(when: string): { at: string; rest: string } | null {
  const words = when
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/\b([ap])\.m\.?/g, '$1m');
  const rules: Array<[RegExp, (m: RegExpExecArray) => string | null]> = [
    [/\b(\d{1,2})(?::(\d{2}))? ?(am|pm)\b/, (m) => {
      const h = Number(m[1]);
      if (h < 1 || h > 12) return null;
      return hhmm((h % 12) + (m[3] === 'pm' ? 12 : 0), Number(m[2] ?? 0));
    }],
    [/\b(\d{1,2}):(\d{2})\b/, (m) => {
      const h = Number(m[1]);
      return hhmm(h >= 1 && h <= 12 ? bookableHour(h, words) : h, Number(m[2]));
    }],
    [new RegExp(`\\b${HOUR} o'?clock\\b`), (m) => hhmm(bookableHour(hourOf(m[1]), words), 0)],
    [new RegExp(`\\bat ${HOUR}\\b(?![/:\\d])`), (m) => {
      const h = hourOf(m[1]);
      return h >= 1 && h <= 12 ? hhmm(bookableHour(h, words), 0) : null;
    }],
    [/\b(?:noon|midday)\b/, () => '12:00'],
  ]; // prettier-ignore
  for (const [pattern, read] of rules) {
    const m = pattern.exec(words);
    const at = m && read(m);
    if (m && at)
      return { at, rest: `${words.slice(0, m.index)} ${words.slice(m.index + m[0].length)}` };
  }
  return null;
}

/**
 * The day `when` names, said on `anchor` (YYYY-MM-DD, the call's date where
 * the caller is), with the time of day when the words gave one. `past`: they
 * were talking about something that already happened ("her surgery was
 * Tuesday"). Null when it names no single day. A time with no day ("biopsy at
 * 3") is on the call's own day.
 */
export function resolveWhen(when: string, anchor: string, past = false): Resolved | null {
  const time = timeOfDay(when);
  const said = normaliseWhen(time ? time.rest : when);
  const dayless = !said || /^(?:in )?(?:morning|afternoon|evening|night)$/.test(said);
  const day = time && dayless ? { date: anchor, ambiguous: false } : resolveDay(said, anchor, past);
  return day && time ? { ...day, at: time.at } : day;
}

function resolveDay(said: string, anchor: string, past: boolean): Resolved | null {
  if (said in RELATIVE) return { date: addDays(anchor, RELATIVE[said]), ambiguous: false };
  // The time of day doesn't change the day: "Friday morning", "the 14th 3pm".
  const text = said
    .replace(/\b\d{1,2}(?::\d{2})? ?(?:am|pm|o'?clock)\b/g, '')
    .replace(/(?: in)? (?:morning|afternoon|evening|night|noon)$/, '')
    .trim();
  if (!text) return null;
  if (text in RELATIVE) return { date: addDays(anchor, RELATIVE[text]), ambiguous: false };
  const lead = /^(next week|this week|sunday|monday|tuesday|wednesday|thursday|friday|saturday) (.+)$/.exec(text); // prettier-ignore
  if (lead && !/^(?:after next|next week|this week)$/.test(lead[2])) {
    const [, head, rest] = lead;
    // "next week Thursday"; "Wednesday the 14th" (a weekday that disagrees with the date: ask).
    if (head.endsWith('week')) return resolveWhen(`${rest} ${WEEKDAYS.includes(rest) ? head : ''}`, anchor, past); // prettier-ignore
    const inner = resolveWhen(rest, anchor, past);
    if (inner)
      return WEEKDAYS[weekday(inner.date)] === head ? inner : { ...inner, ambiguous: true };
  }
  const iso = /^(\d{4})[/ ](\d{1,2})[/ ](\d{1,2})$/.exec(text.replace(/-/g, ' '));
  if (iso) return exact(ymd(+iso[1], +iso[2], +iso[3]));
  const us = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(text);
  if (us) {
    const y = us[3] ? Number(us[3].length === 2 ? `20${us[3]}` : us[3]) : null;
    if (y) return exact(ymd(y, +us[1], +us[2]));
    if (!ymd(2024, +us[1], +us[2])) return null;
    return { date: onOrAround(`${pad(+us[1])}-${pad(+us[2])}`, anchor, past), ambiguous: false };
  }
  const named = holiday(text, anchor, past);
  if (named) return { date: named, ambiguous: false };
  const weekFrom = /^(?:a|one) week from (.+)$/.exec(text);
  if (weekFrom) {
    const base = resolveWhen(weekFrom[1], anchor, past);
    return base && { date: addDays(base.date, 7), ambiguous: base.ambiguous };
  }
  if (text === 'this weekend' || text === 'weekend' || text === 'next weekend') {
    const sat = addDays(anchor, (6 - weekday(anchor) + 7) % 7);
    const on = weekday(anchor) === 0 ? addDays(anchor, -1) : sat;
    return { date: text === 'next weekend' ? addDays(sat, 7) : on, ambiguous: false };
  }
  return (
    weekdayPhrase(text, anchor, past) ??
    monthDayPhrase(text, anchor, past) ??
    dayOnlyPhrase(text, anchor, past) ??
    offsetPhrase(text, anchor)
  );
}

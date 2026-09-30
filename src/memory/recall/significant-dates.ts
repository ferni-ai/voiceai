/**
 * Dates that matter to the caller.
 *
 * A friend who has known you for years remembers your birthday, your
 * anniversary, and the day you lost your dad, and on that day they are a
 * little warmer or a little gentler without being asked. People forget;
 * Ferni does not. A date is saved when the caller mentions it with the
 * day ("my birthday is March 3rd", "my dad died on October 2nd, 2019"),
 * and on a later call the day itself (or the day either side, in the
 * caller's own calendar) gets one fitting note.
 *
 * Pure: detection, matching and wording. Storage lives with the recall
 * store.
 *
 * @module memory/recall/significant-dates
 */

import { localCalendarDay } from '../../utils/local-clock.js';

export type DateKind = 'birthday' | 'anniversary' | 'loss';

export interface SignificantDate {
  id: string;
  kind: DateKind;
  /** Whose: 'self' for the caller, else as they said it ("mom", "Sam"). */
  who: string;
  /** 0-11. */
  month: number;
  /** 1-31. */
  day: number;
  year?: number;
}

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  sept: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

const MONTH =
  '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DAY = '(\\d{1,2})(?:st|nd|rd|th)?';
const MONTH_DAY = new RegExp(`\\b${MONTH}\\.? ${DAY}\\b(?:,? (\\d{4}))?`, 'i');
const DAY_OF_MONTH = new RegExp(`\\b${DAY} of ${MONTH}\\b(?:,? (\\d{4}))?`, 'i');
/**
 * A relative day only when it names the day of the thing ("today is my
 * birthday", "our anniversary is tomorrow", "he died yesterday"), never a
 * passing "I need it by tomorrow".
 */
const RELATIVE =
  /\b(today|tomorrow|yesterday) (?:is|was|would have been|marks)\b|\b(?:is|was|'s) (today|tomorrow|yesterday)\b|\b(?:died|passed away|passed on) (today|yesterday)\b/i;
const NEGATED = /\b(not|isn'?t|wasn'?t|never)\b/i;

const monthIndex = (name: string): number => MONTHS[name.toLowerCase().slice(0, 3)] ?? -1;

/** The calendar date a sentence names, in the caller's calendar, or null. */
export function dateIn(
  text: string,
  now: Date,
  timezone?: string
): { month: number; day: number; year?: number } | null {
  const md = MONTH_DAY.exec(text);
  if (md) return valid(monthIndex(md[1]), Number(md[2]), md[3]);
  const dm = DAY_OF_MONTH.exec(text);
  if (dm) return valid(monthIndex(dm[2]), Number(dm[1]), dm[3]);
  const m = NEGATED.test(text) ? null : RELATIVE.exec(text);
  const rel = (m?.[1] ?? m?.[2] ?? m?.[3])?.toLowerCase();
  if (rel) {
    const offset = rel === 'tomorrow' ? 1 : rel === 'yesterday' ? -1 : 0;
    const { month, date } = localCalendarDay(timezone, now, offset);
    return { month, day: date };
  }
  return null;
}

function valid(month: number, day: number, year?: string) {
  if (month < 0 || day < 1 || day > 31) return null;
  const y = year ? Number(year) : undefined;
  return { month, day, ...(y && y > 1900 ? { year: y } : {}) };
}

/** "my mom's birthday" / "Sam's birthday" / "my birthday". */
const BIRTHDAY = /\b(?:(my|our)|([a-z]+)'s|my ([a-z]+)'s) birthday\b/i;
const ANNIVERSARY = /\b(?:my|our) (?:wedding )?anniversary\b/i;
/** "my dad died", "my mom passed away", "we lost my grandpa". */
const LOSS = /\b(?:my|our) ([a-z]+) (?:died|passed away|passed on)\b|\blost (?:my|our) ([a-z]+)\b/i;

/** People (and pets) a loss can be about; "my phone died" is not a loss. */
const KIN = new Set(
  'mom mum mother dad father parent wife husband partner son daughter child kid baby brother sister grandma grandpa grandmother grandfather granny nana aunt uncle cousin friend boyfriend girlfriend fiance fiancee dog cat pup puppy'.split(
    ' '
  )
);

/** A date that matters in something the caller said, or null. */
export function detectSignificantDate(
  text: string,
  now: Date,
  timezone?: string
): SignificantDate | null {
  const date = dateIn(text, now, timezone);
  if (!date) return null;
  let kind: DateKind | null = null;
  let who = 'self';
  const b = BIRTHDAY.exec(text);
  const l = LOSS.exec(text);
  const lost = (l?.[1] ?? l?.[2])?.toLowerCase();
  if (lost && KIN.has(lost)) {
    kind = 'loss';
    who = lost;
  } else if (b) {
    kind = 'birthday';
    const named = (b[3] ?? b[2])?.toLowerCase();
    who = !named ? 'self' : KIN.has(named) ? named : named[0].toUpperCase() + named.slice(1);
  } else if (ANNIVERSARY.test(text)) {
    kind = 'anniversary';
  }
  if (!kind) return null;
  // A relative day ("today") says nothing about the year of a loss.
  return {
    id: `${kind}-${who.toLowerCase()}-${date.month + 1}-${date.day}`,
    kind,
    who,
    ...date,
  };
}

export type Nearness = 'today' | 'tomorrow' | 'yesterday';

/** Which dates fall today, tomorrow or yesterday in the caller's calendar. */
export function datesNear(
  dates: readonly SignificantDate[],
  now: Date,
  timezone?: string
): Array<{ date: SignificantDate; when: Nearness; year: number }> {
  const days: Array<[Nearness, { year: number; month: number; date: number }]> = [
    ['today', localCalendarDay(timezone, now, 0)],
    ['tomorrow', localCalendarDay(timezone, now, 1)],
    ['yesterday', localCalendarDay(timezone, now, -1)],
  ];
  const out: Array<{ date: SignificantDate; when: Nearness; year: number }> = [];
  for (const d of dates) {
    const hit = days.find(([, c]) => c.month === d.month && c.date === observedDay(d, c.year));
    if (hit) out.push({ date: d, when: hit[0], year: hit[1].year });
  }
  const order: Nearness[] = ['today', 'tomorrow', 'yesterday'];
  return out.sort((a, b) => order.indexOf(a.when) - order.indexOf(b.when));
}

/** A Feb 29 date is kept on Feb 28 in other years. */
function observedDay(d: SignificantDate, year: number): number {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return d.month === 1 && d.day === 29 && !leap ? 28 : d.day;
}

function label(d: SignificantDate): string {
  const whose = d.who === 'self' ? 'their' : KIN.has(d.who) ? `their ${d.who}'s` : `${d.who}'s`;
  if (d.kind === 'birthday') return `${whose} birthday`;
  if (d.kind === 'anniversary') return 'their anniversary';
  return `the anniversary of losing their ${d.who}`;
}

/** The note for the call, or null when no date that matters is near. */
export function formatDatesNear(
  near: ReadonlyArray<{ date: SignificantDate; when: Nearness; year: number }>
): string | null {
  if (near.length === 0) return null;
  const lines = ['[A DAY THAT MATTERS TO THEM]'];
  for (const { date, when, year } of near.slice(0, 2)) {
    const years = date.kind === 'loss' && date.year ? ` (${year - date.year} years)` : '';
    const what = `${when === 'today' ? 'Today is' : when === 'tomorrow' ? 'Tomorrow is' : 'Yesterday was'} ${label(date)}${years}.`;
    const how =
      date.kind === 'loss'
        ? 'Be gentle. If it fits, acknowledge it softly, once; do not make it the topic unless they do.'
        : date.who === 'self' && date.kind === 'birthday'
          ? when === 'yesterday'
            ? 'A warm, belated happy birthday fits, once.'
            : 'Let it be warm: wish them well for it, genuinely, once, and let them lead from there.'
          : 'If it fits, ask about it, once.';
    lines.push(`${what} ${how}`);
  }
  lines.push('You remember this because they told you; never say you looked it up.');
  return lines.join('\n');
}

/**
 * A bare month/day ("10/3") in date context, written as "October 3".
 *
 * Sonic reads a bare "10/3" as a fraction ("10 thirds", live run with Lester
 * Pro V3, 2026-10-03); Cartesia's guide wants dates as MM/DD/YYYY, and a
 * month name reads right with no year to invent. Only a valid month/day
 * (1-12 / days in that month) is touched, and only after a word that makes
 * it a date: on, by, until, till, from, due, before, after, since, through,
 * or a weekday ("Friday, 10/3"); in a range ("from 9/5 to 9/9") the second
 * date follows the first. Everything that is not clearly a date is left as
 * written: "24/7", "50/50", "1/2 cup", "3/4 of them", "10/3 works", and any
 * date with a year ("7/4/1999").
 *
 * @module speech/tts-gateway/director/bare-dates
 */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** M/D not part of a longer number, fraction or date (no year, no "1/2/3"). */
const BARE_DATE = /(?<![\d/.,$])\b(\d{1,2})\/(\d{1,2})\b(?![\d/]|\.\d|,\d)/g;
/** The words before a date. Whole words only ("upon" is not "on"). */
const DATE_CONTEXT =
  /\b(?:on|by|until|till|from|due|before|after|since|through|thru|mon(?:day)?|tues?(?:day)?|wed(?:nesday)?|thu(?:rs)?(?:day)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?),?\s+$/i;
/** The second date of a range, right after a date this pass wrote out. */
const RANGE_CONTEXT = new RegExp(
  String.raw`\b(?:${MONTHS.join('|')}) \d{1,2}\s*(?:to|through|thru|and|-|–)\s*$`
);

function written(month: string, day: string): string | null {
  const m = Number(month);
  const d = Number(day);
  if (m < 1 || m > 12 || d < 1 || d > DAYS_IN_MONTH[m - 1]) return null;
  return `${MONTHS[m - 1]} ${d}`;
}

/** Write out each bare date in date context; `hit` counts the rewrites. */
export function writeBareDates(text: string, hit: () => void): string {
  let out = '';
  let last = 0;
  BARE_DATE.lastIndex = 0;
  for (let m = BARE_DATE.exec(text); m !== null; m = BARE_DATE.exec(text)) {
    out += text.slice(last, m.index);
    last = m.index + m[0].length;
    const date = written(m[1], m[2]);
    const dated = date !== null && (DATE_CONTEXT.test(out) || RANGE_CONTEXT.test(out));
    if (dated) hit();
    out += dated ? date : m[0];
  }
  return out + text.slice(last);
}

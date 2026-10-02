/**
 * Reminder wording. Short and warm (see CLAUDE.md toast/tone rules). The
 * persona's name is added by the delivery channel ("From Maya"), and in
 * conversation the persona says it in their own voice.
 *
 * @module services/important-dates/copy
 */

import type { CivilDate } from './date-math.js';
import type { ImportantDateRecord } from './types.js';

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const MONTH_NAMES = [
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
];

export function weekdayName(d: CivilDate): string {
  return WEEKDAY_NAMES[new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay()];
}

export function monthDayName(month: number, day: number): string {
  return `${MONTH_NAMES[month - 1]} ${day}`;
}

/** "today", "tomorrow", "Saturday", "in 12 days". */
export function whenPhrase(daysUntil: number, occursOn: CivilDate): string {
  if (daysUntil <= 0) return 'today';
  if (daysUntil === 1) return 'tomorrow';
  if (daysUntil < 7) return weekdayName(occursOn);
  return `in ${daysUntil} days`;
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function isMemorial(record: ImportantDateRecord): boolean {
  return record.subtype === 'memorial';
}

/** A one-line nudge, like "Sam's birthday is Saturday. Want help with a gift?" */
export function reminderMessage(
  record: ImportantDateRecord,
  daysUntil: number,
  occursOn: CivilDate,
  yearsSince?: number
): string {
  const title = capitalize(record.title);
  if (isMemorial(record)) {
    return daysUntil <= 0
      ? `Thinking of you today. ${title}.`
      : `${title} is ${whenPhrase(daysUntil, occursOn)}. I'm here if you want to talk.`;
  }
  const when = whenPhrase(daysUntil, occursOn);
  const milestone = yearsSince && record.kind === 'anniversary' ? ` ${yearsSince} years!` : '';
  const head =
    daysUntil <= 0 ? `${title} is today!${milestone}` : `${title} is ${when}.${milestone}`;
  if (record.kind === 'birthday' && daysUntil >= 2) return `${head} Want help with a gift?`;
  if (record.kind === 'anniversary' && daysUntil >= 2) return `${head} Want to plan something?`;
  if (record.kind === 'deadline' && daysUntil >= 1) return `${head} Need a hand getting it done?`;
  return head;
}

/** A short line for the session-start context block. */
export function sessionLine(
  record: ImportantDateRecord,
  daysUntil: number,
  occursOn: CivilDate,
  yearsSince?: number
): string {
  const when = whenPhrase(daysUntil, occursOn);
  const years = !yearsSince
    ? ''
    : record.kind === 'birthday'
      ? ` (turning ${yearsSince})`
      : ` (${yearsSince} years)`;
  const gentle = isMemorial(record) ? ' — sensitive; go gently, follow their lead' : '';
  return `${capitalize(record.title)}${years}: ${when}${gentle}`;
}

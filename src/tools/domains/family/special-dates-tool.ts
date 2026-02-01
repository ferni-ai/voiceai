/**
 * Special Dates Tool
 *
 * Manage birthdays, anniversaries, and special dates for contacts.
 * "Remember mom's birthday is March 15th"
 *
 * @module tools/domains/family/special-dates-tool
 */

import { z } from 'zod';
import { createLogger } from '../../../utils/safe-logger.js';
import {
  saveSpecialDate,
  listSpecialDates,
  type SpecialDate,
} from '../../../intelligence/context-builders/family/special-dates-awareness.js';

const log = createLogger({ module: 'special-dates-tool' });

// ============================================================================
// SCHEMAS
// ============================================================================

export const rememberSpecialDateSchema = z.object({
  contactName: z.string().describe('Name of the person (e.g., "mom", "Betty", "Dad")'),
  dateType: z
    .enum(['birthday', 'anniversary', 'memorial', 'custom'])
    .describe('Type of special date'),
  date: z.string().describe('The date in natural format (e.g., "March 15", "3/15", "March 15th")'),
  year: z.number().optional().describe('Birth year (for calculating age) - optional'),
  label: z.string().optional().describe('Custom label for the date (e.g., "Mom\'s retirement")'),
});

export const listSpecialDatesSchema = z.object({
  contactName: z
    .string()
    .optional()
    .describe('Filter to a specific person, or leave empty for all'),
});

// ============================================================================
// DATE PARSING
// ============================================================================

/**
 * Validate that a day is valid for a given month
 */
function isValidDayForMonth(month: number, day: number): boolean {
  // Days in each month (non-leap year - we're lenient on Feb 29)
  const daysInMonth: Record<number, number> = {
    1: 31,
    2: 29,
    3: 31,
    4: 30,
    5: 31,
    6: 30,
    7: 31,
    8: 31,
    9: 30,
    10: 31,
    11: 30,
    12: 31,
  };

  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth[month]) return false;
  return true;
}

/**
 * Parse natural date format to MM-DD
 */
function parseToMMDD(dateStr: string): string | null {
  const months: Record<string, number> = {
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

  const lower = dateStr.toLowerCase().trim();

  // Try "Month Day" format (March 15, March 15th)
  const monthDayMatch = lower.match(/([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?/);
  if (monthDayMatch) {
    const month = months[monthDayMatch[1]];
    const day = parseInt(monthDayMatch[2]);
    if (month && isValidDayForMonth(month, day)) {
      return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // Try "Day Month" format (15 March, 15th of March)
  const dayMonthMatch = lower.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]+)/);
  if (dayMonthMatch) {
    const day = parseInt(dayMonthMatch[1]);
    const month = months[dayMonthMatch[2]];
    if (month && isValidDayForMonth(month, day)) {
      return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // Try MM/DD or M/D format
  const slashMatch = lower.match(/(\d{1,2})\/(\d{1,2})/);
  if (slashMatch) {
    const month = parseInt(slashMatch[1]);
    const day = parseInt(slashMatch[2]);
    if (isValidDayForMonth(month, day)) {
      return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // Try MM-DD format
  const dashMatch = lower.match(/(\d{1,2})-(\d{1,2})/);
  if (dashMatch) {
    const month = parseInt(dashMatch[1]);
    const day = parseInt(dashMatch[2]);
    if (isValidDayForMonth(month, day)) {
      return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  return null;
}

/**
 * Format MM-DD to readable format
 */
function formatDate(mmdd: string): string {
  const months = [
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

  const [month, day] = mmdd.split('-').map(Number);
  if (!month || !day) return mmdd;

  return `${months[month - 1]} ${day}`;
}

// ============================================================================
// TOOL IMPLEMENTATIONS
// ============================================================================

/**
 * Remember a special date for a contact
 */
export async function rememberSpecialDate(
  params: z.infer<typeof rememberSpecialDateSchema>,
  ctx: { userId: string }
): Promise<string> {
  const { contactName, dateType, date, year, label } = params;

  log.info({ contactName, dateType, date, userId: ctx.userId }, 'Remembering special date');

  // Parse the date
  const mmdd = parseToMMDD(date);
  if (!mmdd) {
    return (
      `I couldn't understand the date "${date}". ` + `Could you say it like "March 15" or "3/15"?`
    );
  }

  // Try to resolve contact phone from entity store
  let phone: string | undefined;
  try {
    const { findContactForTelephony, isEntityStoreReady } =
      await import('../../../memory/entity-store/integration.js');
    if (isEntityStoreReady()) {
      const contact = await findContactForTelephony(ctx.userId, contactName);
      if (contact) {
        phone = contact.phone;
      }
    }
  } catch {
    // Non-critical
  }

  // Save the date
  await saveSpecialDate(ctx.userId, {
    contactName,
    relationship: 'family', // Default, could be enhanced
    dateType,
    date: mmdd,
    year,
    label,
    phone,
  });

  // Build response
  const formattedDate = formatDate(mmdd);
  const dateTypeText = {
    birthday: 'birthday',
    anniversary: 'anniversary',
    memorial: 'memorial day',
    custom: label || 'special date',
  }[dateType];

  let response = `Got it! I'll remember ${contactName}'s ${dateTypeText} is on ${formattedDate}`;

  if (year && dateType === 'birthday') {
    const age = new Date().getFullYear() - year;
    response += ` (${age} years old this year)`;
  }

  response += `. I'll remind you when it's coming up!`;

  if (phone) {
    response += ` And I have their number, so I can call them for you on the day.`;
  }

  return response;
}

/**
 * List special dates
 */
export async function getSpecialDates(
  params: z.infer<typeof listSpecialDatesSchema>,
  ctx: { userId: string }
): Promise<string> {
  const { contactName } = params;

  const dates = await listSpecialDates(ctx.userId);

  if (dates.length === 0) {
    return (
      "I don't have any special dates saved yet. " +
      'You can tell me birthdays and anniversaries like: ' +
      '"Mom\'s birthday is March 15th" or "My parents\' anniversary is June 20th".'
    );
  }

  // Filter if contactName provided
  let filtered = dates;
  if (contactName) {
    const lower = contactName.toLowerCase();
    filtered = dates.filter((d) => d.contactName.toLowerCase().includes(lower));

    if (filtered.length === 0) {
      return `I don't have any special dates saved for "${contactName}". Want to add one?`;
    }
  }

  // Group by upcoming
  const today = new Date();
  const currentMMDD = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const sorted = [...filtered].sort((a, b) => {
    // Sort by how soon the date is
    const aNext = getNextOccurrence(a.date, currentMMDD);
    const bNext = getNextOccurrence(b.date, currentMMDD);
    return aNext - bNext;
  });

  const lines: string[] = ["Here are the special dates I'm tracking:", ''];

  for (const date of sorted) {
    const formattedDate = formatDate(date.date);
    const daysUntil = getDaysUntil(date.date);
    const untilText =
      daysUntil === 0
        ? '**TODAY!**'
        : daysUntil === 1
          ? 'tomorrow'
          : daysUntil <= 7
            ? `in ${daysUntil} days`
            : daysUntil <= 30
              ? `in ${Math.ceil(daysUntil / 7)} weeks`
              : `on ${formattedDate}`;

    const typeEmoji = {
      birthday: '🎂',
      anniversary: '💍',
      memorial: '🕯️',
      custom: '📅',
    }[date.dateType];

    lines.push(
      `${typeEmoji} **${date.contactName}**'s ${date.dateType}: ${formattedDate} (${untilText})`
    );
  }

  lines.push('');
  lines.push('Want me to add more, or call someone on their special day?');

  return lines.join('\n');
}

function getNextOccurrence(mmdd: string, todayMMDD: string): number {
  const [month, day] = mmdd.split('-').map(Number);
  const [todayMonth, todayDay] = todayMMDD.split('-').map(Number);

  const today = new Date();
  const thisYear = today.getFullYear();

  let targetDate = new Date(thisYear, month - 1, day);
  if (targetDate < today) {
    targetDate = new Date(thisYear + 1, month - 1, day);
  }

  return Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getDaysUntil(mmdd: string): number {
  const today = new Date();
  const todayMMDD = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return getNextOccurrence(mmdd, todayMMDD);
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export const specialDateTools = [
  {
    name: 'rememberSpecialDate',
    description:
      'Remember a birthday, anniversary, or special date for someone. Examples: "Mom\'s birthday is March 15", "Remember my parents\' anniversary is June 20th"',
    schema: rememberSpecialDateSchema,
    execute: rememberSpecialDate,
  },
  {
    name: 'listSpecialDates',
    description: 'List saved birthdays, anniversaries, and special dates. Can filter by person.',
    schema: listSpecialDatesSchema,
    execute: getSpecialDates,
  },
];

export default specialDateTools;

/**
 * Natural Language Date Parser
 *
 * Parses human-friendly date/time expressions into Date objects.
 * Designed for voice-first interactions where users say things like:
 * - "tomorrow at 3"
 * - "next Tuesday afternoon"
 * - "in 2 hours"
 * - "the 15th"
 *
 * No external dependencies - pure TypeScript implementation.
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'NaturalDateParser' });

// ============================================================================
// TYPES
// ============================================================================

export interface ParsedDateTime {
  date: Date;
  confidence: 'high' | 'medium' | 'low';
  original: string;
  interpretation: string; // Human-readable interpretation
  hasTime: boolean;
  hasDate: boolean;
  ambiguous?: boolean; // If we had to guess AM/PM etc
}

export interface ParseOptions {
  referenceDate?: Date; // Defaults to now
  defaultTime?: { hour: number; minute: number }; // Defaults to 9:00 AM
  timezone?: string;
  prefer?: 'future' | 'past'; // Defaults to 'future'
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_NAMES_SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'
];
const MONTH_NAMES_SHORT = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const TIME_OF_DAY: Record<string, { hour: number; minute: number }> = {
  'morning': { hour: 9, minute: 0 },
  'noon': { hour: 12, minute: 0 },
  'afternoon': { hour: 14, minute: 0 },
  'evening': { hour: 18, minute: 0 },
  'night': { hour: 20, minute: 0 },
  'midnight': { hour: 0, minute: 0 },
};

const RELATIVE_DAYS: Record<string, number> = {
  'today': 0,
  'tomorrow': 1,
  'day after tomorrow': 2,
  'yesterday': -1,
  'day before yesterday': -2,
};

// ============================================================================
// MAIN PARSER
// ============================================================================

/**
 * Parse a natural language date/time expression
 */
export function parseNaturalDate(input: string, options: ParseOptions = {}): ParsedDateTime | null {
  const {
    referenceDate = new Date(),
    defaultTime = { hour: 9, minute: 0 },
    prefer = 'future',
  } = options;

  const normalized = input.toLowerCase().trim();

  if (!normalized) {
    return null;
  }

  log.debug({ input: normalized }, 'Parsing natural date');

  // Try each parser in order of specificity
  const parsers = [
    parseExactDateTime,    // "December 15th at 3pm"
    parseRelativeDay,      // "tomorrow", "day after tomorrow"
    parseRelativeTime,     // "in 2 hours", "in 30 minutes"
    parseNextWeekday,      // "next Tuesday", "this Friday"
    parseDayOfMonth,       // "the 15th", "on the 3rd"
    parseTimeOfDay,        // "at 3pm", "at noon"
  ];

  for (const parser of parsers) {
    const result = parser(normalized, referenceDate, defaultTime, prefer);
    if (result) {
      log.debug({ input: normalized, interpretation: result.interpretation }, 'Date parsed successfully');
      return result;
    }
  }

  log.debug({ input: normalized }, 'Could not parse date');
  return null;
}

// ============================================================================
// INDIVIDUAL PARSERS
// ============================================================================

/**
 * Parse exact date/time like "December 15th at 3pm" or "March 3 at 2:30"
 */
function parseExactDateTime(
  input: string,
  reference: Date,
  defaultTime: { hour: number; minute: number },
  prefer: 'future' | 'past'
): ParsedDateTime | null {
  // Match: Month Day [at Time]
  // Examples: "december 15th at 3pm", "march 3 at 2:30", "jan 1"
  const monthPattern = MONTH_NAMES.concat(MONTH_NAMES_SHORT).join('|');
  const regex = new RegExp(
    `(${monthPattern})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(?:at\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?)?`,
    'i'
  );

  const match = input.match(regex);
  if (!match) return null;

  const monthStr = match[1].toLowerCase();
  const day = parseInt(match[2], 10);
  const hour = match[3] ? parseInt(match[3], 10) : defaultTime.hour;
  const minute = match[4] ? parseInt(match[4], 10) : (match[3] ? 0 : defaultTime.minute);
  const meridiem = match[5]?.toLowerCase();

  // Find month index
  let monthIndex = MONTH_NAMES.indexOf(monthStr);
  if (monthIndex === -1) {
    monthIndex = MONTH_NAMES_SHORT.indexOf(monthStr);
  }

  if (monthIndex === -1 || day < 1 || day > 31) {
    return null;
  }

  // Calculate hour in 24h format
  let hour24 = hour;
  if (meridiem === 'pm' && hour < 12) hour24 = hour + 12;
  if (meridiem === 'am' && hour === 12) hour24 = 0;

  // If no meridiem and hour is 1-6, probably PM in business context
  const ambiguous = !meridiem && hour >= 1 && hour <= 6;
  if (ambiguous && prefer === 'future') {
    hour24 = hour + 12; // Assume PM
  }

  // Build date (use current year, or next year if date has passed)
  let year = reference.getFullYear();
  const result = new Date(year, monthIndex, day, hour24, minute, 0, 0);

  // If prefer future and date is in past, bump to next year
  if (prefer === 'future' && result < reference) {
    result.setFullYear(year + 1);
  }

  return {
    date: result,
    confidence: meridiem ? 'high' : 'medium',
    original: input,
    interpretation: formatInterpretation(result, !!match[3]),
    hasTime: !!match[3],
    hasDate: true,
    ambiguous,
  };
}

/**
 * Parse relative days like "tomorrow", "today", "day after tomorrow"
 */
function parseRelativeDay(
  input: string,
  reference: Date,
  defaultTime: { hour: number; minute: number },
  _prefer: 'future' | 'past'
): ParsedDateTime | null {
  // Check for relative day keywords
  for (const [keyword, offset] of Object.entries(RELATIVE_DAYS)) {
    if (input.includes(keyword)) {
      const result = new Date(reference);
      result.setDate(result.getDate() + offset);

      // Check for time in the rest of the input
      const timeMatch = extractTime(input, defaultTime);
      result.setHours(timeMatch.hour, timeMatch.minute, 0, 0);

      return {
        date: result,
        confidence: 'high',
        original: input,
        interpretation: formatInterpretation(result, timeMatch.specified),
        hasTime: timeMatch.specified,
        hasDate: true,
      };
    }
  }

  return null;
}

/**
 * Parse relative time like "in 2 hours", "in 30 minutes"
 */
function parseRelativeTime(
  input: string,
  reference: Date,
  _defaultTime: { hour: number; minute: number },
  _prefer: 'future' | 'past'
): ParsedDateTime | null {
  // Match "in X hours/minutes/days"
  const regex = /in\s+(\d+)\s*(hours?|minutes?|mins?|days?|weeks?)/i;
  const match = input.match(regex);

  if (!match) return null;

  const amount = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  const result = new Date(reference);

  if (unit.startsWith('hour')) {
    result.setHours(result.getHours() + amount);
  } else if (unit.startsWith('min')) {
    result.setMinutes(result.getMinutes() + amount);
  } else if (unit.startsWith('day')) {
    result.setDate(result.getDate() + amount);
  } else if (unit.startsWith('week')) {
    result.setDate(result.getDate() + amount * 7);
  }

  return {
    date: result,
    confidence: 'high',
    original: input,
    interpretation: formatInterpretation(result, true),
    hasTime: true,
    hasDate: true,
  };
}

/**
 * Parse next weekday like "next Tuesday", "this Friday", "on Monday"
 */
function parseNextWeekday(
  input: string,
  reference: Date,
  defaultTime: { hour: number; minute: number },
  prefer: 'future' | 'past'
): ParsedDateTime | null {
  // Find day name
  let targetDay = -1;
  let isNext = input.includes('next');
  let isThis = input.includes('this');

  for (let i = 0; i < DAY_NAMES.length; i++) {
    if (input.includes(DAY_NAMES[i]) || input.includes(DAY_NAMES_SHORT[i])) {
      targetDay = i;
      break;
    }
  }

  if (targetDay === -1) return null;

  const currentDay = reference.getDay();
  let daysUntil = targetDay - currentDay;

  // Calculate days until target
  if (isNext) {
    // "next Tuesday" = the Tuesday in the next week
    if (daysUntil <= 0) daysUntil += 7;
    daysUntil += 7;
  } else if (isThis) {
    // "this Tuesday" = the Tuesday in the current week
    if (daysUntil < 0) daysUntil += 7;
  } else {
    // Just "Tuesday" = prefer future
    if (prefer === 'future' && daysUntil <= 0) {
      daysUntil += 7;
    } else if (prefer === 'past' && daysUntil >= 0) {
      daysUntil -= 7;
    }
  }

  const result = new Date(reference);
  result.setDate(result.getDate() + daysUntil);

  // Check for time in the rest of the input
  const timeMatch = extractTime(input, defaultTime);
  result.setHours(timeMatch.hour, timeMatch.minute, 0, 0);

  return {
    date: result,
    confidence: isNext || isThis ? 'high' : 'medium',
    original: input,
    interpretation: formatInterpretation(result, timeMatch.specified),
    hasTime: timeMatch.specified,
    hasDate: true,
  };
}

/**
 * Parse day of month like "the 15th", "on the 3rd"
 */
function parseDayOfMonth(
  input: string,
  reference: Date,
  defaultTime: { hour: number; minute: number },
  prefer: 'future' | 'past'
): ParsedDateTime | null {
  // Match "the 15th", "on the 3rd"
  const regex = /(?:the|on)\s+(\d{1,2})(?:st|nd|rd|th)?/i;
  const match = input.match(regex);

  if (!match) return null;

  const day = parseInt(match[1], 10);
  if (day < 1 || day > 31) return null;

  const result = new Date(reference);
  result.setDate(day);

  // If prefer future and date is in past, bump to next month
  if (prefer === 'future' && result <= reference) {
    result.setMonth(result.getMonth() + 1);
  }

  // Check for time in the rest of the input
  const timeMatch = extractTime(input, defaultTime);
  result.setHours(timeMatch.hour, timeMatch.minute, 0, 0);

  return {
    date: result,
    confidence: 'medium',
    original: input,
    interpretation: formatInterpretation(result, timeMatch.specified),
    hasTime: timeMatch.specified,
    hasDate: true,
  };
}

/**
 * Parse time of day like "at 3pm", "at noon", "at 2:30"
 */
function parseTimeOfDay(
  input: string,
  reference: Date,
  defaultTime: { hour: number; minute: number },
  prefer: 'future' | 'past'
): ParsedDateTime | null {
  const timeMatch = extractTime(input, defaultTime);

  if (!timeMatch.specified) {
    // Check for named times like "noon", "morning"
    for (const [name, time] of Object.entries(TIME_OF_DAY)) {
      if (input.includes(name)) {
        const result = new Date(reference);
        result.setHours(time.hour, time.minute, 0, 0);

        // If prefer future and time has passed, bump to tomorrow
        if (prefer === 'future' && result <= reference) {
          result.setDate(result.getDate() + 1);
        }

        return {
          date: result,
          confidence: 'high',
          original: input,
          interpretation: formatInterpretation(result, true),
          hasTime: true,
          hasDate: false,
        };
      }
    }
    return null;
  }

  const result = new Date(reference);
  result.setHours(timeMatch.hour, timeMatch.minute, 0, 0);

  // If prefer future and time has passed, bump to tomorrow
  if (prefer === 'future' && result <= reference) {
    result.setDate(result.getDate() + 1);
  }

  return {
    date: result,
    confidence: timeMatch.ambiguous ? 'medium' : 'high',
    original: input,
    interpretation: formatInterpretation(result, true),
    hasTime: true,
    hasDate: false,
    ambiguous: timeMatch.ambiguous,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Extract time from input string
 */
function extractTime(
  input: string,
  defaultTime: { hour: number; minute: number }
): { hour: number; minute: number; specified: boolean; ambiguous: boolean } {
  // Match "at 3pm", "at 2:30", "3 pm", "15:00"
  const regex = /(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;
  const match = input.match(regex);

  if (!match || !match[1]) {
    return { ...defaultTime, specified: false, ambiguous: false };
  }

  const hour = parseInt(match[1], 10);
  const minute = match[2] ? parseInt(match[2], 10) : 0;
  const meridiem = match[3]?.toLowerCase();

  // Validate
  if (hour > 23 || minute > 59) {
    return { ...defaultTime, specified: false, ambiguous: false };
  }

  // Calculate hour in 24h format
  let hour24 = hour;
  let ambiguous = false;

  if (meridiem === 'pm' && hour < 12) {
    hour24 = hour + 12;
  } else if (meridiem === 'am' && hour === 12) {
    hour24 = 0;
  } else if (!meridiem && hour >= 1 && hour <= 6) {
    // Business hours assumption: 1-6 without AM/PM = PM
    hour24 = hour + 12;
    ambiguous = true;
  }

  return { hour: hour24, minute, specified: true, ambiguous };
}

/**
 * Format interpretation string
 */
function formatInterpretation(date: Date, hasTime: boolean): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  };

  if (hasTime) {
    options.hour = 'numeric';
    options.minute = '2-digit';
  }

  return date.toLocaleString('en-US', options);
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Suggest how to phrase unclear inputs
 */
export function suggestClarification(parsed: ParsedDateTime): string | null {
  if (!parsed.ambiguous) return null;

  const time = parsed.date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return `Did you mean ${time}?`;
}

/**
 * Check if a date is valid for scheduling
 */
export function isValidForScheduling(date: Date): { valid: boolean; reason?: string } {
  const now = new Date();

  if (date < now) {
    return { valid: false, reason: "That time has already passed" };
  }

  // Check if too far in the future (1 year)
  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
  if (date > oneYearFromNow) {
    return { valid: false, reason: "That's more than a year away" };
  }

  return { valid: true };
}

/**
 * Get suggested times for a vague request
 */
export function suggestTimes(
  vagueness: 'morning' | 'afternoon' | 'evening' | 'sometime_today' | 'sometime_this_week',
  reference: Date = new Date()
): Date[] {
  const suggestions: Date[] = [];

  switch (vagueness) {
    case 'morning':
      for (const hour of [9, 10, 11]) {
        const d = new Date(reference);
        d.setHours(hour, 0, 0, 0);
        if (d > new Date()) suggestions.push(d);
      }
      break;

    case 'afternoon':
      for (const hour of [13, 14, 15, 16]) {
        const d = new Date(reference);
        d.setHours(hour, 0, 0, 0);
        if (d > new Date()) suggestions.push(d);
      }
      break;

    case 'evening':
      for (const hour of [17, 18, 19]) {
        const d = new Date(reference);
        d.setHours(hour, 0, 0, 0);
        if (d > new Date()) suggestions.push(d);
      }
      break;

    case 'sometime_today': {
      const now = new Date();
      const currentHour = now.getHours();
      for (let hour = currentHour + 1; hour <= 20; hour += 2) {
        const d = new Date(reference);
        d.setHours(hour, 0, 0, 0);
        suggestions.push(d);
      }
      break;
    }

    case 'sometime_this_week': {
      for (let dayOffset = 1; dayOffset <= 5; dayOffset++) {
        const d = new Date(reference);
        d.setDate(d.getDate() + dayOffset);
        d.setHours(10, 0, 0, 0); // Default to 10 AM
        suggestions.push(d);
      }
      break;
    }
  }

  return suggestions.slice(0, 3); // Return top 3 suggestions
}


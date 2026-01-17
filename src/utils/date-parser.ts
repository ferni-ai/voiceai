/**
 * Natural Language Date Parser
 *
 * Parses natural language date/time expressions into Date objects.
 * Handles common patterns like "tomorrow at 5pm", "in 2 hours", "Sunday morning".
 *
 * @module utils/date-parser
 */

import { getLogger } from './safe-logger.js';

const log = getLogger().child({ module: 'date-parser' });

// ============================================================================
// TIME PATTERNS
// ============================================================================

const TIME_PATTERNS = {
  // Exact times: "5pm", "5:30pm", "17:00", "5 pm"
  exactTime: /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i,

  // Time of day: "morning", "afternoon", "evening", "night"
  timeOfDay: /\b(morning|afternoon|evening|night|noon|midnight)\b/i,
};

const DAY_PATTERNS = {
  // Relative days: "today", "tomorrow", "day after tomorrow"
  today: /\btoday\b/i,
  tomorrow: /\btomorrow\b/i,
  dayAfterTomorrow: /\bday after tomorrow\b/i,

  // Weekdays: "Monday", "Tuesday", etc.
  weekday: /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,

  // Relative: "in X hours/days"
  relative: /\bin\s+(\d+)\s+(hour|hours|day|days|minute|minutes)\b/i,

  // This/Next: "this Monday", "next Sunday"
  thisNext: /\b(this|next)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
};

// Map day names to day of week (0 = Sunday)
const DAY_NAME_TO_NUMBER: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

// Map time of day to hours
const TIME_OF_DAY_HOURS: Record<string, number> = {
  morning: 9,
  noon: 12,
  afternoon: 14,
  evening: 18,
  night: 20,
  midnight: 0,
};

// ============================================================================
// MAIN PARSER
// ============================================================================

/**
 * Parse a natural language date/time string into a Date object.
 * Returns null if parsing fails.
 *
 * @example
 * parseNaturalDateTime("tomorrow at 5pm") // Tomorrow at 5:00 PM
 * parseNaturalDateTime("in 2 hours") // 2 hours from now
 * parseNaturalDateTime("Sunday morning") // Next Sunday at 9:00 AM
 */
export function parseNaturalDateTime(input: string, referenceDate: Date = new Date()): Date | null {
  const normalizedInput = input.toLowerCase().trim();

  try {
    // Start with the reference date/time
    const result = new Date(referenceDate);

    // Parse the day component
    const dayResult = parseDay(normalizedInput, result);
    if (dayResult) {
      result.setFullYear(dayResult.getFullYear());
      result.setMonth(dayResult.getMonth());
      result.setDate(dayResult.getDate());
    }

    // Parse the time component
    const timeResult = parseTime(normalizedInput, result);
    if (timeResult) {
      result.setHours(timeResult.hours, timeResult.minutes, 0, 0);
    } else if (!normalizedInput.match(DAY_PATTERNS.relative)) {
      // Default to 9 AM if no time specified and not a relative time
      result.setHours(9, 0, 0, 0);
    }

    // Handle relative times (these override everything else)
    const relativeMatch = normalizedInput.match(DAY_PATTERNS.relative);
    if (relativeMatch) {
      const amount = parseInt(relativeMatch[1], 10);
      const unit = relativeMatch[2].toLowerCase();

      const now = new Date(referenceDate);
      if (unit.startsWith('hour')) {
        now.setHours(now.getHours() + amount);
      } else if (unit.startsWith('day')) {
        now.setDate(now.getDate() + amount);
      } else if (unit.startsWith('minute')) {
        now.setMinutes(now.getMinutes() + amount);
      }
      return now;
    }

    // Ensure the result is in the future
    if (result <= referenceDate) {
      // If time has passed today, assume tomorrow
      if (dayResult === null) {
        result.setDate(result.getDate() + 1);
      }
    }

    log.debug({ input, result: result.toISOString() }, 'Parsed natural date/time');
    return result;
  } catch (error) {
    log.warn({ error, input }, 'Failed to parse natural date/time');
    return null;
  }
}

// ============================================================================
// HELPER PARSERS
// ============================================================================

/**
 * Parse the day component from input.
 */
function parseDay(input: string, reference: Date): Date | null {
  // Check for "today"
  if (DAY_PATTERNS.today.test(input)) {
    return new Date(reference);
  }

  // Check for "tomorrow"
  if (DAY_PATTERNS.tomorrow.test(input)) {
    const result = new Date(reference);
    result.setDate(result.getDate() + 1);
    return result;
  }

  // Check for "day after tomorrow"
  if (DAY_PATTERNS.dayAfterTomorrow.test(input)) {
    const result = new Date(reference);
    result.setDate(result.getDate() + 2);
    return result;
  }

  // Check for "this/next [weekday]"
  const thisNextMatch = input.match(DAY_PATTERNS.thisNext);
  if (thisNextMatch) {
    const modifier = thisNextMatch[1].toLowerCase(); // "this" or "next"
    const dayName = thisNextMatch[2].toLowerCase();
    const targetDay = DAY_NAME_TO_NUMBER[dayName];

    const result = new Date(reference);
    const currentDay = result.getDay();
    let daysToAdd = targetDay - currentDay;

    if (modifier === 'next' || daysToAdd <= 0) {
      // "next" always means the following week
      // Or if the day has passed this week
      daysToAdd += 7;
    }

    result.setDate(result.getDate() + daysToAdd);
    return result;
  }

  // Check for standalone weekday
  const weekdayMatch = input.match(DAY_PATTERNS.weekday);
  if (weekdayMatch) {
    const dayName = weekdayMatch[1].toLowerCase();
    const targetDay = DAY_NAME_TO_NUMBER[dayName];

    const result = new Date(reference);
    const currentDay = result.getDay();
    let daysToAdd = targetDay - currentDay;

    // If the day has passed this week, go to next week
    if (daysToAdd <= 0) {
      daysToAdd += 7;
    }

    result.setDate(result.getDate() + daysToAdd);
    return result;
  }

  return null;
}

/**
 * Parse the time component from input.
 */
function parseTime(input: string, _reference: Date): { hours: number; minutes: number } | null {
  // Check for time of day keywords
  const timeOfDayMatch = input.match(TIME_PATTERNS.timeOfDay);
  if (timeOfDayMatch) {
    const timeOfDay = timeOfDayMatch[1].toLowerCase();
    return { hours: TIME_OF_DAY_HOURS[timeOfDay], minutes: 0 };
  }

  // Check for exact time
  const exactTimeMatch = input.match(TIME_PATTERNS.exactTime);
  if (exactTimeMatch) {
    let hours = parseInt(exactTimeMatch[1], 10);
    const minutes = exactTimeMatch[2] ? parseInt(exactTimeMatch[2], 10) : 0;
    const ampm = exactTimeMatch[3]?.toLowerCase();

    // Handle 12-hour format
    if (ampm === 'pm' && hours < 12) {
      hours += 12;
    } else if (ampm === 'am' && hours === 12) {
      hours = 0;
    }

    // If no am/pm specified and hour is <= 7, assume PM for common sense
    if (!ampm && hours <= 7) {
      hours += 12;
    }

    return { hours, minutes };
  }

  return null;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Check if a string looks like it contains a date/time.
 */
export function containsDateTime(input: string): boolean {
  const normalizedInput = input.toLowerCase();

  return (
    DAY_PATTERNS.today.test(normalizedInput) ||
    DAY_PATTERNS.tomorrow.test(normalizedInput) ||
    DAY_PATTERNS.dayAfterTomorrow.test(normalizedInput) ||
    DAY_PATTERNS.weekday.test(normalizedInput) ||
    DAY_PATTERNS.relative.test(normalizedInput) ||
    DAY_PATTERNS.thisNext.test(normalizedInput) ||
    TIME_PATTERNS.exactTime.test(normalizedInput) ||
    TIME_PATTERNS.timeOfDay.test(normalizedInput)
  );
}

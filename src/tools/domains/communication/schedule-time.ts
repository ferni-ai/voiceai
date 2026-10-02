/**
 * Schedule Time Parsing
 *
 * Natural-language time parsing used by the communication tools when
 * scheduling calls and reminders.
 */

/**
 * Parse natural language into a scheduled time
 */
export function parseScheduleTime(naturalTime: string): Date | null {
  const now = new Date();
  const lower = naturalTime.toLowerCase();

  // Handle relative times
  if (lower.includes('tomorrow')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0); // Default to 9 AM
    return tomorrow;
  }

  if (lower.includes('next week')) {
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    nextWeek.setHours(9, 0, 0, 0);
    return nextWeek;
  }

  if (lower.includes('next month')) {
    const nextMonth = new Date(now);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    nextMonth.setHours(9, 0, 0, 0);
    return nextMonth;
  }

  // Handle day names
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < days.length; i++) {
    if (lower.includes(days[i])) {
      const target = new Date(now);
      const currentDay = now.getDay();
      const daysUntil = (i - currentDay + 7) % 7 || 7;
      target.setDate(target.getDate() + daysUntil);
      target.setHours(9, 0, 0, 0);
      return target;
    }
  }

  // Try to parse as date
  const parsed = new Date(naturalTime);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  return null;
}

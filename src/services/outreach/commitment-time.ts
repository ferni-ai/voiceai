/**
 * When a commitment is due, and when to check in on it, from its time reference
 * ("tomorrow", "by Friday", "in 2 days"). Moved from outreach-intelligence.ts unchanged.
 *
 * @module services/outreach/commitment-time
 */

/**
 * Parse time references like "tomorrow", "this week", "by Friday"
 */
export function parseTimeReference(timeRef: string, fromDate: Date): Date {
  const result = new Date(fromDate);
  const lower = timeRef.toLowerCase();

  if (lower === 'today' || lower === 'tonight') {
    // Today, evening
    result.setHours(20, 0, 0, 0);
  } else if (lower === 'tomorrow') {
    result.setDate(result.getDate() + 1);
    result.setHours(18, 0, 0, 0);
  } else if (lower === 'this week' || lower === 'this weekend') {
    // End of week
    const daysUntilFriday = (5 - result.getDay() + 7) % 7 || 7;
    result.setDate(result.getDate() + daysUntilFriday);
    result.setHours(18, 0, 0, 0);
  } else if (lower === 'next week') {
    result.setDate(result.getDate() + 7);
    result.setHours(18, 0, 0, 0);
  } else if (lower.startsWith('by ')) {
    // "by Friday", "by Monday"
    const dayName = lower.replace('by ', '');
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const targetDay = days.indexOf(dayName);
    if (targetDay >= 0) {
      const daysUntil = (targetDay - result.getDay() + 7) % 7 || 7;
      result.setDate(result.getDate() + daysUntil);
      result.setHours(18, 0, 0, 0);
    }
  } else if (lower.startsWith('in ')) {
    // "in 2 days", "in 1 hour"
    const match = lower.match(/in (\d+) (day|hour|minute|week)s?/);
    if (match) {
      const amount = parseInt(match[1]);
      const unit = match[2];
      switch (unit) {
        case 'minute':
          result.setMinutes(result.getMinutes() + amount);
          break;
        case 'hour':
          result.setHours(result.getHours() + amount);
          break;
        case 'day':
          result.setDate(result.getDate() + amount);
          break;
        case 'week':
          result.setDate(result.getDate() + amount * 7);
          break;
      }
    }
  }

  return result;
}

/**
 * Calculate when to check in based on commitment timing
 */
export function calculateCheckInTime(targetTime: Date, timeRef: string): Date {
  const checkIn = new Date(targetTime);
  const lower = timeRef.toLowerCase();

  // Check in after the commitment time has passed
  if (lower === 'today' || lower === 'tonight') {
    // Check in that evening or next morning
    checkIn.setHours(checkIn.getHours() + 2);
  } else if (lower === 'tomorrow') {
    // Check in tomorrow evening
    checkIn.setHours(20, 0, 0, 0);
  } else {
    // For longer commitments, check in at the deadline
    checkIn.setHours(19, 0, 0, 0);
  }

  return checkIn;
}

/**
 * Nayan's Wisdom Insights - Calendar Context
 *
 * Builds calendar context for wisdom timing - Nayan needs to know
 * when there's space for deep reflection.
 *
 * @module intelligence/context-builders/nayan-wisdom-insights/calendar-context
 */

import { getCalendarLoadFactors } from '../../../../services/calendar/calendar-load-service.js';
import { getAmbientCalendarContext } from '../../../../services/calendar/ambient-calendar-awareness.js';
import type { CalendarWisdomContext } from './types.js';

// ============================================================================
// CALENDAR WISDOM CONTEXT
// ============================================================================

/**
 * Build calendar context for Nayan's wisdom conversations.
 * Nayan is about depth and reflection - he needs to know when there's space for that.
 */
export async function buildCalendarWisdomContext(
  userId: string
): Promise<CalendarWisdomContext> {
  const [loadFactors, ambientContext] = await Promise.all([
    getCalendarLoadFactors(userId),
    getAmbientCalendarContext(userId),
  ]);

  // Determine load level
  let loadLevel: CalendarWisdomContext['loadLevel'] = 'light';
  if (loadFactors.weeklyMeetingHours >= 35) {
    loadLevel = 'overloaded';
  } else if (loadFactors.weeklyMeetingHours >= 25) {
    loadLevel = 'heavy';
  } else if (loadFactors.weeklyMeetingHours >= 15) {
    loadLevel = 'moderate';
  }

  // Is now a good time for deep reflection?
  const nextMeeting = ambientContext.nextMeeting;
  const justEnded = ambientContext.justEndedMeeting;
  const minutesToNext = nextMeeting.minutesUntil ?? Infinity;
  const justFromMeeting = justEnded.event !== null;
  const hasSpace = minutesToNext > 30;
  const isQuietTime = loadLevel === 'light' || (loadLevel === 'moderate' && hasSpace);

  // Don't push deep reflection right after a meeting
  const isGoodTimeForReflection = !justFromMeeting && hasSpace && loadLevel !== 'overloaded';

  // Generate wisdom timing suggestion
  let wisdomTimingSuggestion: string | null = null;

  if (justFromMeeting) {
    wisdomTimingSuggestion =
      'User just emerged from a meeting - ease into conversation, let them decompress before depth';
  } else if (loadLevel === 'overloaded') {
    wisdomTimingSuggestion =
      'Heavy calendar week - keep wisdom practical and grounded, save philosophical depth for lighter times';
  } else if (isGoodTimeForReflection && loadLevel === 'light') {
    wisdomTimingSuggestion =
      'Clear calendar - excellent time for deeper exploration and meaningful questions';
  } else if (minutesToNext < 15 && minutesToNext > 0) {
    wisdomTimingSuggestion = 'Meeting soon - plant a seed of thought rather than diving deep';
  }

  // Generate busyness pattern insight (Nayan's perspective)
  let busynessInsight: string | null = null;

  if (loadLevel === 'overloaded' && loadFactors.consecutiveOverloadedDays >= 3) {
    busynessInsight =
      'Three or more days of meetings upon meetings - the question is not what to add, but what to release';
  } else if (loadFactors.weeklyFocusTimeRatio < 0.2) {
    busynessInsight = "Less than 20% of time unscheduled - they are 'busy' but are they present?";
  } else if (loadLevel === 'light' && loadFactors.weeklyMeetingHours < 10) {
    busynessInsight = 'Light calendar - rare space for being rather than doing';
  }

  return {
    loadLevel,
    isGoodTimeForReflection,
    bestDayForDepth: loadFactors.lightestDayThisWeek,
    wisdomTimingSuggestion,
    busynessInsight,
    justFromMeeting,
    quietTimeAvailable: isQuietTime,
  };
}


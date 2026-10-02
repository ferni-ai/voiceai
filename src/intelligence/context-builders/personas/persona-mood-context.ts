/**
 * Persona Mood Context
 *
 * The situation a persona's mood is chosen in: the caller's time of day,
 * weekday, recent conversation count and the mood the last conversation
 * ended in.
 */

import type { MoodState } from '../../../types/humanizing-types.js';
import { localClock } from '../../../utils/local-clock.js';

export interface MoodContext {
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: number; // 0-6, Sunday = 0
  isWeekend: boolean;
  weatherMood?: 'sunny' | 'rainy' | 'stormy' | 'neutral';
  recentConversationCount: number; // How many conversations recently
  /** The mood the persona ended the previous conversation in. */
  lastMood?: MoodState;
  /** Hours since that conversation; a recent mood lingers, an old one gives way to variety. */
  hoursSinceLastMood?: number;
}

/** A mood from a conversation this recent still colors the next one. */
export const MOOD_LINGER_HOURS = 12;

/**
 * Get mood context from current time
 */
export function getMoodContext(
  recentConversationCount = 0,
  lastMood?: MoodState,
  hoursSinceLastMood?: number,
  timezone?: string
): MoodContext {
  // The caller's clock: a persona is sleepy at their midnight, not the server's
  const { hour, dayOfWeek } = localClock(timezone);

  let timeOfDay: MoodContext['timeOfDay'];
  if (hour >= 5 && hour < 12) {
    timeOfDay = 'morning';
  } else if (hour >= 12 && hour < 17) {
    timeOfDay = 'afternoon';
  } else if (hour >= 17 && hour < 21) {
    timeOfDay = 'evening';
  } else {
    timeOfDay = 'night';
  }

  return {
    timeOfDay,
    dayOfWeek,
    isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    recentConversationCount,
    lastMood,
    hoursSinceLastMood,
  };
}

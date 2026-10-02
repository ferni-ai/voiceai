/**
 * TTS Context Helpers
 *
 * BETTER THAN HUMAN: small context helpers for natural tool responses —
 * persona display names and time-of-day awareness on the caller's clock.
 */

import { localClock } from '../../utils/local-clock.js';
import type { TtsSessionContext } from './tts-wrapper.js';

/**
 * Persona display names for personalized voice guidance
 */
const PERSONA_DISPLAY_NAMES: Record<string, string> = {
  ferni: 'Ferni',
  'maya-santos': 'Maya',
  'peter-john': 'Peter',
  'alex-chen': 'Alex',
  'jordan-taylor': 'Jordan',
  'nayan-patel': 'Nayan',
  'joel-dickson': 'Joel',
};

/**
 * Get persona display name from persona ID
 */
export function getPersonaDisplayName(personaId?: string): string | undefined {
  if (!personaId) return undefined;
  return PERSONA_DISPLAY_NAMES[personaId];
}

/**
 * Compute time context for time-aware responses, on the caller's clock
 */
export function computeTimeContext(timezone?: string): TtsSessionContext['timeContext'] {
  const { hour, dayOfWeek: day } = localClock(timezone);

  // Determine time of day
  let timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night' | 'late-night';
  if (hour < 6) {
    timeOfDay = 'late-night';
  } else if (hour < 12) {
    timeOfDay = 'morning';
  } else if (hour < 17) {
    timeOfDay = 'afternoon';
  } else if (hour < 21) {
    timeOfDay = 'evening';
  } else {
    timeOfDay = 'night';
  }

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return {
    timeOfDay,
    dayOfWeek: dayNames[day],
    isWeekend: day === 0 || day === 6,
  };
}

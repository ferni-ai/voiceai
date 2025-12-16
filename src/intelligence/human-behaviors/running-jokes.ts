/**
 * Running Jokes System
 *
 * Manages running jokes and callbacks that build relationship over time.
 * Now loads from persona bundles for variation and maintainability.
 *
 * @module intelligence/human-behaviors/running-jokes
 */

import type { UserProfile } from '../../types/user-profile.js';

// ============================================================================
// TYPES
// ============================================================================

export interface RunningJoke {
  id: string;
  setup: string;
  callback: string;
  context: string;
  usageCount: number;
  lastUsed?: Date;
}

// ============================================================================
// FALLBACK JOKES (Used if bundle loading fails)
// ============================================================================

const FALLBACK_JOKES: Record<string, RunningJoke[]> = {
  ferni: [
    {
      id: 'powerful_question',
      setup: "That's a powerful question. Let me sit with it.",
      callback: "You know I love a powerful question. There's another one.",
      context: 'question',
      usageCount: 0,
    },
  ],
  'nayan-patel': [
    {
      id: 'stay_the_course',
      setup: "Stay the course! That's my motto.",
      callback: "What's my motto? Come on, you know this one...",
      context: 'market_volatility',
      usageCount: 0,
    },
  ],
};

// ============================================================================
// JOKE RETRIEVAL
// ============================================================================

/**
 * Get a running joke callback if appropriate
 */
export function getRunningJokeCallback(
  profile: UserProfile | null,
  currentTopic: string,
  personaId?: string
): { joke: string; isCallback: boolean } | null {
  if (!profile || profile.totalConversations < 2) return null;

  // Get persona-specific jokes
  const jokes =
    personaId && FALLBACK_JOKES[personaId] ? FALLBACK_JOKES[personaId] : FALLBACK_JOKES['ferni'];

  // Check if we've used this joke before
  const sharedStories = profile.sharedStories || [];

  for (const joke of jokes) {
    if (currentTopic.toLowerCase().includes(joke.context)) {
      const previouslyUsed = sharedStories.some((s) => s.storyId === joke.id);

      if (previouslyUsed && Math.random() < 0.3) {
        // 30% chance to callback
        return { joke: joke.callback, isCallback: true };
      } else if (!previouslyUsed && Math.random() < 0.2) {
        // 20% chance to tell joke
        return { joke: joke.setup, isCallback: false };
      }
    }
  }

  return null;
}

export default getRunningJokeCallback;

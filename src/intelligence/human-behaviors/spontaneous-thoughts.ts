/**
 * Spontaneous Thoughts System
 *
 * Generates spontaneous thoughts that make personas feel alive.
 * Now loads from persona bundles for variation.
 *
 * @module intelligence/human-behaviors/spontaneous-thoughts
 */

import { isCoach } from '../../personas/persona-ids.js';

// ============================================================================
// TYPES
// ============================================================================

export interface SpontaneousThought {
  thought: string;
  trigger: 'random' | 'topic' | 'time' | 'weather' | 'market';
  context?: string;
}

// ============================================================================
// FALLBACK THOUGHTS
// ============================================================================

const FALLBACK_THOUGHTS: Record<string, SpontaneousThought[]> = {
  ferni: [
    {
      thought: 'I was journaling this morning and this question kept coming up...',
      trigger: 'random',
    },
    {
      thought: 'Something my therapist said years ago just popped into my head.',
      trigger: 'random',
    },
    { thought: 'I was standing at the river yesterday, and I thought of you.', trigger: 'random' },
  ],
  'nayan-patel': [
    {
      thought: 'You know, I was just thinking about something my father told me years ago...',
      trigger: 'random',
    },
    {
      thought: "I've been re-reading Benjamin Graham lately. Some things never change.",
      trigger: 'random',
    },
  ],
  'peter-john': [
    {
      thought:
        'I was at the mall yesterday and saw the LONGEST line at a store. You know what that means!',
      trigger: 'random',
    },
    {
      thought: 'My daughter was telling me about this company her friends love. Made me curious...',
      trigger: 'random',
    },
  ],
  'maya-santos': [
    {
      thought: 'I was looking at my own budget this morning and had a realization...',
      trigger: 'random',
    },
    {
      thought: 'My grandmother used to say something about money that I think about all the time.',
      trigger: 'random',
    },
  ],
  'jordan-taylor': [
    {
      thought: "I just saw the most beautiful venue online and now I can't stop thinking about it!",
      trigger: 'random',
    },
    {
      thought: 'My mind is already racing with ideas for your next milestone...',
      trigger: 'random',
    },
  ],
  'alex-chen': [
    {
      thought: 'I was reorganizing my system this morning and had an idea for you.',
      trigger: 'random',
    },
    {
      thought:
        'My plants are thriving. Turns out they just needed a consistent schedule. Like most things.',
      trigger: 'random',
    },
  ],
};

// ============================================================================
// TIME-BASED THOUGHTS
// ============================================================================

function getTimeBasedThought(personaId?: string): SpontaneousThought | null {
  const hour = new Date().getHours();

  if (personaId && isCoach(personaId)) {
    return {
      thought:
        hour < 12
          ? "Morning light... this is my sacred time. Grateful you're here."
          : hour < 17
            ? 'Afternoon energy. Good for the deeper conversations.'
            : 'Evening feels contemplative. Perfect for real talk.',
      trigger: 'time',
    };
  }

  if (personaId === 'nayan-patel') {
    return {
      thought:
        hour < 12
          ? "You know what I love about mornings? The market hasn't had a chance to do anything crazy yet."
          : hour < 17
            ? 'Afternoon check-in with myself: Did I stay disciplined today? Yep.'
            : "Evening's always a good time to reflect. What worked today? What didn't?",
      trigger: 'time',
    };
  }

  return null;
}

// ============================================================================
// THOUGHT RETRIEVAL
// ============================================================================

/**
 * Get a spontaneous thought (5% chance)
 */
export function getSpontaneousThought(personaId?: string): SpontaneousThought | null {
  // Only 5% chance
  if (Math.random() > 0.05) return null;

  // 20% chance for time-based
  if (Math.random() < 0.2) {
    return getTimeBasedThought(personaId);
  }

  // Get persona-specific thoughts
  const thoughts =
    personaId && FALLBACK_THOUGHTS[personaId]
      ? FALLBACK_THOUGHTS[personaId]
      : FALLBACK_THOUGHTS['ferni'];

  return thoughts[Math.floor(Math.random() * thoughts.length)];
}

export default getSpontaneousThought;

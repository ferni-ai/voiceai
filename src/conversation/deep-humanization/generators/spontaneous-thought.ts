/**
 * Spontaneous Thought Generator
 *
 * Generates unprompted observations that make the agent feel like they have
 * genuine thoughts and curiosities, not just responses to user input.
 *
 * @module @ferni/conversation/deep-humanization/generators/spontaneous-thought
 */

import { seededChance, seededIndex, seededPick } from '../../utils/rng.js';
import type {
  HumanizationContext,
  ConversationMood,
  HumanizationSignals,
  GeneratorResult,
} from '../types.js';
import { HUMANIZATION_CONFIG } from '../../humanization-tuning.js';

// ============================================================================
// SPONTANEOUS THOUGHT TEMPLATES
// ============================================================================

const THOUGHT_TEMPLATES = {
  observation: [
    'You know what just hit me?',
    'Something just occurred to me...',
    'Wait, I just noticed something.',
    'Huh, I just realized...',
  ],
  connection: [
    'This reminds me of something...',
    'You know what this connects to?',
    'There is something I have been thinking about...',
    'This ties into something bigger...',
  ],
  curiosity: [
    'I am curious about something...',
    'Can I ask you something?',
    'Something has been on my mind...',
    'I have been wondering...',
  ],
  reflection: [
    'It is interesting, actually...',
    'The more I think about it...',
    'You know what strikes me?',
    'What stands out to me is...',
  ],
};

// Context-specific thoughts
const CONTEXT_THOUGHTS = {
  morning: [
    'How did you sleep?',
    'What does your morning look like?',
    'Started the day with any rituals?',
  ],
  evening: ['How was your day?', 'Winding down?', 'What is on your mind tonight?'],
  latenight: [
    'Burning the midnight oil?',
    'Sometimes the quiet hours bring clarity...',
    'Late night thoughts hitting different?',
  ],
};

// ============================================================================
// GENERATOR
// ============================================================================

/**
 * Generate a spontaneous thought
 */
export async function generateSpontaneousThought(
  context: HumanizationContext,
  mood: ConversationMood,
  signals: HumanizationSignals
): Promise<GeneratorResult> {
  const probability = HUMANIZATION_CONFIG.probabilities.spontaneousThought;

  // Higher probability when user is highly engaged
  const adjustedProbability = signals.isHighlyEngaged ? probability * 1.3 : probability;

  if (!seededChance(`${Date.now()}:1`, adjustedProbability)) {
    return null;
  }

  // Skip during emotional moments - stay focused on them
  if (mood.inEmotionalMoment) {
    return null;
  }

  let thoughts: string[];

  // Time-of-day awareness
  if (context.currentHour >= 5 && context.currentHour < 11) {
    thoughts = [...THOUGHT_TEMPLATES.observation, ...CONTEXT_THOUGHTS.morning];
  } else if (context.currentHour >= 17 && context.currentHour < 22) {
    thoughts = [...THOUGHT_TEMPLATES.reflection, ...CONTEXT_THOUGHTS.evening];
  } else if (context.currentHour >= 22 || context.currentHour < 5) {
    thoughts = [...THOUGHT_TEMPLATES.curiosity, ...CONTEXT_THOUGHTS.latenight];
  } else {
    // Daytime - use engagement-based templates
    if (signals.isHighlyEngaged) {
      thoughts = [...THOUGHT_TEMPLATES.connection, ...THOUGHT_TEMPLATES.curiosity];
    } else {
      thoughts = [...THOUGHT_TEMPLATES.observation, ...THOUGHT_TEMPLATES.reflection];
    }
  }

  const content = seededPick(`${Date.now()}:109`, thoughts) ?? thoughts[0];

  return {
    type: 'spontaneous_thought',
    content,
    placement: 'prefix',
    probability: adjustedProbability,
    cooldownTurns: HUMANIZATION_CONFIG.cooldowns.spontaneousThought,
  };
}

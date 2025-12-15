/**
 * Playfulness Generator
 *
 * Generates light, playful moments that make conversations feel human.
 * These are small jokes, teasing, and fun observations - but ONLY when appropriate.
 *
 * @module @ferni/conversation/deep-humanization/generators/playfulness
 */

import type {
  HumanizationContext,
  ConversationMood,
  HumanizationSignals,
  GeneratorResult,
} from '../types.js';
import { HUMANIZATION_CONFIG } from '../../humanization-tuning.js';

// ============================================================================
// PLAYFULNESS TEMPLATES
// ============================================================================

const PLAYFUL_OPENERS = [
  'Okay, I have to say it—',
  'Can we appreciate for a second—',
  'Not to be dramatic, but—',
  'I mean, look at you—',
  'Between you and me—',
];

const TEASING = [
  'Classic you.',
  'Why am I not surprised?',
  'There it is.',
  'Called it.',
  'Of course.',
];

const LIGHT_JOKES = [
  'No pressure or anything.',
  'Just a casual Tuesday, then.',
  'Totally normal.',
  'As one does.',
  'Obviously.',
];

const CELEBRATION_PLAYFUL = [
  'Look who is crushing it!',
  'Oh, we love to see it.',
  'That is what I am talking about!',
  'Get it!',
  'Yes!',
];

// ============================================================================
// GENERATOR
// ============================================================================

/**
 * Generate a playful moment
 */
export async function generatePlayfulness(
  context: HumanizationContext,
  mood: ConversationMood,
  signals: HumanizationSignals
): Promise<GeneratorResult> {
  // NEVER be playful during emotional/heavy moments
  if (mood.inEmotionalMoment || mood.emotionalLoad > 0.4) {
    return null;
  }

  // Only be playful with established relationships
  if (context.relationshipStage === 'stranger') {
    return null;
  }

  const probability = HUMANIZATION_CONFIG.probabilities.playfulness;

  // Higher probability with friends and trusted advisors
  const relationshipBoost = context.relationshipStage === 'trusted_advisor' ? 1.4 :
    context.relationshipStage === 'friend' ? 1.2 : 1.0;

  const adjustedProbability = probability * relationshipBoost;

  if (Math.random() > adjustedProbability) {
    return null;
  }

  // Choose playfulness type
  let phrases: string[];

  if (signals.isBreakthroughMoment || signals.isHighlyEngaged) {
    // Celebratory playfulness
    phrases = CELEBRATION_PLAYFUL;
  } else if (context.sessionData?.patterns && context.sessionData.patterns.length > 0) {
    // Teasing about known patterns
    phrases = TEASING;
  } else if (mood.energy > 0.7) {
    // High energy playfulness
    phrases = [...PLAYFUL_OPENERS, ...LIGHT_JOKES];
  } else {
    // Default to light jokes
    phrases = LIGHT_JOKES;
  }

  const content = phrases[Math.floor(Math.random() * phrases.length)];

  return {
    type: 'playfulness',
    content,
    placement: 'prefix',
    probability: adjustedProbability,
    cooldownTurns: HUMANIZATION_CONFIG.cooldowns.playfulness,
  };
}


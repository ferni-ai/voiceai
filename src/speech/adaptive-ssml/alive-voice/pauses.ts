/**
 * Dynamic Pause Scaling
 *
 * Applies pause durations based on topic weight.
 * Heavier topics get longer pauses for processing and presence.
 *
 * @module speech/adaptive-ssml/alive-voice/pauses
 */

import type { AliveVoiceContext, PauseScale, TopicWeight } from './types.js';

// =============================================================================
// PAUSE CONFIGURATION
// =============================================================================

/**
 * Pause durations by topic weight and context.
 */
export const PAUSE_SCALES: Record<TopicWeight, PauseScale> = {
  light: {
    sentence: 150,
    comma: 80,
    question: 180,
    emphasis: 100,
    breathingRoom: 120,
  },
  medium: {
    sentence: 250,
    comma: 120,
    question: 280,
    emphasis: 150,
    breathingRoom: 200,
  },
  heavy: {
    sentence: 400,
    comma: 180,
    question: 450,
    emphasis: 250,
    breathingRoom: 350,
  },
};

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Apply dynamic pause scaling based on topic weight.
 * Heavier topics get longer pauses for processing and presence.
 */
export function applyDynamicPauses(text: string, context: AliveVoiceContext): string {
  const weight = context.topicWeight || 'medium';
  const pauses = PAUSE_SCALES[weight];

  let result = text;

  // Scale existing breaks
  result = result.replace(/<break time="(\d+)ms"\/>/g, (_match, ms) => {
    const original = parseInt(ms);
    let scaled: number;

    // Scale based on weight
    if (weight === 'heavy') {
      scaled = Math.round(original * 1.5);
    } else if (weight === 'light') {
      scaled = Math.round(original * 0.75);
    } else {
      scaled = original;
    }

    return `<break time="${Math.min(scaled, 800)}ms"/>`;
  });

  // Add pauses at natural boundaries if not present
  if (!result.includes('<break')) {
    // After sentences (not already tagged)
    result = result.replace(/\.(\s+)([A-Z])/g, `.<break time="${pauses.sentence}ms"/>$1$2`);

    // After questions
    result = result.replace(/\?(\s+)([A-Z])/g, `?<break time="${pauses.question}ms"/>$1$2`);

    // Longer pause for heavy topics before important words
    if (weight === 'heavy') {
      result = result.replace(
        /\b(important|crucial|matter|care|feel|hard|difficult|loss|grief)\b/gi,
        `<break time="${pauses.emphasis}ms"/>$1`
      );
    }
  }

  return result;
}

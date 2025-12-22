/**
 * Speed Variation Within Sentences
 *
 * Creates natural pacing like human speech:
 * - Slow down for emphasis
 * - Speed up for asides and parentheticals
 *
 * @module speech/adaptive-ssml/alive-voice/speed-variation
 */

import { getLogger } from '../../../utils/safe-logger.js';
import type { AliveVoiceContext, SpeedVariationPattern } from './types.js';

const log = getLogger().child({ module: 'AliveVoice.SpeedVariation' });

// =============================================================================
// SPEED VARIATION PATTERNS
// =============================================================================

/**
 * Patterns for speed variation.
 * Slow down for emphasis, speed up for asides and parentheticals.
 */
export const SPEED_VARIATION_PATTERNS: SpeedVariationPattern[] = [
  // Slow down for emphasis
  {
    pattern:
      /\b(really |truly |deeply |genuinely |absolutely )(important|matter|care|love|proud|grateful)\b/gi,
    replacement: '<speed ratio="0.88"/>$1$2<speed ratio="1.0"/>',
    type: 'emphasis',
  },
  // Speed up for asides/parentheticals
  {
    pattern: /(\([^)]+\))/g,
    replacement: '<speed ratio="1.08"/>$1<speed ratio="1.0"/>',
    type: 'aside',
  },
  // Slow down for important questions
  {
    pattern:
      /\b(what (?:do you think|matters|would you)|how (?:do you feel|does that|would you))\b/gi,
    replacement: '<speed ratio="0.90"/>$1<speed ratio="1.0"/>',
    type: 'deep_question',
  },
  // Speed up for lists/enumerations
  {
    pattern: /\b(first|second|third|also|and|plus)\b,/gi,
    replacement: '<speed ratio="1.05"/>$1,<speed ratio="1.0"/>',
    type: 'enumeration',
  },
  // Slow down before important conclusions
  {
    pattern: /\b(so,? (?:what I'm saying is|the point is|basically)|in other words,?)/gi,
    replacement: '<speed ratio="0.85"/>$1<speed ratio="1.0"/>',
    type: 'conclusion',
  },
];

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Apply speed variations within sentences.
 * Creates natural pacing like human speech.
 */
export function applySpeedVariation(text: string, context: AliveVoiceContext): string {
  // Don't over-vary in heavy topics - keep it steady
  if (context.topicWeight === 'heavy') {
    return text;
  }

  let result = text;
  const appliedVariations: string[] = [];

  // Limit to 2 variations per response
  let variationCount = 0;
  const maxVariations = 2;

  for (const variation of SPEED_VARIATION_PATTERNS) {
    if (variationCount >= maxVariations) break;

    if (variation.pattern.test(result)) {
      variation.pattern.lastIndex = 0;
      result = result.replace(variation.pattern, (match, ...args) => {
        if (variationCount >= maxVariations) return match;
        variationCount++;
        appliedVariations.push(variation.type);
        // Reconstruct replacement with captured groups
        let replacement = variation.replacement;
        args.slice(0, -2).forEach((arg, i) => {
          replacement = replacement.replace(`$${i + 1}`, arg || '');
        });
        return replacement;
      });
    }
  }

  if (appliedVariations.length > 0) {
    log.debug({ variations: appliedVariations }, 'Applied speed variations');
  }

  return result;
}


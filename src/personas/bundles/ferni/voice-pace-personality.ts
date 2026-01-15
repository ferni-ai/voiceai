/**
 * Voice Pace → Personality Integration
 *
 * Adapts personality expressions based on the user's speaking pace and rhythm.
 *
 * Fast talker → Match energy, shorter expressions, quicker injections
 * Slow talker → More deliberate, longer pauses, deeper expressions
 * Rushed → Be efficient, validate their time pressure
 * Relaxed → Take time, add more texture
 *
 * @module personas/bundles/ferni/voice-pace-personality
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type {
  PaceCategory,
  EnergyLevel,
  ConversationTempo,
  LearnedPacePreferences,
} from '../../../intelligence/voice-pace-adapter.js';

const log = createLogger({ module: 'voice-pace-personality' });

// ============================================================================
// TYPES
// ============================================================================

export interface PacePersonalityAdjustment {
  /** Prefer shorter or longer expressions */
  expressionLength: 'brief' | 'normal' | 'detailed';

  /** Add more or fewer pauses in SSML */
  pauseMultiplier: number; // 0.5 = half pauses, 2.0 = double pauses

  /** Preferred injection timing */
  preferredTiming: 'immediate' | 'after_pause' | 'mid_response' | 'at_end';

  /** Whether to include more texture/detail */
  includeTexture: boolean;

  /** Energy level to match */
  targetEnergy: 'low' | 'medium' | 'high';

  /** Should we validate time pressure? */
  acknowledgeRush: boolean;

  /** Maximum expression word count */
  maxExpressionWords: number;

  /** Reason for adjustment */
  reason: string;
}

export interface CurrentPaceContext {
  /** Current speech rate in WPM */
  currentWPM?: number;

  /** Current pace category */
  paceCategory?: PaceCategory;

  /** Current energy level */
  energyLevel?: EnergyLevel;

  /** Current tempo */
  tempo?: ConversationTempo;

  /** Is user rushed right now? */
  seemsRushed?: boolean;

  /** Is user relaxed right now? */
  seemsRelaxed?: boolean;

  /** Time since last user message (ms) */
  responseLatencyMs?: number;

  /** Did user interrupt? */
  wasInterruption?: boolean;
}

// ============================================================================
// PACE → PERSONALITY MAPPINGS
// ============================================================================

const PACE_ADJUSTMENTS: Record<PaceCategory, Partial<PacePersonalityAdjustment>> = {
  very_slow: {
    expressionLength: 'detailed',
    pauseMultiplier: 1.5,
    preferredTiming: 'after_pause',
    includeTexture: true,
    targetEnergy: 'low',
    maxExpressionWords: 40,
    reason: 'User speaks slowly - taking time with expressions',
  },
  slow: {
    expressionLength: 'normal',
    pauseMultiplier: 1.2,
    preferredTiming: 'mid_response',
    includeTexture: true,
    targetEnergy: 'medium',
    maxExpressionWords: 30,
    reason: 'User speaks at relaxed pace',
  },
  moderate: {
    expressionLength: 'normal',
    pauseMultiplier: 1.0,
    preferredTiming: 'mid_response',
    includeTexture: true,
    targetEnergy: 'medium',
    maxExpressionWords: 25,
    reason: 'Standard pace - normal expressions',
  },
  fast: {
    expressionLength: 'brief',
    pauseMultiplier: 0.8,
    preferredTiming: 'immediate',
    includeTexture: false,
    targetEnergy: 'high',
    maxExpressionWords: 18,
    reason: 'User speaks quickly - keeping expressions brief',
  },
  very_fast: {
    expressionLength: 'brief',
    pauseMultiplier: 0.6,
    preferredTiming: 'immediate',
    includeTexture: false,
    targetEnergy: 'high',
    maxExpressionWords: 12,
    reason: 'User speaks very fast - minimal expressions',
  },
};

const TEMPO_ADJUSTMENTS: Record<ConversationTempo, Partial<PacePersonalityAdjustment>> = {
  relaxed: {
    expressionLength: 'detailed',
    pauseMultiplier: 1.3,
    includeTexture: true,
    acknowledgeRush: false,
    reason: 'Relaxed conversation - adding texture',
  },
  normal: {
    expressionLength: 'normal',
    pauseMultiplier: 1.0,
    includeTexture: true,
    acknowledgeRush: false,
    reason: 'Normal tempo',
  },
  brisk: {
    expressionLength: 'brief',
    pauseMultiplier: 0.8,
    includeTexture: false,
    acknowledgeRush: false,
    reason: 'Brisk conversation - keeping pace',
  },
  rushed: {
    expressionLength: 'brief',
    pauseMultiplier: 0.5,
    includeTexture: false,
    acknowledgeRush: true,
    maxExpressionWords: 10,
    reason: 'User seems rushed - being efficient',
  },
};

// ============================================================================
// ADJUSTMENT LOGIC
// ============================================================================

/**
 * Get personality adjustment based on voice pace
 */
export function getPacePersonalityAdjustment(
  paceContext: CurrentPaceContext,
  learnedPreferences?: LearnedPacePreferences
): PacePersonalityAdjustment {
  const defaultAdjustment: PacePersonalityAdjustment = {
    expressionLength: 'normal',
    pauseMultiplier: 1.0,
    preferredTiming: 'mid_response',
    includeTexture: true,
    targetEnergy: 'medium',
    acknowledgeRush: false,
    maxExpressionWords: 25,
    reason: 'Default pace adjustment',
  };

  let adjustment = { ...defaultAdjustment };

  // Apply pace category adjustment
  if (paceContext.paceCategory) {
    const paceAdj = PACE_ADJUSTMENTS[paceContext.paceCategory];
    adjustment = { ...adjustment, ...paceAdj };
  }

  // Apply tempo adjustment (overrides some pace settings)
  if (paceContext.tempo) {
    const tempoAdj = TEMPO_ADJUSTMENTS[paceContext.tempo];
    adjustment = { ...adjustment, ...tempoAdj };
  }

  // Handle rushed user
  if (paceContext.seemsRushed) {
    adjustment.expressionLength = 'brief';
    adjustment.pauseMultiplier = Math.min(adjustment.pauseMultiplier, 0.6);
    adjustment.includeTexture = false;
    adjustment.acknowledgeRush = true;
    adjustment.maxExpressionWords = Math.min(adjustment.maxExpressionWords, 12);
    adjustment.reason += ' (user seems rushed)';
  }

  // Handle relaxed user
  if (paceContext.seemsRelaxed) {
    adjustment.pauseMultiplier = Math.max(adjustment.pauseMultiplier, 1.2);
    adjustment.includeTexture = true;
    adjustment.maxExpressionWords = Math.max(adjustment.maxExpressionWords, 30);
    adjustment.reason += ' (user seems relaxed)';
  }

  // Handle interruption
  if (paceContext.wasInterruption) {
    adjustment.preferredTiming = 'immediate';
    adjustment.expressionLength = 'brief';
    adjustment.pauseMultiplier = 0.5;
    adjustment.reason += ' (user interrupted)';
  }

  // Apply learned preferences if available
  if (learnedPreferences) {
    // Respect user's preferred response length
    if (learnedPreferences.prefersShortResponses) {
      adjustment.expressionLength = 'brief';
      adjustment.maxExpressionWords = Math.min(adjustment.maxExpressionWords, 15);
    }

    // Respect user's preferred pause length
    if (learnedPreferences.preferredPauseLength > 0) {
      // Scale pause multiplier based on learned preference
      adjustment.pauseMultiplier *= learnedPreferences.preferredPauseLength / 0.5;
    }

    // Respect user's tolerance for long responses
    if (!learnedPreferences.toleratesLongResponses) {
      adjustment.maxExpressionWords = Math.min(adjustment.maxExpressionWords, 20);
      adjustment.includeTexture = false;
    }
  }

  log.debug(
    {
      pace: paceContext.paceCategory,
      tempo: paceContext.tempo,
      rushed: paceContext.seemsRushed,
      adjustment: adjustment.expressionLength,
      maxWords: adjustment.maxExpressionWords,
    },
    '⏱️ Pace personality adjustment'
  );

  return adjustment;
}

/**
 * Apply pace adjustment to an expression
 */
export function applyPaceToExpression(
  expression: string,
  adjustment: PacePersonalityAdjustment
): string {
  let result = expression;

  // Truncate if too long
  const words = result.split(/\s+/);
  if (words.length > adjustment.maxExpressionWords) {
    // Find a natural break point (sentence end)
    let breakPoint = adjustment.maxExpressionWords;
    for (
      let i = Math.min(words.length - 1, adjustment.maxExpressionWords);
      i > adjustment.maxExpressionWords - 5;
      i--
    ) {
      if (words[i].match(/[.!?]$/)) {
        breakPoint = i + 1;
        break;
      }
    }
    result = words.slice(0, breakPoint).join(' ');

    // Ensure it ends with punctuation
    if (!result.match(/[.!?]$/)) {
      result += '.';
    }
  }

  // Adjust pause lengths in SSML
  if (adjustment.pauseMultiplier !== 1.0) {
    result = adjustSSMLPauses(result, adjustment.pauseMultiplier);
  }

  // Add rush acknowledgment if needed
  if (adjustment.acknowledgeRush && !result.toLowerCase().includes('quick')) {
    // Prepend a quick acknowledgment
    result = `Quick thought: ${result}`;
  }

  return result;
}

/**
 * Adjust SSML pause durations
 */
function adjustSSMLPauses(text: string, multiplier: number): string {
  return text.replace(/<break time="(\d+)(ms|s)"\/>/g, (match, time, unit) => {
    const originalMs = unit === 's' ? parseInt(time) * 1000 : parseInt(time);
    const adjustedMs = Math.round(originalMs * multiplier);

    if (adjustedMs >= 1000) {
      return `<break time="${(adjustedMs / 1000).toFixed(1)}s"/>`;
    }
    return `<break time="${adjustedMs}ms"/>`;
  });
}

/**
 * Convert voice pace adapter data to our context format
 */
export function fromVoicePaceData(
  wpm?: number,
  preferences?: LearnedPacePreferences
): CurrentPaceContext {
  const context: CurrentPaceContext = {};

  if (wpm !== undefined) {
    context.currentWPM = wpm;
    context.paceCategory = categorizePace(wpm);
  }

  if (preferences) {
    context.energyLevel = preferences.typicalEnergyLevel;
    context.tempo = preferences.preferredTempo;
  }

  return context;
}

/**
 * Categorize WPM into pace category
 */
function categorizePace(wpm: number): PaceCategory {
  if (wpm < 100) return 'very_slow';
  if (wpm < 130) return 'slow';
  if (wpm < 170) return 'moderate';
  if (wpm < 200) return 'fast';
  return 'very_fast';
}

// ============================================================================
// EXPORTS
// ============================================================================

export const voicePacePersonality = {
  getAdjustment: getPacePersonalityAdjustment,
  applyToExpression: applyPaceToExpression,
  adjustPauses: adjustSSMLPauses,
  fromVoicePaceData,
  categorizePace,
};

export default voicePacePersonality;

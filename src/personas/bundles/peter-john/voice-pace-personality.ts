/**
 * Voice Pace → Personality Integration for Peter John
 *
 * Adapts Peter's personality expressions based on the user's speaking pace.
 * Peter naturally matches energy - fast talkers get his excited mode,
 * slow talkers get more deliberate pattern explanation.
 *
 * Fast talker → Match energy, rapid-fire insights, excited discovery
 * Slow talker → More deliberate, let patterns land, build understanding
 * Rushed → Efficient insights, validate time, get to the point
 * Relaxed → Add stories, Carolyn callbacks, explore tangents
 *
 * @module personas/bundles/peter-john/voice-pace-personality
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type {
  PaceCategory,
  EnergyLevel,
  ConversationTempo,
  LearnedPacePreferences,
} from '../../../intelligence/voice-pace-adapter.js';

const log = createLogger({ module: 'peter-voice-pace' });

// ============================================================================
// TYPES
// ============================================================================

export interface PeterPaceAdjustment {
  /** Prefer shorter or longer expressions */
  expressionLength: 'brief' | 'normal' | 'detailed';

  /** Add more or fewer pauses in SSML */
  pauseMultiplier: number; // 0.5 = half pauses, 2.0 = double pauses

  /** Preferred injection timing */
  preferredTiming: 'immediate' | 'after_pause' | 'mid_response' | 'at_end';

  /** Whether to include more texture/stories */
  includeTexture: boolean;

  /** Energy level to match */
  targetEnergy: 'low' | 'medium' | 'high';

  /** Should we validate time pressure? */
  acknowledgeRush: boolean;

  /** Maximum expression word count */
  maxExpressionWords: number;

  /** Should we include Carolyn callbacks? */
  includeCarolynCallbacks: boolean;

  /** Should we include tangential discoveries? */
  includeTangents: boolean;

  /** Discovery excitement level */
  discoveryExcitement: 'subdued' | 'normal' | 'high';

  /** Reason for adjustment */
  reason: string;
}

export interface PeterPaceContext {
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

  /** Is this a deep analytical conversation? */
  isAnalyticalMode?: boolean;
}

// ============================================================================
// PACE → PERSONALITY MAPPINGS (Peter-Specific)
// ============================================================================

const PACE_ADJUSTMENTS: Record<PaceCategory, Partial<PeterPaceAdjustment>> = {
  very_slow: {
    expressionLength: 'detailed',
    pauseMultiplier: 1.3,
    preferredTiming: 'after_pause',
    includeTexture: true,
    targetEnergy: 'medium', // Peter stays warm even with slow talkers
    maxExpressionWords: 45,
    includeCarolynCallbacks: true,
    includeTangents: true,
    discoveryExcitement: 'normal', // Don't suppress his excitement
    reason: 'User speaks slowly - taking time to explain patterns fully',
  },
  slow: {
    expressionLength: 'normal',
    pauseMultiplier: 1.15,
    preferredTiming: 'mid_response',
    includeTexture: true,
    targetEnergy: 'medium',
    maxExpressionWords: 35,
    includeCarolynCallbacks: true,
    includeTangents: true,
    discoveryExcitement: 'normal',
    reason: 'User speaks at relaxed pace - room for stories',
  },
  moderate: {
    expressionLength: 'normal',
    pauseMultiplier: 1.0,
    preferredTiming: 'mid_response',
    includeTexture: true,
    targetEnergy: 'medium',
    maxExpressionWords: 28,
    includeCarolynCallbacks: true,
    includeTangents: false,
    discoveryExcitement: 'normal',
    reason: 'Standard pace - balanced delivery',
  },
  fast: {
    expressionLength: 'brief',
    pauseMultiplier: 0.85,
    preferredTiming: 'immediate',
    includeTexture: false,
    targetEnergy: 'high',
    maxExpressionWords: 20,
    includeCarolynCallbacks: false,
    includeTangents: false,
    discoveryExcitement: 'high', // Match their energy!
    reason: 'User speaks quickly - matching energy with rapid insights',
  },
  very_fast: {
    expressionLength: 'brief',
    pauseMultiplier: 0.7,
    preferredTiming: 'immediate',
    includeTexture: false,
    targetEnergy: 'high',
    maxExpressionWords: 15,
    includeCarolynCallbacks: false,
    includeTangents: false,
    discoveryExcitement: 'high', // Full excited discovery mode
    reason: 'User speaks very fast - rapid-fire pattern delivery',
  },
};

const TEMPO_ADJUSTMENTS: Record<ConversationTempo, Partial<PeterPaceAdjustment>> = {
  relaxed: {
    expressionLength: 'detailed',
    pauseMultiplier: 1.2,
    includeTexture: true,
    includeCarolynCallbacks: true,
    includeTangents: true,
    acknowledgeRush: false,
    discoveryExcitement: 'normal',
    reason: 'Relaxed conversation - room for tangents and stories',
  },
  normal: {
    expressionLength: 'normal',
    pauseMultiplier: 1.0,
    includeTexture: true,
    includeCarolynCallbacks: true,
    includeTangents: false,
    acknowledgeRush: false,
    discoveryExcitement: 'normal',
    reason: 'Normal tempo',
  },
  brisk: {
    expressionLength: 'brief',
    pauseMultiplier: 0.85,
    includeTexture: false,
    includeCarolynCallbacks: false,
    includeTangents: false,
    acknowledgeRush: false,
    discoveryExcitement: 'high',
    reason: 'Brisk conversation - efficient pattern delivery',
  },
  rushed: {
    expressionLength: 'brief',
    pauseMultiplier: 0.6,
    includeTexture: false,
    includeCarolynCallbacks: false,
    includeTangents: false,
    acknowledgeRush: true,
    maxExpressionWords: 12,
    discoveryExcitement: 'subdued',
    reason: 'User seems rushed - getting to the point',
  },
};

// ============================================================================
// ADJUSTMENT LOGIC
// ============================================================================

/**
 * Get personality adjustment based on voice pace for Peter
 */
export function getPeterPaceAdjustment(
  paceContext: PeterPaceContext,
  learnedPreferences?: LearnedPacePreferences
): PeterPaceAdjustment {
  const defaultAdjustment: PeterPaceAdjustment = {
    expressionLength: 'normal',
    pauseMultiplier: 1.0,
    preferredTiming: 'mid_response',
    includeTexture: true,
    targetEnergy: 'medium',
    acknowledgeRush: false,
    maxExpressionWords: 28,
    includeCarolynCallbacks: true,
    includeTangents: false,
    discoveryExcitement: 'normal',
    reason: 'Default Peter pace adjustment',
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

  // Handle rushed user - Peter respects time
  if (paceContext.seemsRushed) {
    adjustment.expressionLength = 'brief';
    adjustment.pauseMultiplier = Math.min(adjustment.pauseMultiplier, 0.7);
    adjustment.includeTexture = false;
    adjustment.acknowledgeRush = true;
    adjustment.includeCarolynCallbacks = false;
    adjustment.includeTangents = false;
    adjustment.maxExpressionWords = Math.min(adjustment.maxExpressionWords, 15);
    adjustment.reason += ' (respecting user time)';
  }

  // Handle relaxed user - Peter can be more himself
  if (paceContext.seemsRelaxed) {
    adjustment.pauseMultiplier = Math.max(adjustment.pauseMultiplier, 1.15);
    adjustment.includeTexture = true;
    adjustment.includeCarolynCallbacks = true;
    adjustment.includeTangents = true;
    adjustment.maxExpressionWords = Math.max(adjustment.maxExpressionWords, 35);
    adjustment.reason += ' (relaxed - room for stories)';
  }

  // Handle interruption - get to the point quickly
  if (paceContext.wasInterruption) {
    adjustment.preferredTiming = 'immediate';
    adjustment.expressionLength = 'brief';
    adjustment.pauseMultiplier = 0.6;
    adjustment.includeCarolynCallbacks = false;
    adjustment.reason += ' (interrupted - being efficient)';
  }

  // Handle analytical mode - more deliberate
  if (paceContext.isAnalyticalMode) {
    adjustment.pauseMultiplier = Math.max(adjustment.pauseMultiplier, 1.1);
    adjustment.includeTexture = true;
    adjustment.discoveryExcitement = 'normal'; // Don't suppress in analysis
    adjustment.reason += ' (analytical mode)';
  }

  // Apply learned preferences if available
  if (learnedPreferences) {
    if (learnedPreferences.prefersShortResponses) {
      adjustment.expressionLength = 'brief';
      adjustment.maxExpressionWords = Math.min(adjustment.maxExpressionWords, 18);
      adjustment.includeCarolynCallbacks = false;
    }

    if (learnedPreferences.preferredPauseLength > 0) {
      adjustment.pauseMultiplier *= learnedPreferences.preferredPauseLength / 0.5;
    }

    if (!learnedPreferences.toleratesLongResponses) {
      adjustment.maxExpressionWords = Math.min(adjustment.maxExpressionWords, 22);
      adjustment.includeTexture = false;
      adjustment.includeTangents = false;
    }
  }

  log.debug(
    {
      pace: paceContext.paceCategory,
      tempo: paceContext.tempo,
      rushed: paceContext.seemsRushed,
      expression: adjustment.expressionLength,
      maxWords: adjustment.maxExpressionWords,
      excitement: adjustment.discoveryExcitement,
    },
    '⚡ Peter pace adjustment'
  );

  return adjustment;
}

/**
 * Apply pace adjustment to an expression
 */
export function applyPaceToExpression(expression: string, adjustment: PeterPaceAdjustment): string {
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
      if (words[i]?.match(/[.!?]$/)) {
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

  // Add rush acknowledgment if needed (Peter-style)
  if (adjustment.acknowledgeRush && !result.toLowerCase().includes('quick')) {
    // Peter's quick mode
    const peterQuickPhrases = ['Quick pattern: ', 'Short version: ', 'Key insight: '];
    const phrase = peterQuickPhrases[Math.floor(Math.random() * peterQuickPhrases.length)];
    result = `${phrase}${result}`;
  }

  // Boost excitement if in high discovery mode
  if (adjustment.discoveryExcitement === 'high') {
    // Ensure we're using enthusiastic emotion
    if (!result.includes('<emotion')) {
      result = `<emotion value="enthusiastic"/>${result}`;
    }
  }

  return result;
}

/**
 * Adjust SSML pause durations
 */
function adjustSSMLPauses(text: string, multiplier: number): string {
  return text.replace(/<break time="(\d+)(ms|s)"\/>/g, (_match, time, unit) => {
    const originalMs = unit === 's' ? parseInt(time) * 1000 : parseInt(time);
    const adjustedMs = Math.round(originalMs * multiplier);

    // Floor at 50ms, cap at 800ms for Peter (he's not that slow)
    const finalMs = Math.max(50, Math.min(800, adjustedMs));

    if (finalMs >= 1000) {
      return `<break time="${(finalMs / 1000).toFixed(1)}s"/>`;
    }
    return `<break time="${finalMs}ms"/>`;
  });
}

/**
 * Convert voice pace adapter data to Peter's context format
 */
export function fromVoicePaceData(
  wpm?: number,
  preferences?: LearnedPacePreferences
): PeterPaceContext {
  const context: PeterPaceContext = {};

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

export const peterVoicePacePersonality = {
  getAdjustment: getPeterPaceAdjustment,
  applyToExpression: applyPaceToExpression,
  adjustPauses: adjustSSMLPauses,
  fromVoicePaceData,
  categorizePace,
};

export default peterVoicePacePersonality;

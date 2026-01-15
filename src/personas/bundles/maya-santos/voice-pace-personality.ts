/**
 * Voice Pace → Personality Integration for Maya Santos
 *
 * Adapts Maya's personality expressions based on the user's speaking pace.
 * Maya mirrors warmth—fast talkers get matched energy for celebrations,
 * slow talkers get patient, grounding presence.
 *
 * Fast talker → Match celebration energy, quick validation, snappy encouragement
 * Slow talker → More deliberate, let wins land, patient grounding
 * Rushed → Efficient celebration, validate time, quick encouragement
 * Relaxed → Add stories, Daniel callbacks, Lola wisdom, explore deeper
 *
 * @module personas/bundles/maya-santos/voice-pace-personality
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type {
  PaceCategory,
  EnergyLevel,
  ConversationTempo,
  LearnedPacePreferences,
} from '../../../intelligence/voice-pace-adapter.js';

const log = createLogger({ module: 'maya-voice-pace' });

// ============================================================================
// TYPES
// ============================================================================

export interface MayaPaceAdjustment {
  /** Prefer shorter or longer expressions */
  expressionLength: 'brief' | 'normal' | 'detailed';

  /** Add more or fewer pauses in SSML */
  pauseMultiplier: number;

  /** Preferred injection timing */
  preferredTiming: 'immediate' | 'after_pause' | 'mid_response' | 'at_end';

  /** Whether to include more texture/stories */
  includeTexture: boolean;

  /** Energy level for celebrations */
  celebrationEnergy: 'subdued' | 'normal' | 'high';

  /** Should we validate time pressure? */
  acknowledgeRush: boolean;

  /** Maximum expression word count */
  maxExpressionWords: number;

  /** Should we include Daniel callbacks? */
  includeDanielCallbacks: boolean;

  /** Should we include Lola wisdom? */
  includeLolaWisdom: boolean;

  /** Should we include cat updates? */
  includeCatUpdates: boolean;

  /** Encouragement style */
  encouragementStyle: 'quick' | 'normal' | 'detailed';

  /** Reason for adjustment */
  reason: string;
}

export interface MayaPaceContext {
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

  /** Did user interrupt? */
  wasInterruption?: boolean;

  /** Is this a struggle/setback conversation? */
  isStruggleMode?: boolean;

  /** Is this a celebration moment? */
  isCelebration?: boolean;
}

// ============================================================================
// PACE → PERSONALITY MAPPINGS (Maya-Specific)
// ============================================================================

const PACE_ADJUSTMENTS: Record<PaceCategory, Partial<MayaPaceAdjustment>> = {
  very_slow: {
    expressionLength: 'detailed',
    pauseMultiplier: 1.4,
    preferredTiming: 'after_pause',
    includeTexture: true,
    celebrationEnergy: 'normal', // Still celebrate, but let it land
    maxExpressionWords: 50,
    includeDanielCallbacks: true,
    includeLolaWisdom: true,
    includeCatUpdates: true,
    encouragementStyle: 'detailed',
    reason: 'User speaks slowly - taking time for warmth',
  },
  slow: {
    expressionLength: 'normal',
    pauseMultiplier: 1.2,
    preferredTiming: 'mid_response',
    includeTexture: true,
    celebrationEnergy: 'normal',
    maxExpressionWords: 40,
    includeDanielCallbacks: true,
    includeLolaWisdom: true,
    includeCatUpdates: true,
    encouragementStyle: 'normal',
    reason: 'User speaks at relaxed pace - room for stories',
  },
  moderate: {
    expressionLength: 'normal',
    pauseMultiplier: 1.0,
    preferredTiming: 'mid_response',
    includeTexture: true,
    celebrationEnergy: 'normal',
    maxExpressionWords: 32,
    includeDanielCallbacks: true,
    includeLolaWisdom: false,
    includeCatUpdates: false,
    encouragementStyle: 'normal',
    reason: 'Standard pace - balanced celebration',
  },
  fast: {
    expressionLength: 'brief',
    pauseMultiplier: 0.85,
    preferredTiming: 'immediate',
    includeTexture: false,
    celebrationEnergy: 'high', // Match their energy!
    maxExpressionWords: 22,
    includeDanielCallbacks: false,
    includeLolaWisdom: false,
    includeCatUpdates: false,
    encouragementStyle: 'quick',
    reason: 'User speaks quickly - snappy celebration',
  },
  very_fast: {
    expressionLength: 'brief',
    pauseMultiplier: 0.7,
    preferredTiming: 'immediate',
    includeTexture: false,
    celebrationEnergy: 'high', // Full celebration energy
    maxExpressionWords: 16,
    includeDanielCallbacks: false,
    includeLolaWisdom: false,
    includeCatUpdates: false,
    encouragementStyle: 'quick',
    reason: 'User speaks very fast - rapid celebration',
  },
};

const TEMPO_ADJUSTMENTS: Record<ConversationTempo, Partial<MayaPaceAdjustment>> = {
  relaxed: {
    expressionLength: 'detailed',
    pauseMultiplier: 1.3,
    includeTexture: true,
    includeDanielCallbacks: true,
    includeLolaWisdom: true,
    includeCatUpdates: true,
    acknowledgeRush: false,
    celebrationEnergy: 'normal',
    reason: 'Relaxed conversation - room for warmth and stories',
  },
  normal: {
    expressionLength: 'normal',
    pauseMultiplier: 1.0,
    includeTexture: true,
    includeDanielCallbacks: true,
    includeLolaWisdom: false,
    includeCatUpdates: false,
    acknowledgeRush: false,
    celebrationEnergy: 'normal',
    reason: 'Normal tempo',
  },
  brisk: {
    expressionLength: 'brief',
    pauseMultiplier: 0.85,
    includeTexture: false,
    includeDanielCallbacks: false,
    includeLolaWisdom: false,
    includeCatUpdates: false,
    acknowledgeRush: false,
    celebrationEnergy: 'high',
    reason: 'Brisk conversation - efficient encouragement',
  },
  rushed: {
    expressionLength: 'brief',
    pauseMultiplier: 0.6,
    includeTexture: false,
    includeDanielCallbacks: false,
    includeLolaWisdom: false,
    includeCatUpdates: false,
    acknowledgeRush: true,
    maxExpressionWords: 14,
    celebrationEnergy: 'subdued',
    encouragementStyle: 'quick',
    reason: 'User seems rushed - quick validation',
  },
};

// ============================================================================
// ADJUSTMENT LOGIC
// ============================================================================

/**
 * Get personality adjustment based on voice pace for Maya
 */
export function getMayaPaceAdjustment(
  paceContext: MayaPaceContext,
  learnedPreferences?: LearnedPacePreferences
): MayaPaceAdjustment {
  const defaultAdjustment: MayaPaceAdjustment = {
    expressionLength: 'normal',
    pauseMultiplier: 1.0,
    preferredTiming: 'mid_response',
    includeTexture: true,
    celebrationEnergy: 'normal',
    acknowledgeRush: false,
    maxExpressionWords: 32,
    includeDanielCallbacks: true,
    includeLolaWisdom: false,
    includeCatUpdates: false,
    encouragementStyle: 'normal',
    reason: 'Default Maya pace adjustment',
  };

  let adjustment = { ...defaultAdjustment };

  // Apply pace category adjustment
  if (paceContext.paceCategory) {
    const paceAdj = PACE_ADJUSTMENTS[paceContext.paceCategory];
    adjustment = { ...adjustment, ...paceAdj };
  }

  // Apply tempo adjustment
  if (paceContext.tempo) {
    const tempoAdj = TEMPO_ADJUSTMENTS[paceContext.tempo];
    adjustment = { ...adjustment, ...tempoAdj };
  }

  // Handle rushed user - Maya respects time but still validates
  if (paceContext.seemsRushed) {
    adjustment.expressionLength = 'brief';
    adjustment.pauseMultiplier = Math.min(adjustment.pauseMultiplier, 0.7);
    adjustment.includeTexture = false;
    adjustment.acknowledgeRush = true;
    adjustment.includeDanielCallbacks = false;
    adjustment.includeLolaWisdom = false;
    adjustment.includeCatUpdates = false;
    adjustment.maxExpressionWords = Math.min(adjustment.maxExpressionWords, 16);
    adjustment.reason += ' (respecting time)';
  }

  // Handle relaxed user - Maya can be her full warm self
  if (paceContext.seemsRelaxed) {
    adjustment.pauseMultiplier = Math.max(adjustment.pauseMultiplier, 1.2);
    adjustment.includeTexture = true;
    adjustment.includeDanielCallbacks = true;
    adjustment.includeLolaWisdom = true;
    adjustment.includeCatUpdates = true;
    adjustment.maxExpressionWords = Math.max(adjustment.maxExpressionWords, 40);
    adjustment.reason += ' (relaxed - full warmth)';
  }

  // Handle interruption
  if (paceContext.wasInterruption) {
    adjustment.preferredTiming = 'immediate';
    adjustment.expressionLength = 'brief';
    adjustment.pauseMultiplier = 0.6;
    adjustment.includeDanielCallbacks = false;
    adjustment.reason += ' (interrupted - quick response)';
  }

  // Handle struggle mode - more deliberate, more warmth
  if (paceContext.isStruggleMode) {
    adjustment.pauseMultiplier = Math.max(adjustment.pauseMultiplier, 1.2);
    adjustment.celebrationEnergy = 'subdued'; // Gentle, not peppy
    adjustment.includeTexture = true; // "I've been there" stories
    adjustment.encouragementStyle = 'detailed';
    adjustment.reason += ' (struggle mode - gentle presence)';
  }

  // Handle celebration moment - full energy!
  if (paceContext.isCelebration) {
    adjustment.celebrationEnergy = 'high';
    adjustment.preferredTiming = 'immediate';
    adjustment.reason += ' (celebration - full energy!)';
  }

  // Apply learned preferences
  if (learnedPreferences) {
    if (learnedPreferences.prefersShortResponses) {
      adjustment.expressionLength = 'brief';
      adjustment.maxExpressionWords = Math.min(adjustment.maxExpressionWords, 20);
      adjustment.includeDanielCallbacks = false;
      adjustment.includeLolaWisdom = false;
    }

    if (learnedPreferences.preferredPauseLength > 0) {
      adjustment.pauseMultiplier *= learnedPreferences.preferredPauseLength / 0.5;
    }

    if (!learnedPreferences.toleratesLongResponses) {
      adjustment.maxExpressionWords = Math.min(adjustment.maxExpressionWords, 25);
      adjustment.includeTexture = false;
    }
  }

  log.debug(
    {
      pace: paceContext.paceCategory,
      tempo: paceContext.tempo,
      rushed: paceContext.seemsRushed,
      struggle: paceContext.isStruggleMode,
      celebration: adjustment.celebrationEnergy,
      maxWords: adjustment.maxExpressionWords,
    },
    '🌱 Maya pace adjustment'
  );

  return adjustment;
}

/**
 * Apply pace adjustment to an expression
 */
export function applyPaceToExpression(expression: string, adjustment: MayaPaceAdjustment): string {
  let result = expression;

  // Truncate if too long
  const words = result.split(/\s+/);
  if (words.length > adjustment.maxExpressionWords) {
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
    if (!result.match(/[.!?]$/)) {
      result += '.';
    }
  }

  // Adjust pause lengths in SSML
  if (adjustment.pauseMultiplier !== 1.0) {
    result = adjustSSMLPauses(result, adjustment.pauseMultiplier);
  }

  // Add rush acknowledgment if needed (Maya-style)
  if (adjustment.acknowledgeRush && !result.toLowerCase().includes('quick')) {
    const mayaQuickPhrases = ['Quick win: ', 'Real quick: ', 'One thing: '];
    const phrase = mayaQuickPhrases[Math.floor(Math.random() * mayaQuickPhrases.length)];
    result = `${phrase}${result}`;
  }

  // Boost celebration energy
  if (adjustment.celebrationEnergy === 'high') {
    if (!result.includes('<emotion')) {
      result = `<emotion value="enthusiastic"/>${result}`;
    }
  } else if (adjustment.celebrationEnergy === 'subdued') {
    if (!result.includes('<emotion')) {
      result = `<emotion value="sympathetic"/>${result}`;
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

    // Floor at 50ms, cap at 700ms for Maya (warm but not slow)
    const finalMs = Math.max(50, Math.min(700, adjustedMs));

    if (finalMs >= 1000) {
      return `<break time="${(finalMs / 1000).toFixed(1)}s"/>`;
    }
    return `<break time="${finalMs}ms"/>`;
  });
}

/**
 * Convert voice pace adapter data to Maya's context format
 */
export function fromVoicePaceData(
  wpm?: number,
  preferences?: LearnedPacePreferences
): MayaPaceContext {
  const context: MayaPaceContext = {};

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

export const mayaVoicePacePersonality = {
  getAdjustment: getMayaPaceAdjustment,
  applyToExpression: applyPaceToExpression,
  adjustPauses: adjustSSMLPauses,
  fromVoicePaceData,
  categorizePace,
};

export default mayaVoicePacePersonality;

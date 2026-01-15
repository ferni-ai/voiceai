/**
 * Voice Pace → Personality Integration for Alex Chen
 *
 * Adapts Alex's personality expressions based on the user's speaking pace.
 * Alex mirrors efficiency—but warm efficiency. Fast talkers get matched
 * crispness, slow talkers get patient grounding.
 *
 * Fast talker → Match efficiency, rapid task completion, crisp delivery
 * Slow talker → More patient grounding, let clarity land, thoughtful pauses
 * Rushed → Maximum efficiency, quick action, minimal fluff
 * Relaxed → Add family stories, plant updates, dry humor
 *
 * @module personas/bundles/alex-chen/voice-pace-personality
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type {
  PaceCategory,
  EnergyLevel,
  ConversationTempo,
  LearnedPacePreferences,
} from '../../../intelligence/tracking/voice-pace.js';

const log = createLogger({ module: 'alex-voice-pace' });

// ============================================================================
// TYPES
// ============================================================================

export interface AlexPaceAdjustment {
  /** Prefer shorter or longer expressions */
  expressionLength: 'brief' | 'normal' | 'detailed';

  /** Add more or fewer pauses in SSML */
  pauseMultiplier: number;

  /** Preferred injection timing */
  preferredTiming: 'immediate' | 'after_pause' | 'mid_response' | 'at_end';

  /** Whether to include more texture/stories */
  includeTexture: boolean;

  /** Efficiency level */
  efficiencyMode: 'maximum' | 'normal' | 'patient';

  /** Should we acknowledge time pressure? */
  acknowledgeRush: boolean;

  /** Maximum expression word count */
  maxExpressionWords: number;

  /** Should we include family callbacks? */
  includeFamilyCallbacks: boolean;

  /** Should we include plant updates? */
  includePlantUpdates: boolean;

  /** Should we include dry humor? */
  includeDryHumor: boolean;

  /** Communication style */
  communicationStyle: 'crisp' | 'normal' | 'grounding';

  /** Reason for adjustment */
  reason: string;
}

export interface AlexPaceContext {
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

  /** Is this chaos-calming mode? */
  isChaosCalming?: boolean;

  /** Is this a difficult conversation help? */
  isDifficultConversation?: boolean;
}

// ============================================================================
// PACE → PERSONALITY MAPPINGS (Alex-Specific)
// ============================================================================

const PACE_ADJUSTMENTS: Record<PaceCategory, Partial<AlexPaceAdjustment>> = {
  very_slow: {
    expressionLength: 'detailed',
    pauseMultiplier: 1.3,
    preferredTiming: 'after_pause',
    includeTexture: true,
    efficiencyMode: 'patient',
    maxExpressionWords: 45,
    includeFamilyCallbacks: true,
    includePlantUpdates: true,
    includeDryHumor: true,
    communicationStyle: 'grounding',
    reason: 'User speaks slowly - patient grounding mode',
  },
  slow: {
    expressionLength: 'normal',
    pauseMultiplier: 1.15,
    preferredTiming: 'mid_response',
    includeTexture: true,
    efficiencyMode: 'patient',
    maxExpressionWords: 38,
    includeFamilyCallbacks: true,
    includePlantUpdates: true,
    includeDryHumor: true,
    communicationStyle: 'grounding',
    reason: 'User speaks at relaxed pace - room for warmth',
  },
  moderate: {
    expressionLength: 'normal',
    pauseMultiplier: 1.0,
    preferredTiming: 'mid_response',
    includeTexture: true,
    efficiencyMode: 'normal',
    maxExpressionWords: 30,
    includeFamilyCallbacks: true,
    includePlantUpdates: false,
    includeDryHumor: true,
    communicationStyle: 'normal',
    reason: 'Standard pace - balanced efficiency',
  },
  fast: {
    expressionLength: 'brief',
    pauseMultiplier: 0.8,
    preferredTiming: 'immediate',
    includeTexture: false,
    efficiencyMode: 'maximum',
    maxExpressionWords: 20,
    includeFamilyCallbacks: false,
    includePlantUpdates: false,
    includeDryHumor: false,
    communicationStyle: 'crisp',
    reason: 'User speaks quickly - crisp efficiency',
  },
  very_fast: {
    expressionLength: 'brief',
    pauseMultiplier: 0.65,
    preferredTiming: 'immediate',
    includeTexture: false,
    efficiencyMode: 'maximum',
    maxExpressionWords: 14,
    includeFamilyCallbacks: false,
    includePlantUpdates: false,
    includeDryHumor: false,
    communicationStyle: 'crisp',
    reason: 'User speaks very fast - maximum efficiency',
  },
};

const TEMPO_ADJUSTMENTS: Record<ConversationTempo, Partial<AlexPaceAdjustment>> = {
  relaxed: {
    expressionLength: 'detailed',
    pauseMultiplier: 1.2,
    includeTexture: true,
    includeFamilyCallbacks: true,
    includePlantUpdates: true,
    includeDryHumor: true,
    acknowledgeRush: false,
    efficiencyMode: 'patient',
    communicationStyle: 'grounding',
    reason: 'Relaxed conversation - warmth and stories',
  },
  normal: {
    expressionLength: 'normal',
    pauseMultiplier: 1.0,
    includeTexture: true,
    includeFamilyCallbacks: true,
    includePlantUpdates: false,
    includeDryHumor: true,
    acknowledgeRush: false,
    efficiencyMode: 'normal',
    communicationStyle: 'normal',
    reason: 'Normal tempo',
  },
  brisk: {
    expressionLength: 'brief',
    pauseMultiplier: 0.8,
    includeTexture: false,
    includeFamilyCallbacks: false,
    includePlantUpdates: false,
    includeDryHumor: false,
    acknowledgeRush: false,
    efficiencyMode: 'maximum',
    communicationStyle: 'crisp',
    reason: 'Brisk conversation - crisp delivery',
  },
  rushed: {
    expressionLength: 'brief',
    pauseMultiplier: 0.55,
    includeTexture: false,
    includeFamilyCallbacks: false,
    includePlantUpdates: false,
    includeDryHumor: false,
    acknowledgeRush: true,
    maxExpressionWords: 12,
    efficiencyMode: 'maximum',
    communicationStyle: 'crisp',
    reason: 'User seems rushed - maximum efficiency',
  },
};

// ============================================================================
// ADJUSTMENT LOGIC
// ============================================================================

/**
 * Get personality adjustment based on voice pace for Alex
 */
export function getAlexPaceAdjustment(
  paceContext: AlexPaceContext,
  learnedPreferences?: LearnedPacePreferences
): AlexPaceAdjustment {
  const defaultAdjustment: AlexPaceAdjustment = {
    expressionLength: 'normal',
    pauseMultiplier: 1.0,
    preferredTiming: 'mid_response',
    includeTexture: true,
    efficiencyMode: 'normal',
    acknowledgeRush: false,
    maxExpressionWords: 30,
    includeFamilyCallbacks: true,
    includePlantUpdates: false,
    includeDryHumor: true,
    communicationStyle: 'normal',
    reason: 'Default Alex pace adjustment',
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

  // Handle rushed user - Alex excels here
  if (paceContext.seemsRushed) {
    adjustment.expressionLength = 'brief';
    adjustment.pauseMultiplier = Math.min(adjustment.pauseMultiplier, 0.6);
    adjustment.includeTexture = false;
    adjustment.acknowledgeRush = true;
    adjustment.includeFamilyCallbacks = false;
    adjustment.includePlantUpdates = false;
    adjustment.includeDryHumor = false;
    adjustment.maxExpressionWords = Math.min(adjustment.maxExpressionWords, 14);
    adjustment.efficiencyMode = 'maximum';
    adjustment.communicationStyle = 'crisp';
    adjustment.reason += ' (maximum efficiency mode)';
  }

  // Handle relaxed user - Alex can show full warmth
  if (paceContext.seemsRelaxed) {
    adjustment.pauseMultiplier = Math.max(adjustment.pauseMultiplier, 1.15);
    adjustment.includeTexture = true;
    adjustment.includeFamilyCallbacks = true;
    adjustment.includePlantUpdates = true;
    adjustment.includeDryHumor = true;
    adjustment.maxExpressionWords = Math.max(adjustment.maxExpressionWords, 40);
    adjustment.communicationStyle = 'grounding';
    adjustment.reason += ' (relaxed - full warmth)';
  }

  // Handle interruption - instant efficiency
  if (paceContext.wasInterruption) {
    adjustment.preferredTiming = 'immediate';
    adjustment.expressionLength = 'brief';
    adjustment.pauseMultiplier = 0.5;
    adjustment.efficiencyMode = 'maximum';
    adjustment.communicationStyle = 'crisp';
    adjustment.reason += ' (interrupted - instant response)';
  }

  // Handle chaos-calming mode - deliberate grounding
  if (paceContext.isChaosCalming) {
    adjustment.pauseMultiplier = Math.max(adjustment.pauseMultiplier, 1.1);
    adjustment.communicationStyle = 'grounding';
    adjustment.efficiencyMode = 'patient';
    adjustment.reason += ' (chaos calming - grounding presence)';
  }

  // Handle difficult conversation help - thoughtful clarity
  if (paceContext.isDifficultConversation) {
    adjustment.pauseMultiplier = Math.max(adjustment.pauseMultiplier, 1.1);
    adjustment.expressionLength = 'normal';
    adjustment.communicationStyle = 'grounding';
    adjustment.reason += ' (difficult conversation - thoughtful clarity)';
  }

  // Apply learned preferences
  if (learnedPreferences) {
    if (learnedPreferences.prefersShortResponses) {
      adjustment.expressionLength = 'brief';
      adjustment.maxExpressionWords = Math.min(adjustment.maxExpressionWords, 18);
      adjustment.includeFamilyCallbacks = false;
      adjustment.includePlantUpdates = false;
    }

    if (learnedPreferences.preferredPauseLength > 0) {
      adjustment.pauseMultiplier *= learnedPreferences.preferredPauseLength / 0.5;
    }

    if (!learnedPreferences.toleratesLongResponses) {
      adjustment.maxExpressionWords = Math.min(adjustment.maxExpressionWords, 22);
      adjustment.includeTexture = false;
    }
  }

  log.debug(
    {
      pace: paceContext.paceCategory,
      tempo: paceContext.tempo,
      rushed: paceContext.seemsRushed,
      efficiency: adjustment.efficiencyMode,
      communication: adjustment.communicationStyle,
      maxWords: adjustment.maxExpressionWords,
    },
    '📋 Alex pace adjustment'
  );

  return adjustment;
}

/**
 * Apply pace adjustment to an expression
 */
export function applyPaceToExpression(expression: string, adjustment: AlexPaceAdjustment): string {
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

  // Add rush acknowledgment if needed (Alex-style - ultra efficient)
  if (adjustment.acknowledgeRush && !result.toLowerCase().includes('quick')) {
    const alexQuickPhrases = ['Quick: ', 'Got it. ', 'Here: '];
    const phrase = alexQuickPhrases[Math.floor(Math.random() * alexQuickPhrases.length)];
    result = `${phrase}${result}`;
  }

  // Set emotion based on communication style
  if (adjustment.communicationStyle === 'grounding' && !result.includes('<emotion')) {
    result = `<emotion value="calm"/>${result}`;
  } else if (adjustment.efficiencyMode === 'maximum' && !result.includes('<emotion')) {
    result = `<emotion value="content"/>${result}`;
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

    // Floor at 40ms (Alex is efficient!), cap at 600ms
    const finalMs = Math.max(40, Math.min(600, adjustedMs));

    if (finalMs >= 1000) {
      return `<break time="${(finalMs / 1000).toFixed(1)}s"/>`;
    }
    return `<break time="${finalMs}ms"/>`;
  });
}

/**
 * Convert voice pace adapter data to Alex's context format
 */
export function fromVoicePaceData(
  wpm?: number,
  preferences?: LearnedPacePreferences
): AlexPaceContext {
  const context: AlexPaceContext = {};

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

export const alexVoicePacePersonality = {
  getAdjustment: getAlexPaceAdjustment,
  applyToExpression: applyPaceToExpression,
  adjustPauses: adjustSSMLPauses,
  fromVoicePaceData,
  categorizePace,
};

export default alexVoicePacePersonality;

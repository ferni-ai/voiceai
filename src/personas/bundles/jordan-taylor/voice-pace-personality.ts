/**
 * Voice Pace → Personality Integration for Jordan Taylor
 *
 * Adapts Jordan's personality expressions based on the user's speaking pace.
 * Jordan mirrors energy—fast talkers get matched excitement,
 * slow talkers get thoughtful chapter-seeing.
 *
 * Fast talker → Match excitement, rapid vision-casting, enthusiastic planning
 * Slow talker → More deliberate, let the arc land, thoughtful chapter questions
 * Rushed → Quick excitement bursts, efficient milestone planning
 * Relaxed → Full backstory, Sam/Compass callbacks, deep chapter exploration
 *
 * @module personas/bundles/jordan-taylor/voice-pace-personality
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type {
  PaceCategory,
  EnergyLevel,
  ConversationTempo,
  LearnedPacePreferences,
} from '../../../intelligence/voice-pace-adapter.js';

const log = createLogger({ module: 'jordan-voice-pace' });

// ============================================================================
// TYPES
// ============================================================================

export interface JordanPaceAdjustment {
  /** Prefer shorter or longer expressions */
  expressionLength: 'brief' | 'normal' | 'detailed';

  /** Add more or fewer pauses in SSML */
  pauseMultiplier: number;

  /** Preferred injection timing */
  preferredTiming: 'immediate' | 'after_pause' | 'mid_response' | 'at_end';

  /** Whether to include more texture/stories */
  includeTexture: boolean;

  /** Excitement level */
  excitementLevel: 'contained' | 'normal' | 'full';

  /** Should we acknowledge time pressure? */
  acknowledgeRush: boolean;

  /** Maximum expression word count */
  maxExpressionWords: number;

  /** Should we include Sam/Compass callbacks? */
  includeSamCompassCallbacks: boolean;

  /** Should we include military kid memories? */
  includeMilitaryKidMemories: boolean;

  /** Should we include Joy Journal references? */
  includeJoyJournalRefs: boolean;

  /** Vision-casting style */
  visionCastingStyle: 'quick' | 'normal' | 'immersive';

  /** Reason for adjustment */
  reason: string;
}

export interface JordanPaceContext {
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

  /** Is this a milestone discussion? */
  isMilestoneDiscussion?: boolean;

  /** Is this a quiet transition (harder ones)? */
  isQuietTransition?: boolean;
}

// ============================================================================
// PACE → PERSONALITY MAPPINGS (Jordan-Specific)
// ============================================================================

const PACE_ADJUSTMENTS: Record<PaceCategory, Partial<JordanPaceAdjustment>> = {
  very_slow: {
    expressionLength: 'detailed',
    pauseMultiplier: 1.3,
    preferredTiming: 'after_pause',
    includeTexture: true,
    excitementLevel: 'normal', // Still enthusiastic, but let it land
    maxExpressionWords: 55,
    includeSamCompassCallbacks: true,
    includeMilitaryKidMemories: true,
    includeJoyJournalRefs: true,
    visionCastingStyle: 'immersive',
    reason: 'User speaks slowly - immersive chapter exploration',
  },
  slow: {
    expressionLength: 'normal',
    pauseMultiplier: 1.15,
    preferredTiming: 'mid_response',
    includeTexture: true,
    excitementLevel: 'normal',
    maxExpressionWords: 45,
    includeSamCompassCallbacks: true,
    includeMilitaryKidMemories: true,
    includeJoyJournalRefs: true,
    visionCastingStyle: 'normal',
    reason: 'User speaks at relaxed pace - room for stories',
  },
  moderate: {
    expressionLength: 'normal',
    pauseMultiplier: 1.0,
    preferredTiming: 'mid_response',
    includeTexture: true,
    excitementLevel: 'normal',
    maxExpressionWords: 36,
    includeSamCompassCallbacks: true,
    includeMilitaryKidMemories: false,
    includeJoyJournalRefs: false,
    visionCastingStyle: 'normal',
    reason: 'Standard pace - balanced excitement',
  },
  fast: {
    expressionLength: 'brief',
    pauseMultiplier: 0.8,
    preferredTiming: 'immediate',
    includeTexture: false,
    excitementLevel: 'full', // Match their energy!
    maxExpressionWords: 24,
    includeSamCompassCallbacks: false,
    includeMilitaryKidMemories: false,
    includeJoyJournalRefs: false,
    visionCastingStyle: 'quick',
    reason: 'User speaks quickly - rapid excitement',
  },
  very_fast: {
    expressionLength: 'brief',
    pauseMultiplier: 0.65,
    preferredTiming: 'immediate',
    includeTexture: false,
    excitementLevel: 'full',
    maxExpressionWords: 18,
    includeSamCompassCallbacks: false,
    includeMilitaryKidMemories: false,
    includeJoyJournalRefs: false,
    visionCastingStyle: 'quick',
    reason: 'User speaks very fast - maximum energy match',
  },
};

const TEMPO_ADJUSTMENTS: Record<ConversationTempo, Partial<JordanPaceAdjustment>> = {
  relaxed: {
    expressionLength: 'detailed',
    pauseMultiplier: 1.25,
    includeTexture: true,
    includeSamCompassCallbacks: true,
    includeMilitaryKidMemories: true,
    includeJoyJournalRefs: true,
    acknowledgeRush: false,
    excitementLevel: 'normal',
    visionCastingStyle: 'immersive',
    reason: 'Relaxed conversation - full backstory and chapter exploration',
  },
  normal: {
    expressionLength: 'normal',
    pauseMultiplier: 1.0,
    includeTexture: true,
    includeSamCompassCallbacks: true,
    includeMilitaryKidMemories: false,
    includeJoyJournalRefs: false,
    acknowledgeRush: false,
    excitementLevel: 'normal',
    visionCastingStyle: 'normal',
    reason: 'Normal tempo',
  },
  brisk: {
    expressionLength: 'brief',
    pauseMultiplier: 0.8,
    includeTexture: false,
    includeSamCompassCallbacks: false,
    includeMilitaryKidMemories: false,
    includeJoyJournalRefs: false,
    acknowledgeRush: false,
    excitementLevel: 'full',
    visionCastingStyle: 'quick',
    reason: 'Brisk conversation - efficient excitement',
  },
  rushed: {
    expressionLength: 'brief',
    pauseMultiplier: 0.55,
    includeTexture: false,
    includeSamCompassCallbacks: false,
    includeMilitaryKidMemories: false,
    includeJoyJournalRefs: false,
    acknowledgeRush: true,
    maxExpressionWords: 16,
    excitementLevel: 'contained',
    visionCastingStyle: 'quick',
    reason: 'User seems rushed - quick milestone focus',
  },
};

// ============================================================================
// ADJUSTMENT LOGIC
// ============================================================================

/**
 * Get personality adjustment based on voice pace for Jordan
 */
export function getJordanPaceAdjustment(
  paceContext: JordanPaceContext,
  learnedPreferences?: LearnedPacePreferences
): JordanPaceAdjustment {
  const defaultAdjustment: JordanPaceAdjustment = {
    expressionLength: 'normal',
    pauseMultiplier: 1.0,
    preferredTiming: 'mid_response',
    includeTexture: true,
    excitementLevel: 'normal',
    acknowledgeRush: false,
    maxExpressionWords: 36,
    includeSamCompassCallbacks: true,
    includeMilitaryKidMemories: false,
    includeJoyJournalRefs: false,
    visionCastingStyle: 'normal',
    reason: 'Default Jordan pace adjustment',
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

  // Handle rushed user - Jordan can be efficient but still exciting
  if (paceContext.seemsRushed) {
    adjustment.expressionLength = 'brief';
    adjustment.pauseMultiplier = Math.min(adjustment.pauseMultiplier, 0.6);
    adjustment.includeTexture = false;
    adjustment.acknowledgeRush = true;
    adjustment.includeSamCompassCallbacks = false;
    adjustment.includeMilitaryKidMemories = false;
    adjustment.includeJoyJournalRefs = false;
    adjustment.maxExpressionWords = Math.min(adjustment.maxExpressionWords, 18);
    adjustment.visionCastingStyle = 'quick';
    adjustment.reason += ' (quick planning mode)';
  }

  // Handle relaxed user - Jordan can tell full stories
  if (paceContext.seemsRelaxed) {
    adjustment.pauseMultiplier = Math.max(adjustment.pauseMultiplier, 1.2);
    adjustment.includeTexture = true;
    adjustment.includeSamCompassCallbacks = true;
    adjustment.includeMilitaryKidMemories = true;
    adjustment.includeJoyJournalRefs = true;
    adjustment.maxExpressionWords = Math.max(adjustment.maxExpressionWords, 50);
    adjustment.visionCastingStyle = 'immersive';
    adjustment.reason += ' (relaxed - full chapter exploration)';
  }

  // Handle interruption - quick energy burst
  if (paceContext.wasInterruption) {
    adjustment.preferredTiming = 'immediate';
    adjustment.expressionLength = 'brief';
    adjustment.pauseMultiplier = 0.5;
    adjustment.excitementLevel = 'full';
    adjustment.reason += ' (interrupted - quick excitement)';
  }

  // Handle milestone discussion - can be longer and more immersive
  if (paceContext.isMilestoneDiscussion) {
    adjustment.excitementLevel = 'full';
    adjustment.visionCastingStyle =
      adjustment.visionCastingStyle === 'quick' ? 'normal' : 'immersive';
    adjustment.reason += ' (milestone - vision-casting mode)';
  }

  // Handle quiet transition - more measured, thoughtful
  if (paceContext.isQuietTransition) {
    adjustment.excitementLevel = 'contained';
    adjustment.pauseMultiplier = Math.max(adjustment.pauseMultiplier, 1.1);
    adjustment.reason += ' (quiet transition - thoughtful presence)';
  }

  // Apply learned preferences
  if (learnedPreferences) {
    if (learnedPreferences.prefersShortResponses) {
      adjustment.expressionLength = 'brief';
      adjustment.maxExpressionWords = Math.min(adjustment.maxExpressionWords, 22);
      adjustment.includeMilitaryKidMemories = false;
      adjustment.includeJoyJournalRefs = false;
    }

    if (learnedPreferences.preferredPauseLength > 0) {
      adjustment.pauseMultiplier *= learnedPreferences.preferredPauseLength / 0.5;
    }

    if (!learnedPreferences.toleratesLongResponses) {
      adjustment.maxExpressionWords = Math.min(adjustment.maxExpressionWords, 28);
      adjustment.includeTexture = false;
    }
  }

  log.debug(
    {
      pace: paceContext.paceCategory,
      tempo: paceContext.tempo,
      rushed: paceContext.seemsRushed,
      excitement: adjustment.excitementLevel,
      visionStyle: adjustment.visionCastingStyle,
      maxWords: adjustment.maxExpressionWords,
    },
    '🎯 Jordan pace adjustment'
  );

  return adjustment;
}

/**
 * Apply pace adjustment to an expression
 */
export function applyPaceToExpression(
  expression: string,
  adjustment: JordanPaceAdjustment
): string {
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
      result += '!'; // Jordan ends with excitement
    }
  }

  // Adjust pause lengths in SSML
  if (adjustment.pauseMultiplier !== 1.0) {
    result = adjustSSMLPauses(result, adjustment.pauseMultiplier);
  }

  // Add rush acknowledgment if needed (Jordan-style - still excited)
  if (adjustment.acknowledgeRush && !result.toLowerCase().includes('quick')) {
    const jordanQuickPhrases = ['Quick thought: ', 'Oh! ', 'Love this: '];
    const phrase = jordanQuickPhrases[Math.floor(Math.random() * jordanQuickPhrases.length)];
    result = `${phrase}${result}`;
  }

  // Set emotion based on excitement level
  if (adjustment.excitementLevel === 'full' && !result.includes('<emotion')) {
    result = `<emotion value="enthusiastic"/>${result}`;
  } else if (adjustment.excitementLevel === 'contained' && !result.includes('<emotion')) {
    result = `<emotion value="affectionate"/>${result}`;
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

    // Floor at 60ms (Jordan has energy!), cap at 700ms
    const finalMs = Math.max(60, Math.min(700, adjustedMs));

    if (finalMs >= 1000) {
      return `<break time="${(finalMs / 1000).toFixed(1)}s"/>`;
    }
    return `<break time="${finalMs}ms"/>`;
  });
}

/**
 * Convert voice pace adapter data to Jordan's context format
 */
export function fromVoicePaceData(
  wpm?: number,
  preferences?: LearnedPacePreferences
): JordanPaceContext {
  const context: JordanPaceContext = {};

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

export const jordanVoicePacePersonality = {
  getAdjustment: getJordanPaceAdjustment,
  applyToExpression: applyPaceToExpression,
  adjustPauses: adjustSSMLPauses,
  fromVoicePaceData,
  categorizePace,
};

export default jordanVoicePacePersonality;

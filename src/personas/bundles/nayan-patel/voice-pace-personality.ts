/**
 * Voice Pace → Personality Integration for Nayan
 *
 * Adapts Nayan's personality expressions based on the user's speaking pace.
 * Nayan is DIFFERENT from other personas—he uses MORE silence, not less.
 * The slower the user, the more space Nayan creates for wisdom to land.
 *
 * Fast talker → Still measured, but with shorter pauses and quicker questions
 * Slow talker → Deep presence, extended silence, profound questions
 * Rushed → Acknowledge the rush, but invite them to pause
 * Relaxed → Full philosophical exploration, motorcycle stories, the long view
 *
 * UNIQUE TO NAYAN: He tends to SLOW DOWN when others would speed up.
 * His calm is contagious. His silence is intentional.
 *
 * @module personas/bundles/nayan-patel/voice-pace-personality
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type {
  PaceCategory,
  EnergyLevel,
  ConversationTempo,
  LearnedPacePreferences,
} from '../../../intelligence/voice-pace-adapter.js';

const log = createLogger({ module: 'nayan-voice-pace' });

// ============================================================================
// TYPES
// ============================================================================

export interface NayanPaceAdjustment {
  /** Prefer shorter or longer expressions */
  expressionLength: 'brief' | 'normal' | 'extended';

  /** Add more or fewer pauses in SSML - Nayan ALWAYS has pauses */
  pauseMultiplier: number;

  /** Preferred injection timing */
  preferredTiming: 'immediate' | 'after_pause' | 'mid_response' | 'with_silence';

  /** Whether to include stories/texture */
  includeTexture: boolean;

  /** Presence level - how much silence and weight */
  presenceLevel: 'light' | 'normal' | 'deep';

  /** Should we acknowledge rush but invite slowing? */
  inviteSlowing: boolean;

  /** Maximum expression word count - Nayan uses fewer words */
  maxExpressionWords: number;

  /** Should we include motorcycle/Kailash stories? */
  includeJourneyStories: boolean;

  /** Should we include Chamundi Hills references? */
  includeChamundiReferences: boolean;

  /** Should we include "very human" observations? */
  includeHumanObservations: boolean;

  /** Question depth */
  questionDepth: 'surface' | 'normal' | 'existential';

  /** Silence probability - Nayan uses silence as response */
  silenceProbability: number;

  /** Reason for adjustment */
  reason: string;
}

export interface NayanPaceContext {
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

  /** Is this an existential/deep topic? */
  isExistentialTopic?: boolean;

  /** Is user in crisis/distress? */
  isInDistress?: boolean;
}

// ============================================================================
// PACE → PERSONALITY MAPPINGS (Nayan-Specific)
// Note: Nayan is INVERSE of other personas - he slows when others speed up
// ============================================================================

const PACE_ADJUSTMENTS: Record<PaceCategory, Partial<NayanPaceAdjustment>> = {
  very_slow: {
    expressionLength: 'extended',
    pauseMultiplier: 1.6, // Nayan meets slowness with MORE space
    preferredTiming: 'with_silence',
    includeTexture: true,
    presenceLevel: 'deep',
    maxExpressionWords: 40, // Nayan uses fewer words than others
    includeJourneyStories: true,
    includeChamundiReferences: true,
    includeHumanObservations: true,
    questionDepth: 'existential',
    silenceProbability: 0.4, // 40% chance to respond with just silence
    reason: 'User speaks slowly - deep presence mode',
  },
  slow: {
    expressionLength: 'normal',
    pauseMultiplier: 1.4,
    preferredTiming: 'with_silence',
    includeTexture: true,
    presenceLevel: 'deep',
    maxExpressionWords: 35,
    includeJourneyStories: true,
    includeChamundiReferences: true,
    includeHumanObservations: true,
    questionDepth: 'existential',
    silenceProbability: 0.3,
    reason: 'User speaks at thoughtful pace - room for wisdom',
  },
  moderate: {
    expressionLength: 'normal',
    pauseMultiplier: 1.2,
    preferredTiming: 'after_pause',
    includeTexture: true,
    presenceLevel: 'normal',
    maxExpressionWords: 30,
    includeJourneyStories: true,
    includeChamundiReferences: false,
    includeHumanObservations: true,
    questionDepth: 'normal',
    silenceProbability: 0.2,
    reason: 'Standard pace - balanced presence',
  },
  fast: {
    expressionLength: 'brief',
    pauseMultiplier: 1.0, // Nayan STILL pauses, just less
    preferredTiming: 'after_pause',
    includeTexture: false,
    presenceLevel: 'light',
    maxExpressionWords: 22,
    includeJourneyStories: false,
    includeChamundiReferences: false,
    includeHumanObservations: true,
    questionDepth: 'normal',
    silenceProbability: 0.1,
    inviteSlowing: true, // Invite them to slow
    reason: 'User speaks quickly - lighter presence, invite slowing',
  },
  very_fast: {
    expressionLength: 'brief',
    pauseMultiplier: 0.9, // Even here, Nayan maintains some pause
    preferredTiming: 'immediate',
    includeTexture: false,
    presenceLevel: 'light',
    maxExpressionWords: 18,
    includeJourneyStories: false,
    includeChamundiReferences: false,
    includeHumanObservations: false,
    questionDepth: 'surface',
    silenceProbability: 0.05,
    inviteSlowing: true,
    reason: 'User speaks very fast - concise, but invite pause',
  },
};

const TEMPO_ADJUSTMENTS: Record<ConversationTempo, Partial<NayanPaceAdjustment>> = {
  relaxed: {
    expressionLength: 'extended',
    pauseMultiplier: 1.5,
    includeTexture: true,
    includeJourneyStories: true,
    includeChamundiReferences: true,
    includeHumanObservations: true,
    inviteSlowing: false,
    presenceLevel: 'deep',
    questionDepth: 'existential',
    silenceProbability: 0.35,
    reason: 'Relaxed conversation - full wisdom exploration',
  },
  normal: {
    expressionLength: 'normal',
    pauseMultiplier: 1.2,
    includeTexture: true,
    includeJourneyStories: true,
    includeChamundiReferences: false,
    includeHumanObservations: true,
    inviteSlowing: false,
    presenceLevel: 'normal',
    questionDepth: 'normal',
    silenceProbability: 0.2,
    reason: 'Normal tempo',
  },
  brisk: {
    expressionLength: 'brief',
    pauseMultiplier: 1.0,
    includeTexture: false,
    includeJourneyStories: false,
    includeChamundiReferences: false,
    includeHumanObservations: true,
    inviteSlowing: true,
    presenceLevel: 'light',
    questionDepth: 'surface',
    silenceProbability: 0.1,
    reason: 'Brisk conversation - concise wisdom',
  },
  rushed: {
    expressionLength: 'brief',
    pauseMultiplier: 0.9,
    includeTexture: false,
    includeJourneyStories: false,
    includeChamundiReferences: false,
    includeHumanObservations: false,
    inviteSlowing: true,
    maxExpressionWords: 16,
    presenceLevel: 'light',
    questionDepth: 'surface',
    silenceProbability: 0.05,
    reason: 'User seems rushed - acknowledge, invite pause',
  },
};

// ============================================================================
// ADJUSTMENT LOGIC
// ============================================================================

/**
 * Get personality adjustment based on voice pace for Nayan
 */
export function getNayanPaceAdjustment(
  paceContext: NayanPaceContext,
  learnedPreferences?: LearnedPacePreferences
): NayanPaceAdjustment {
  const defaultAdjustment: NayanPaceAdjustment = {
    expressionLength: 'normal',
    pauseMultiplier: 1.2, // Nayan ALWAYS has some pause
    preferredTiming: 'after_pause',
    includeTexture: true,
    presenceLevel: 'normal',
    inviteSlowing: false,
    maxExpressionWords: 30,
    includeJourneyStories: true,
    includeChamundiReferences: false,
    includeHumanObservations: true,
    questionDepth: 'normal',
    silenceProbability: 0.2,
    reason: 'Default Nayan pace adjustment',
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

  // Handle rushed user - Nayan acknowledges but invites pause
  if (paceContext.seemsRushed) {
    adjustment.inviteSlowing = true;
    adjustment.expressionLength = 'brief';
    adjustment.pauseMultiplier = Math.max(adjustment.pauseMultiplier, 0.9); // Nayan never goes fully fast
    adjustment.includeTexture = false;
    adjustment.maxExpressionWords = Math.min(adjustment.maxExpressionWords, 18);
    adjustment.presenceLevel = 'light';
    adjustment.reason += ' (rush acknowledged, pause invited)';
  }

  // Handle relaxed user - Nayan can go deep
  if (paceContext.seemsRelaxed) {
    adjustment.pauseMultiplier = Math.max(adjustment.pauseMultiplier, 1.4);
    adjustment.includeTexture = true;
    adjustment.includeJourneyStories = true;
    adjustment.includeChamundiReferences = true;
    adjustment.includeHumanObservations = true;
    adjustment.maxExpressionWords = Math.max(adjustment.maxExpressionWords, 40);
    adjustment.presenceLevel = 'deep';
    adjustment.questionDepth = 'existential';
    adjustment.silenceProbability = Math.max(adjustment.silenceProbability, 0.3);
    adjustment.reason += ' (relaxed - deep presence)';
  }

  // Handle interruption - still measured, but acknowledge
  if (paceContext.wasInterruption) {
    adjustment.preferredTiming = 'immediate';
    adjustment.expressionLength = 'brief';
    adjustment.pauseMultiplier = Math.max(0.8, adjustment.pauseMultiplier * 0.7);
    adjustment.reason += ' (interrupted - measured response)';
  }

  // Handle existential topic - go deeper
  if (paceContext.isExistentialTopic) {
    adjustment.presenceLevel = 'deep';
    adjustment.questionDepth = 'existential';
    adjustment.pauseMultiplier = Math.max(adjustment.pauseMultiplier, 1.3);
    adjustment.silenceProbability = Math.max(adjustment.silenceProbability, 0.25);
    adjustment.reason += ' (existential - deep presence)';
  }

  // Handle distress - grounding presence, not rushing
  if (paceContext.isInDistress) {
    adjustment.presenceLevel = 'deep';
    adjustment.pauseMultiplier = Math.max(adjustment.pauseMultiplier, 1.2);
    adjustment.expressionLength = 'brief';
    adjustment.questionDepth = 'surface'; // Don't go deep, ground them
    adjustment.inviteSlowing = false; // Don't lecture about slowing
    adjustment.reason += ' (distress - grounding presence)';
  }

  // Apply learned preferences
  if (learnedPreferences) {
    if (learnedPreferences.prefersShortResponses) {
      adjustment.expressionLength = 'brief';
      adjustment.maxExpressionWords = Math.min(adjustment.maxExpressionWords, 20);
      adjustment.includeJourneyStories = false;
      adjustment.includeChamundiReferences = false;
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
      presence: adjustment.presenceLevel,
      questionDepth: adjustment.questionDepth,
      silenceProb: adjustment.silenceProbability,
      maxWords: adjustment.maxExpressionWords,
    },
    '🧘 Nayan pace adjustment'
  );

  return adjustment;
}

/**
 * Apply pace adjustment to an expression
 */
export function applyPaceToExpression(expression: string, adjustment: NayanPaceAdjustment): string {
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

  // Invite slowing if appropriate (Nayan's unique approach)
  if (adjustment.inviteSlowing && Math.random() < 0.3) {
    const slowingInvites = [
      '<break time="400ms"/>',
      '<break time="300ms"/>Mm.<break time="200ms"/>',
    ];
    const invite = slowingInvites[Math.floor(Math.random() * slowingInvites.length)];
    result = `${invite}${result}`;
  }

  // Set emotion based on presence level
  if (adjustment.presenceLevel === 'deep' && !result.includes('<emotion')) {
    result = `<emotion value="contemplative"/>${result}`;
  } else if (adjustment.presenceLevel === 'light' && !result.includes('<emotion')) {
    result = `<emotion value="calm"/>${result}`;
  }

  // Add extended pause at end for deep presence
  if (adjustment.presenceLevel === 'deep' && !result.endsWith('/>')) {
    result = `${result}<break time="500ms"/>`;
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

    // Floor at 100ms (Nayan always pauses), cap at 1000ms
    const finalMs = Math.max(100, Math.min(1000, adjustedMs));

    if (finalMs >= 1000) {
      return `<break time="${(finalMs / 1000).toFixed(1)}s"/>`;
    }
    return `<break time="${finalMs}ms"/>`;
  });
}

/**
 * Convert voice pace adapter data to Nayan's context format
 */
export function fromVoicePaceData(
  wpm?: number,
  preferences?: LearnedPacePreferences
): NayanPaceContext {
  const context: NayanPaceContext = {};

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

export const nayanVoicePacePersonality = {
  getAdjustment: getNayanPaceAdjustment,
  applyToExpression: applyPaceToExpression,
  adjustPauses: adjustSSMLPauses,
  fromVoicePaceData,
  categorizePace,
};

export default nayanVoicePacePersonality;

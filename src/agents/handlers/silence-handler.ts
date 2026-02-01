/**
 * Silence Handler
 *
 * Handles meaningful silence during conversations.
 * Creates genuine connection through progressive, persona-aware responses
 * instead of generic "still there?" prompts.
 *
 * Enhanced with BTH v4 Silence Interpreter for:
 * - Adaptive timing based on learned user patterns
 * - Silence type classification (processing, emotional, disengagement, etc.)
 * - Topic-specific silence awareness
 * - Response effectiveness tracking
 */

import { getLogger } from '../../utils/safe-logger.js';
import {
  getMeaningfulSilenceResponse,
  type SilenceContext,
  type SilenceResponse,
} from '../../personas/meaningful-silence.js';
import { SILENCE_THRESHOLDS } from '../shared/constants.js';
import type { PersonaConfig } from '../../personas/types.js';

// BTH v4: Enhanced Silence Interpreter
import {
  analyzeSilence,
  recordSilenceOutcome,
  loadSilenceProfile,
  learnFromPatterns,
  updateResponseEffectiveness,
  getBestResponsePhrase,
  getOptimalWaitTime,
  type SilenceProfile,
  type SilenceType,
} from '../../services/superhuman/silence-interpreter.js';

// Re-export types for convenience
export type { SilenceContext, SilenceResponse };

/**
 * Silence tracking state
 */
export interface SilenceState {
  userLastSpokeAt: number;
  responseCount: number;
  lastResponseAt: number;
}

/**
 * Response intervals for progressive silence handling
 * First response at 10s, second at 22s, third at 38s
 */
const SILENCE_INTERVALS = [10, 22, 38];

/**
 * BTH v4: Enhanced silence state with profile
 */
export interface EnhancedSilenceState extends SilenceState {
  profile?: SilenceProfile | null;
  lastSilenceType?: SilenceType;
  currentTopic?: string;
}

/**
 * Check if we should respond to silence
 */
export function shouldRespondToSilence(
  silenceDurationSec: number,
  state: SilenceState
): { shouldRespond: boolean; intervalIndex: number } {
  const targetInterval = SILENCE_INTERVALS[state.responseCount];

  if (!targetInterval) {
    return { shouldRespond: false, intervalIndex: -1 };
  }

  const timeSinceLastResponse = Date.now() - state.lastResponseAt;

  if (
    silenceDurationSec >= targetInterval &&
    timeSinceLastResponse > SILENCE_THRESHOLDS.MIN_RESPONSE_INTERVAL
  ) {
    return { shouldRespond: true, intervalIndex: state.responseCount };
  }

  return { shouldRespond: false, intervalIndex: -1 };
}

/**
 * BTH v4: Enhanced silence check with adaptive timing
 *
 * Uses the silence interpreter to:
 * 1. Classify the type of silence (processing, emotional, etc.)
 * 2. Get optimal wait time based on learned patterns
 * 3. Recommend best response based on effectiveness history
 */
export async function shouldRespondToSilenceEnhanced(
  userId: string,
  silenceDurationSec: number,
  state: EnhancedSilenceState,
  context: {
    lastUserMessage?: string;
    currentTopic?: string;
    recentEmotionalTone?: string;
  }
): Promise<{
  shouldRespond: boolean;
  intervalIndex: number;
  silenceType?: SilenceType;
  recommendedPhrase?: string;
  optimalWaitMs?: number;
}> {
  const logger = getLogger();

  // Load user's silence profile if not cached
  if (state.profile === undefined) {
    state.profile = await loadSilenceProfile(userId);
  }

  // Analyze the current silence
  const analysis = analyzeSilence(silenceDurationSec * 1000, {
    precedingTopic: context.currentTopic,
    precedingEmotion: context.recentEmotionalTone,
    precedingUserMessage: context.lastUserMessage,
    voiceMarkersBefore: {
      breathPattern: 'normal',
      microSounds: [],
      energyJustBefore: 0.5,
    },
    conversationPhase: 'middle',
  });

  // Get optimal wait time based on silence type and user patterns
  const optimalWaitMs = state.profile
    ? await getOptimalWaitTime(userId, analysis.type)
    : analysis.waitDurationMs;
  const optimalWaitSec = optimalWaitMs / 1000;

  // Check if we've waited long enough
  const targetInterval = Math.max(SILENCE_INTERVALS[state.responseCount] || 38, optimalWaitSec);

  const timeSinceLastResponse = Date.now() - state.lastResponseAt;
  const shouldRespond =
    silenceDurationSec >= targetInterval &&
    timeSinceLastResponse > SILENCE_THRESHOLDS.MIN_RESPONSE_INTERVAL;

  // Get best response phrase based on effectiveness history
  let recommendedPhrase: string | undefined;
  if (shouldRespond && state.profile) {
    recommendedPhrase = await getBestResponsePhrase(userId, analysis.type);
  }

  logger.debug(
    {
      userId,
      silenceDurationSec,
      silenceType: analysis.type,
      optimalWaitSec,
      targetInterval,
      shouldRespond,
      hasRecommendedPhrase: !!recommendedPhrase,
    },
    'BTH v4: Enhanced silence analysis'
  );

  // Update state with current analysis
  state.lastSilenceType = analysis.type;
  state.currentTopic = context.currentTopic;

  return {
    shouldRespond,
    intervalIndex: state.responseCount,
    silenceType: analysis.type,
    recommendedPhrase,
    optimalWaitMs,
  };
}

/**
 * BTH v4: Record silence outcome for learning
 *
 * Call this after silence response to track effectiveness:
 * - Did user respond positively?
 * - Did the conversation continue?
 * - Should we adjust timing for this silence type?
 */
export async function recordSilenceOutcomeForLearning(
  userId: string,
  silenceType: SilenceType,
  responsePhrase: string,
  outcome: {
    userResponded: boolean;
    responseWasPositive: boolean;
    conversationContinued: boolean;
    durationMs: number;
    topic?: string;
    emotion?: string;
  }
): Promise<void> {
  const logger = getLogger();

  try {
    // Create a minimal SilenceAnalysis for recording
    const analysis = analyzeSilence(outcome.durationMs, {
      precedingTopic: outcome.topic,
      precedingEmotion: outcome.emotion,
      voiceMarkersBefore: {
        breathPattern: 'normal',
        microSounds: [],
        energyJustBefore: 0.5,
      },
      conversationPhase: 'middle',
    });

    // Record the silence outcome (3 args: userId, analysis, outcome)
    await recordSilenceOutcome(userId, analysis, {
      ferniResponse: responsePhrase,
      wasHelpful: outcome.responseWasPositive,
      userContinued: outcome.conversationContinued,
      topic: outcome.topic,
      emotion: outcome.emotion,
    });

    // Update response effectiveness
    await updateResponseEffectiveness(
      userId,
      silenceType,
      responsePhrase,
      outcome.responseWasPositive,
      outcome.durationMs // waitTimeMs
    );

    // Trigger learning if enough patterns collected
    await learnFromPatterns(userId);

    logger.debug(
      {
        userId,
        silenceType,
        userResponded: outcome.userResponded,
        responseWasPositive: outcome.responseWasPositive,
      },
      'BTH v4: Silence outcome recorded'
    );
  } catch (error) {
    logger.debug(
      { error: String(error), userId },
      'BTH v4: Failed to record silence outcome (non-critical)'
    );
  }
}

/**
 * Generate a meaningful silence response
 *
 * @param persona - Current persona configuration
 * @param context - Context about the conversation (includes silenceResponseCount)
 * @returns SilenceResponse with type, text, and invitesReply flag
 */
export function generateSilenceResponse(
  persona: PersonaConfig,
  context: SilenceContext
): SilenceResponse {
  const logger = getLogger();

  // Get persona-aware response (silenceResponseCount is in context)
  const response = getMeaningfulSilenceResponse(persona, context);

  logger.debug(
    {
      personaId: persona.id,
      silenceDuration: context.silenceDurationSeconds,
      responseType: response.type,
      invitesReply: response.invitesReply,
    },
    'Generated silence response'
  );

  return response;
}

/**
 * Create initial silence context from user data
 */
export function createSilenceContext(userName?: string, turnCount = 0): SilenceContext {
  const context: SilenceContext = {
    silenceDurationSeconds: 0,
    turnCount,
    topicsDiscussed: [],
    recentEmotionalTone: 'neutral',
    memorableMoments: [],
  };
  if (userName !== undefined) {
    context.userName = userName;
  }
  return context;
}

/**
 * Update silence context with conversation data
 */
export function updateSilenceContext(
  context: SilenceContext,
  updates: Partial<SilenceContext>
): SilenceContext {
  return {
    ...context,
    ...updates,
  };
}

/**
 * Reset silence tracking state (when user speaks)
 */
export function resetSilenceState(): SilenceState {
  return {
    userLastSpokeAt: Date.now(),
    responseCount: 0,
    lastResponseAt: 0,
  };
}

/**
 * Update silence state after responding
 */
export function recordSilenceResponse(state: SilenceState): SilenceState {
  return {
    ...state,
    responseCount: state.responseCount + 1,
    lastResponseAt: Date.now(),
  };
}

export default {
  shouldRespondToSilence,
  shouldRespondToSilenceEnhanced,
  generateSilenceResponse,
  createSilenceContext,
  updateSilenceContext,
  resetSilenceState,
  recordSilenceResponse,
  recordSilenceOutcomeForLearning,
};

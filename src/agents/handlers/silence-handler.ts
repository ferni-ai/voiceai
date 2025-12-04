/**
 * Silence Handler
 *
 * Handles meaningful silence during conversations.
 * Creates genuine connection through progressive, persona-aware responses
 * instead of generic "still there?" prompts.
 */

import { log } from '@livekit/agents';
import {
  getMeaningfulSilenceResponse,
  type SilenceContext,
  type SilenceResponse,
} from '../../personas/meaningful-silence.js';
import { SILENCE_THRESHOLDS } from '../shared/constants.js';
import type { PersonaConfig } from '../../personas/types.js';

const getLogger = () => log();

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
export function createSilenceContext(userName?: string, turnCount: number = 0): SilenceContext {
  return {
    silenceDurationSeconds: 0,
    turnCount,
    topicsDiscussed: [],
    recentEmotionalTone: 'neutral',
    userName,
    memorableMoments: [],
  };
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
  generateSilenceResponse,
  createSilenceContext,
  updateSilenceContext,
  resetSilenceState,
  recordSilenceResponse,
};

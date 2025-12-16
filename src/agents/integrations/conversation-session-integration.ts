/**
 * Conversation Session Integration for Voice Agent
 *
 * Provides a clean integration between the unified conversation system
 * and the voice agent. This replaces the scattered calls to multiple
 * orchestrators with a single session-based API.
 *
 * Usage in voice-agent.ts:
 * ```typescript
 * // At session start (STEP 7a2)
 * const convSession = initConversationSession({
 *   sessionId,
 *   userId: services.userId,
 *   personaId: sessionPersona.id,
 *   sessionCount: services.userProfile?.totalConversations,
 *   relationshipStage: services.userProfile?.relationshipStage,
 * });
 *
 * // In transcriptionNode (POST-LLM HUMANIZATION)
 * const humanized = await humanizeAgentResponse(sessionId, rawResponse, {
 *   userMessage: lastUserMessage,
 *   userEmotion: emotionAnalysis?.primary,
 *   topic: currentTopic,
 *   wasPersonalSharing: emotionIntensity > 0.7,
 *   isSeriousContext: distressLevel > 0.3,
 * });
 *
 * // At session end
 * cleanupConversationSession(sessionId);
 * ```
 *
 * @module @ferni/agents/integrations/conversation-session
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  createConversationSession,
  endConversationSession,
  getConversationSession,
  type ConversationSession,
  type ConversationSessionConfig,
  type TurnInput,
  type TurnResult,
} from '../../conversation/unified-integration.js';

// Also export types for voice agent use
export type { ConversationSession, TurnResult };

const log = createLogger({ module: 'ConversationSessionIntegration' });

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceAgentSessionConfig {
  sessionId: string;
  userId?: string;
  personaId: string;
  sessionCount?: number;
  relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
}

export interface HumanizeContext {
  userMessage: string;
  userEmotion?: string;
  topic?: string;
  wasPersonalSharing?: boolean;
  isSeriousContext?: boolean;
  sessionData?: Record<string, unknown>;
}

export interface HumanizedResponse {
  /** Humanized plain text */
  text: string;
  /** SSML with prosody markers */
  ssml: string;
  /** Features that were applied */
  appliedFeatures: string[];
  /** Pacing recommendation for TTS */
  pacing: 'faster' | 'normal' | 'slower';
  /** Optional memory callback to prepend */
  memoryCallback?: { text: string; ssml: string };
  /** Optional follow-up question to append */
  followUpQuestion?: { text: string; ssml: string };
  /** Confidence score */
  confidence: number;
  /** Timing breakdown */
  timing: {
    total: number;
    analysis: number;
    intelligence: number;
    humanization: number;
  };
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * Initialize a conversation session for the voice agent
 *
 * Call this at session start (STEP 7a2 in voice-agent.ts)
 */
export function initConversationSession(
  config: VoiceAgentSessionConfig
): ConversationSession | null {
  try {
    const session = createConversationSession({
      sessionId: config.sessionId,
      userId: config.userId || 'anonymous',
      personaId: config.personaId,
      sessionCount: config.sessionCount,
      relationshipStage: config.relationshipStage,
    });

    log.info(
      {
        sessionId: config.sessionId,
        personaId: config.personaId,
        hasUserId: !!config.userId,
      },
      '🎭 Conversation session initialized for voice agent'
    );

    return session;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to initialize conversation session');
    return null;
  }
}

/**
 * Get an existing conversation session
 */
export function getVoiceAgentConversationSession(sessionId: string): ConversationSession | null {
  return getConversationSession(sessionId);
}

/**
 * Cleanup a conversation session
 *
 * Call this at session end
 */
export function cleanupConversationSession(sessionId: string): void {
  try {
    endConversationSession(sessionId);
    log.info({ sessionId }, '🎭 Conversation session cleaned up');
  } catch (error) {
    log.warn({ error: String(error), sessionId }, 'Error during conversation session cleanup');
  }
}

// ============================================================================
// HUMANIZATION API
// ============================================================================

/**
 * Humanize an agent response using the unified conversation system
 *
 * This replaces the direct call to getConversationHumanizer().humanizeResponseAsync()
 * in the voice agent's transcriptionNode.
 *
 * @param sessionId - The session ID
 * @param rawResponse - The raw LLM response to humanize
 * @param context - Context for humanization
 * @returns Humanized response or null if session not found
 */
export async function humanizeAgentResponse(
  sessionId: string,
  rawResponse: string,
  context: HumanizeContext
): Promise<HumanizedResponse | null> {
  const session = getConversationSession(sessionId);

  if (!session) {
    log.warn({ sessionId }, 'No conversation session found for humanization');
    return null;
  }

  try {
    const turnInput: TurnInput = {
      userMessage: context.userMessage,
      rawResponse,
      userEmotion: context.userEmotion,
      topic: context.topic,
      wasPersonalSharing: context.wasPersonalSharing,
      isSeriousContext: context.isSeriousContext,
      sessionData: context.sessionData,
    };

    const result = await session.processTurn(turnInput);

    return {
      text: result.text,
      ssml: result.ssml,
      appliedFeatures: result.appliedFeatures,
      pacing: result.pacing,
      memoryCallback: result.memoryCallback,
      followUpQuestion: result.followUpQuestion,
      confidence: result.confidence,
      timing: result.timing,
    };
  } catch (error) {
    log.warn({ error: String(error), sessionId }, 'Humanization failed');
    return null;
  }
}

// ============================================================================
// EVENT RECORDING
// ============================================================================

/**
 * Record a vulnerability event (user shared something personal)
 */
export function recordVulnerabilityEvent(sessionId: string): void {
  const session = getConversationSession(sessionId);
  if (session) {
    session.recordVulnerability();
  }
}

/**
 * Record a laughter event (shared humor moment)
 */
export function recordLaughterEvent(sessionId: string): void {
  const session = getConversationSession(sessionId);
  if (session) {
    session.recordLaughter();
  }
}

/**
 * Record a breakthrough event (user had an insight)
 */
export function recordBreakthroughEvent(sessionId: string): void {
  const session = getConversationSession(sessionId);
  if (session) {
    session.recordBreakthrough();
  }
}

// ============================================================================
// STATE ACCESS
// ============================================================================

/**
 * Get the current turn count for a session
 */
export function getTurnCount(sessionId: string): number {
  const session = getConversationSession(sessionId);
  return session?.getTurnCount() ?? 0;
}

/**
 * Get the current comfort level for a session
 */
export function getComfortLevel(sessionId: string): number {
  const session = getConversationSession(sessionId);
  return session?.getComfortLevel() ?? 0.25;
}

/**
 * Get the full session state
 */
export function getSessionState(
  sessionId: string
): ReturnType<ConversationSession['getState']> | null {
  const session = getConversationSession(sessionId);
  return session?.getState() ?? null;
}

// ============================================================================
// BACKWARD COMPATIBILITY SHIM
// ============================================================================

/**
 * Backward-compatible humanization function
 *
 * Use this as a drop-in replacement during migration.
 * It falls back to the legacy humanizer if the unified session isn't available.
 */
export async function humanizeWithFallback(
  sessionId: string,
  rawResponse: string,
  context: HumanizeContext & { personaId: string }
): Promise<HumanizedResponse> {
  // Try unified session first
  const result = await humanizeAgentResponse(sessionId, rawResponse, context);

  if (result) {
    return result;
  }

  // Fallback to legacy humanizer
  log.debug({ sessionId }, 'Falling back to legacy humanizer');

  const { getConversationHumanizer } = await import('../../conversation/index.js');
  const humanizer = getConversationHumanizer(context.personaId);

  const legacyResult = await humanizer.humanizeResponseAsync(rawResponse, {
    personaId: context.personaId,
    turnNumber: 1,
    userMessage: context.userMessage,
    userEmotion: context.userEmotion,
    topic: context.topic,
    isSeriousContext: context.isSeriousContext,
    wasPersonalSharing: context.wasPersonalSharing,
    sessionData: context.sessionData,
  });

  return {
    text: legacyResult.text,
    ssml: legacyResult.ssml,
    appliedFeatures: legacyResult.appliedFeatures,
    pacing: legacyResult.pacing,
    memoryCallback: legacyResult.memoryCallback,
    followUpQuestion: legacyResult.followUpQuestion,
    confidence: 0.5,
    timing: { total: 0, analysis: 0, intelligence: 0, humanization: 0 },
  };
}

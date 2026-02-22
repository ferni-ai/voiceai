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

import { isCoach } from '../../personas/persona-ids.js';
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
// NOTE: The old intelligence hooks have been deprecated and always return null.
// The new intelligence system in src/intelligence/ should be used directly.
// See: src/intelligence/context-builders/ for context injection
// See: src/services/superhuman/ for "Better Than Human" features

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
  /** User profile for superhuman memory callbacks */
  userProfile?: {
    humanMemory?: unknown; // Partial<HumanMemory> but keeping loose for flexibility
  };
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
 *
 * NOTE: The old intelligence integration has been deprecated.
 * Intelligence features now run via:
 * - Context builders in src/intelligence/context-builders/
 * - Superhuman services in src/services/superhuman/
 */
export async function initConversationSession(
  config: VoiceAgentSessionConfig
): Promise<ConversationSession | null> {
  try {
    const session = createConversationSession({
      sessionId: config.sessionId,
      userId: config.userId || 'anonymous',
      personaId: config.personaId,
      sessionCount: config.sessionCount,
      relationshipStage: config.relationshipStage,
    });

    // Prewarm LLM expression cache (non-blocking)
    // This loads persisted expressions AND generates new ones for common themes
    if (isCoach(config.personaId)) {
      // Ferni has the full "Better Than Human" personality system
      try {
        const { prewarmPersonalitySession } =
          await import('../../personas/bundles/ferni/personality-integration.js');
        void prewarmPersonalitySession(config.userId, {
          relationshipStage: config.relationshipStage,
        });
      } catch {
        // Prewarm is optional - continue if it fails
      }

      // Initialize superhuman memory callbacks (non-blocking)
      // This queues proactive insights like birthdays, growth celebrations, etc.
      if (config.userId && config.userProfile?.humanMemory) {
        try {
          const { initializeMemoryCallbacks } =
            await import('../../personas/bundles/ferni/superhuman-memory-integration.js');
          // Pass actual humanMemory for callback generation
          void initializeMemoryCallbacks(
            config.userId,
            config.userProfile.humanMemory as Parameters<typeof initializeMemoryCallbacks>[1]
          ).then(({ callbacksQueued }) => {
            if (callbacksQueued > 0) {
              log.info({ userId: config.userId, callbacksQueued }, '🧠 Memory callbacks queued');
            }
          });
        } catch {
          // Memory callbacks are optional - continue if they fail
        }
      }
    }
    // NOTE: Shared LLM expression prewarming removed - use persona-specific expression generators

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
 * Call this at session end.
 * NOTE: Intelligence cleanup is now handled by cleanup-handler.ts via the new
 * intelligence system in src/intelligence/ and src/services/superhuman/.
 */
export async function cleanupConversationSession(
  sessionId: string,
  _sessionMood?: 'positive' | 'neutral' | 'struggling' | 'crisis',
  _topics?: string[]
): Promise<void> {
  try {
    endConversationSession(sessionId);
    log.info({ sessionId }, '🎭 Conversation session cleaned up');
  } catch (error) {
    log.warn({ error: String(error), sessionId }, 'Error during conversation session cleanup');
  }
}

/**
 * Process a user message through the intelligence system for moment detection
 *
 * @deprecated This function is deprecated. Moment detection and intelligence
 * processing now happens via:
 * - src/intelligence/context-builders/ (injected into each turn)
 * - src/services/superhuman/semantic-intelligence/ (cross-session insights)
 * - cleanup-handler.ts (session-end processing)
 *
 * This function now returns null for backwards compatibility.
 */
export async function processMessageWithIntelligenceSystem(
  _sessionId: string,
  _userMessage: string,
  _aiResponse?: string,
  _topic?: string
): Promise<{
  shouldAcknowledge: boolean;
  concerns: Array<{ severity: string; detection: string }>;
  suggestedResponse?: string;
} | null> {
  // Deprecated - intelligence processing now happens via context builders
  return null;
}

/**
 * Get intelligence integration for a session
 *
 * @deprecated The old intelligence system has been removed.
 * Use the new systems in src/intelligence/ and src/services/superhuman/ instead.
 */
export function getIntelligence(_sessionId: string): null {
  // Deprecated - always returns null
  return null;
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

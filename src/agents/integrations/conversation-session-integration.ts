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
 * // At session end
 * cleanupConversationSession(sessionId);
 * ```
 *
 * @module @ferni/agents/integrations/conversation-session
 */

import { isCoach } from '../../personas/persona-ids.js';
import { scriptedSelfDisclosureEnabled } from '../../personas/shared/scripted-self-disclosure.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  createConversationSession,
  endConversationSession,
  getConversationSession,
  type ConversationSession,
} from '../../conversation/unified-integration.js';
// NOTE: The old intelligence hooks have been deprecated and always return null.
// The new intelligence system in src/intelligence/ should be used directly.
// See: src/intelligence/context-builders/ for context injection
// See: src/services/superhuman/ for "Better Than Human" features

// Also export types for voice agent use
export type { ConversationSession };

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

    // Prewarm LLM expression cache (non-blocking) — Ferni only. The cache only
    // feeds the scripted self-disclosure lines, so skip it while they're off.
    if (isCoach(config.personaId) && scriptedSelfDisclosureEnabled()) {
      try {
        const { prewarmPersonalitySession } =
          await import('../../personas/bundles/ferni/personality-integration.js');
        void prewarmPersonalitySession(config.userId, {
          relationshipStage: config.relationshipStage,
        });
      } catch {
        // Prewarm is optional - continue if it fails
      }
    }

    // Initialize superhuman memory callbacks for ALL personas (non-blocking)
    // Queues proactive insights: dates, growth, absences, inside jokes, comfort
    if (config.userId && config.userProfile?.humanMemory) {
      try {
        const { initializeMemoryCallbacks } =
          await import('../../personas/bundles/ferni/superhuman-memory-integration.js');
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

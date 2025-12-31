/**
 * Thread Context Builder
 *
 * Injects conversation thread context into the LLM system prompt.
 * This ensures continuity across channels and agent handoffs.
 *
 * @module intelligence/context-builders/thread-context
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { PersonaId } from '../../personas/types.js';
import {
  getActiveThread,
  buildAgentContext,
} from '../../services/conversation-thread/thread-manager.js';
import { getConversationBridgeContext } from '../../services/outreach/conversation-context-bridge.js';

const log = createLogger({ module: 'ThreadContextBuilder' });

// ============================================================================
// TYPES
// ============================================================================

export interface ThreadContextInjection {
  /** Formatted context for LLM system prompt */
  content: string;
  /** Priority for injection ordering */
  priority: number;
  /** Whether this is a response to outreach */
  isOutreachResponse: boolean;
  /** The thread ID if one exists */
  threadId?: string;
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

/**
 * Build thread context for injection into the LLM.
 * Call this at the start of a voice session.
 */
export async function buildThreadContext(
  userId: string,
  agentId: PersonaId,
  options?: {
    sessionId?: string;
    fromNotification?: boolean;
  }
): Promise<ThreadContextInjection | null> {
  try {
    // ─────────────────────────────────────────────────────────────────────────
    // CHECK FOR OUTREACH BRIDGE CONTEXT
    // (User responding to our proactive message)
    // ─────────────────────────────────────────────────────────────────────────
    const bridgeContext = await getConversationBridgeContext(userId);

    if (bridgeContext && bridgeContext.isDirectResponse) {
      log.info(
        {
          userId,
          agentId,
          outreachId: bridgeContext.outreach.outreachId,
          outreachType: bridgeContext.outreach.type,
        },
        '📞 Voice call is response to outreach - injecting bridge context'
      );

      return {
        content: bridgeContext.llmContext,
        priority: 95, // Very high - sets the tone
        isOutreachResponse: true,
        threadId: bridgeContext.outreach.outreachId,
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CHECK FOR ACTIVE THREAD
    // (Continuation of ongoing conversation)
    // ─────────────────────────────────────────────────────────────────────────
    const activeThread = await getActiveThread(userId);

    if (activeThread) {
      const agentContext = await buildAgentContext(activeThread.id, agentId, {
        userInitiated: true,
        joinReason: options?.fromNotification ? 'user tapped notification' : 'user initiated call',
      });

      log.info(
        {
          userId,
          agentId,
          threadId: activeThread.id,
          messageCount: activeThread.messageCount,
          channelsUsed: activeThread.channelsUsed,
        },
        '🧵 Continuing active thread - injecting thread context'
      );

      return {
        content: agentContext.llmContext,
        priority: 85, // High but below outreach
        isOutreachResponse: false,
        threadId: activeThread.id,
      };
    }

    // No thread context to inject
    return null;
  } catch (error) {
    log.error({ error, userId, agentId }, 'Failed to build thread context');
    return null;
  }
}

/**
 * Build a simple continuation hint for system prompt.
 * Use this if full thread context is too heavy.
 */
export async function buildContinuationHint(
  userId: string,
  agentId: PersonaId
): Promise<string | null> {
  try {
    const bridgeContext = await getConversationBridgeContext(userId);

    if (bridgeContext && bridgeContext.isDirectResponse) {
      return `[NOTE: This user is responding to your earlier ${bridgeContext.outreach.channel} message. Acknowledge naturally.]`;
    }

    const activeThread = await getActiveThread(userId);

    if (activeThread && activeThread.messageCount > 0) {
      if (activeThread.lastChannel !== 'voice') {
        return `[NOTE: You've been chatting with this user via ${activeThread.lastChannel}. They're now calling.]`;
      }

      if (activeThread.currentOwnerId !== agentId) {
        return `[NOTE: ${activeThread.currentOwnerId} was talking to them. You're taking over.]`;
      }
    }

    return null;
  } catch {
    return null;
  }
}

// ============================================================================
// REGISTRATION WITH CONTEXT BUILDER PIPELINE
// ============================================================================

/**
 * Register with the main context builder.
 * Call this during startup.
 */
export function registerThreadContextBuilder(): void {
  // This would register with the main context builder pipeline
  // For now, the builder can be called directly from voice-agent-entry
  log.info('Thread context builder registered');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const threadContextBuilder = {
  build: buildThreadContext,
  buildHint: buildContinuationHint,
  register: registerThreadContextBuilder,
};

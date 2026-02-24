/**
 * Thread Context Builder
 *
 * Builds cross-channel thread context for voice sessions.
 * Integrates with conversation-thread service for continuity.
 *
 * @module intelligence/context-builders/session/thread-context
 */

import type { PersonaId } from '../../../personas/types.js';
import { getOrCreateThread } from '../../../services/conversation-thread/thread-manager.js';
import { buildAgentContext } from '../../../services/conversation-thread/thread-manager.js';

export interface ThreadContextResult {
  content: string;
  threadId: string;
  isOutreachResponse: boolean;
  priority?: string;
}

export interface BuildThreadContextOptions {
  sessionId: string;
  fromNotification?: boolean;
}

/**
 * Build thread context for a voice session.
 * Gets or creates a thread and returns context for LLM injection.
 */
export async function buildThreadContext(
  userId: string,
  personaId: PersonaId,
  options: BuildThreadContextOptions
): Promise<ThreadContextResult | null> {
  try {
    const { fromNotification = false } = options;

    const thread = await getOrCreateThread(userId, 'voice', personaId, {
      triggerType: fromNotification ? 'reply_to_outreach' : 'user_initiated',
    });

    const agentContext = await buildAgentContext(thread.id, personaId, {
      userInitiated: !fromNotification,
    });

    return {
      content: agentContext.llmContext,
      threadId: thread.id,
      isOutreachResponse: fromNotification,
      priority: 'normal',
    };
  } catch {
    return null;
  }
}

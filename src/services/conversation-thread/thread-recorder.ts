/**
 * Thread Recorder
 *
 * Records messages to conversation threads during voice sessions.
 * This enables cross-channel continuity - messages from voice calls
 * are stored in threads that can be continued via SMS, push, etc.
 *
 * @module services/conversation-thread/thread-recorder
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { PersonaId } from '../../personas/types.js';
import type { ThreadMessage, EngagementChannel } from './types.js';
import {
  getOrCreateThread,
  addMessage,
  getActiveThread,
  updateThreadTopics,
  updateEmotionalContext,
} from './thread-manager.js';

const log = createLogger({ module: 'ThreadRecorder' });

// ============================================================================
// TYPES
// ============================================================================

export interface RecordMessageOptions {
  /** User ID */
  userId: string;
  /** Session ID (for logging/correlation) */
  sessionId: string;
  /** Current persona ID */
  personaId: PersonaId;
  /** Thread ID (if already known from session start) */
  threadId?: string;
  /** Message content */
  content: string;
  /** Message sentiment (from emotion detection) */
  sentiment?: 'positive' | 'neutral' | 'negative';
  /** Topics mentioned */
  topics?: string[];
  /** Tool calls made (for agent messages) */
  toolCalls?: string[];
}

// ============================================================================
// SESSION STATE
// ============================================================================

/** Cache of active thread IDs per session */
const sessionThreads = new Map<string, string>();

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Initialize thread recording for a session.
 * Call this at voice session start.
 */
export async function initializeThreadRecording(
  userId: string,
  sessionId: string,
  personaId: PersonaId,
  options?: {
    existingThreadId?: string;
    isOutreachResponse?: boolean;
    outreachId?: string;
  }
): Promise<{ threadId: string; isNew: boolean }> {
  try {
    // Check for existing thread from options
    if (options?.existingThreadId) {
      sessionThreads.set(sessionId, options.existingThreadId);
      log.info(
        { sessionId, threadId: options.existingThreadId },
        '🧵 Thread recording initialized (existing thread)'
      );
      return { threadId: options.existingThreadId, isNew: false };
    }

    // Get or create thread
    const thread = await getOrCreateThread(userId, 'voice', personaId, {
      triggerType: options?.isOutreachResponse ? 'reply_to_outreach' : 'user_initiated',
      outreachId: options?.outreachId,
    });

    sessionThreads.set(sessionId, thread.id);

    const isNew = thread.messageCount === 0;
    log.info(
      { sessionId, threadId: thread.id, isNew },
      `🧵 Thread recording initialized (${isNew ? 'new' : 'continuing'})`
    );

    return { threadId: thread.id, isNew };
  } catch (error) {
    log.error({ error, userId, sessionId }, 'Failed to initialize thread recording');
    return { threadId: '', isNew: false };
  }
}

/**
 * Record a user message to the thread.
 * Call this when user transcript is finalized.
 */
export async function recordUserMessage(options: RecordMessageOptions): Promise<void> {
  const { userId, sessionId, content, sentiment, topics } = options;

  if (!content || content.trim().length === 0) {
    return; // Skip empty messages
  }

  try {
    // Get thread ID for this session
    let threadId = options.threadId || sessionThreads.get(sessionId);

    // If no thread yet, create one
    if (!threadId) {
      const init = await initializeThreadRecording(userId, sessionId, options.personaId);
      threadId = init.threadId;
    }

    if (!threadId) {
      log.debug({ sessionId }, 'No thread ID, skipping user message recording');
      return;
    }

    // Add message to thread
    await addMessage(threadId, {
      role: 'user',
      channel: 'voice',
      direction: 'inbound',
      content: content.trim(),
      timestamp: new Date(),
      metadata: {
        sentiment,
      },
    });

    // Update topics if provided
    if (topics && topics.length > 0) {
      await updateThreadTopics(threadId, topics);
    }

    log.debug(
      { sessionId, threadId, contentLength: content.length },
      '📝 User message recorded to thread'
    );
  } catch (error) {
    // Non-fatal - don't block voice processing
    log.warn({ error, sessionId }, 'Failed to record user message to thread');
  }
}

/**
 * Record an agent message to the thread.
 * Call this when agent response is generated.
 */
export async function recordAgentMessage(options: RecordMessageOptions): Promise<void> {
  const { userId, sessionId, personaId, content, toolCalls } = options;

  if (!content || content.trim().length === 0) {
    return; // Skip empty messages
  }

  try {
    // Get thread ID for this session
    let threadId = options.threadId || sessionThreads.get(sessionId);

    // If no thread yet, create one
    if (!threadId) {
      const init = await initializeThreadRecording(userId, sessionId, personaId);
      threadId = init.threadId;
    }

    if (!threadId) {
      log.debug({ sessionId }, 'No thread ID, skipping agent message recording');
      return;
    }

    // Add message to thread
    await addMessage(threadId, {
      role: 'agent',
      agentId: personaId,
      channel: 'voice',
      direction: 'outbound',
      content: content.trim(),
      timestamp: new Date(),
      metadata: {
        toolCalls,
      },
    });

    log.debug(
      { sessionId, threadId, personaId, contentLength: content.length },
      '📝 Agent message recorded to thread'
    );
  } catch (error) {
    // Non-fatal - don't block voice processing
    log.warn({ error, sessionId }, 'Failed to record agent message to thread');
  }
}

/**
 * Update emotional context for the thread.
 * Call this when emotion detection updates.
 */
export async function recordEmotionalContext(
  sessionId: string,
  emotion: string,
  trajectory: 'improving' | 'stable' | 'declining'
): Promise<void> {
  try {
    const threadId = sessionThreads.get(sessionId);
    if (!threadId) return;

    await updateEmotionalContext(threadId, emotion, trajectory);
  } catch (error) {
    log.debug({ error, sessionId }, 'Failed to update thread emotional context');
  }
}

/**
 * Get the thread ID for a session.
 */
export function getSessionThreadId(sessionId: string): string | undefined {
  return sessionThreads.get(sessionId);
}

/**
 * Cleanup thread recording for a session.
 * Call this at session end.
 */
export function cleanupThreadRecording(sessionId: string): void {
  sessionThreads.delete(sessionId);
  log.debug({ sessionId }, '🧵 Thread recording cleanup');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const threadRecorder = {
  initialize: initializeThreadRecording,
  recordUser: recordUserMessage,
  recordAgent: recordAgentMessage,
  recordEmotion: recordEmotionalContext,
  getThreadId: getSessionThreadId,
  cleanup: cleanupThreadRecording,
};

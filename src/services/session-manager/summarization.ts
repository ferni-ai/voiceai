/**
 * Session Summarization Module
 *
 * Handles conversation summarization and indexing at session end.
 * Includes LLM-based summarization with extraction fallback.
 *
 * @module session-manager/summarization
 */

import { getLogger } from '../../utils/safe-logger.js';
import { withTimeout } from './utils.js';
import { SUMMARIZE_TIMEOUT_MS } from './constants.js';
import {
  indexConversationSummary,
  summarizeConversation,
  type ConversationTurn,
} from '../../memory/index.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export type ConversationSummary = Awaited<ReturnType<typeof summarizeConversation>>;

// ============================================================================
// SUMMARIZATION
// ============================================================================

/**
 * Generate conversation summary using LLM or extraction fallback.
 *
 * Attempts LLM-based summarization first, falling back to
 * extraction-based summarization if LLM fails or times out.
 *
 * @param sessionId - Session identifier
 * @param turns - Conversation turns to summarize
 * @returns Summary object or null if all methods fail
 */
export async function generateSummary(
  sessionId: string,
  turns: ConversationTurn[]
): Promise<ConversationSummary | null> {
  log.info({ sessionId, turnCount: turns.length }, '📝 Starting conversation summarization');

  // Try LLM summarization first
  try {
    const { createSummarizationLLMCaller } = await import('../llm-utils.js');
    const { summarizeWithLLM } = await import('../../memory/index.js');
    const llmCaller = createSummarizationLLMCaller();

    const summary = await withTimeout(
      summarizeWithLLM(sessionId, turns, llmCaller),
      SUMMARIZE_TIMEOUT_MS,
      'summarizeWithLLM',
      sessionId
    );

    if (summary) {
      log.info(
        { sessionId, keyPoints: summary.keyPoints?.length || 0 },
        '✅ LLM summarization succeeded'
      );
      return summary;
    }
  } catch (llmError) {
    log.warn(
      { sessionId, error: String(llmError) },
      '⚠️ LLM summarization failed, trying extraction fallback'
    );
  }

  // Fall back to extraction-based summarization
  try {
    const summary = await withTimeout(
      summarizeConversation(sessionId, turns),
      SUMMARIZE_TIMEOUT_MS,
      'summarizeConversation',
      sessionId
    );

    if (summary) {
      log.info(
        { sessionId, keyPoints: summary.keyPoints?.length || 0 },
        '✅ Extraction summarization succeeded'
      );
      return summary;
    }
  } catch (extractError) {
    log.warn({ sessionId, error: String(extractError) }, '⚠️ Extraction summarization also failed');
  }

  log.warn(
    { sessionId, turnCount: turns.length },
    '❌ All summarization methods failed - will use fallback'
  );
  return null;
}

/**
 * Index conversation summary for semantic retrieval.
 *
 * Creates searchable embeddings from the summary for future
 * context-aware recall.
 *
 * @param userId - User identifier
 * @param summary - Conversation summary to index
 */
export async function indexSummaryForRetrieval(
  userId: string,
  summary: NonNullable<ConversationSummary>
): Promise<void> {
  try {
    const summaryText = [...summary.mainTopics, ...summary.keyPoints, summary.emotionalArc].join(
      ' '
    );

    await indexConversationSummary(userId, {
      id: summary.id,
      text: summaryText,
      topics: summary.mainTopics,
      timestamp: summary.timestamp,
      embedding: summary.embedding,
    });

    log.info('Indexed conversation for future retrieval');
  } catch (indexError) {
    log.warn(`Failed to index conversation (non-blocking): ${indexError}`);
  }
}

/**
 * Create a fallback summary from user turns when LLM summarization fails.
 *
 * @param turns - Conversation turns
 * @returns Simple text summary or null
 */
export function createFallbackSummary(turns: ConversationTurn[]): string | null {
  const userTurns = turns.filter((t) => t.role === 'user');
  if (userTurns.length === 0) return null;

  const topics = userTurns.slice(-3).map((t) => t.content.slice(0, 50).replace(/[.!?]+$/, ''));
  return `Discussed: ${topics.join('; ')}`;
}

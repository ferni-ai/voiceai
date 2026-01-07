/**
 * Session Cleanup
 *
 * Memory leak prevention by clearing session-scoped state.
 *
 * @module context-builders/core/cleanup
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { clearSessionCache } from './cache.js';

const log = createLogger({ module: 'context-cleanup' });

/**
 * Clear all session-scoped state from context builders.
 * Call this when a session ends to prevent memory leaks.
 */
export async function cleanupContextBuilderSession(sessionId: string): Promise<void> {
  // Clear the context output cache for this session
  clearSessionCache(sessionId);

  // Clear deep understanding session state
  try {
    const { clearDeepUnderstandingSession } = await import('../intelligence/deep-understanding.js');
    clearDeepUnderstandingSession(sessionId);
  } catch {
    /* module not loaded */
  }

  // Clear conversational superpowers session state
  try {
    const { clearSuperpowersSession } = await import('../superhuman/conversational-superpowers.js');
    clearSuperpowersSession(sessionId);
  } catch {
    /* module not loaded */
  }

  // Clear superhuman insights session state
  try {
    const { clearSuperhumanInsightsSession } = await import('../superhuman/superhuman-insights.js');
    clearSuperhumanInsightsSession(sessionId);
  } catch {
    /* module not loaded */
  }

  log.debug({ sessionId }, '🧹 Context builder session state cleared');
}

/**
 * Clear ALL session state from context builders (for shutdown).
 */
export async function cleanupAllContextBuilderSessions(): Promise<void> {
  // Note: We import clearContextOutputCache from parent to avoid circular deps
  // This function is called from index.ts which has access to all modules

  // Clear all deep understanding sessions
  try {
    const { clearAllDeepUnderstandingSessions } = await import('../intelligence/deep-understanding.js');
    clearAllDeepUnderstandingSessions();
  } catch {
    /* module not loaded */
  }

  // Clear all conversational superpowers sessions
  try {
    const { clearAllSuperpowersSessions } = await import('../superhuman/conversational-superpowers.js');
    clearAllSuperpowersSessions();
  } catch {
    /* module not loaded */
  }

  // Clear all superhuman insights sessions
  try {
    const { clearAllSuperhumanInsightsSessions } =
      await import('../superhuman/superhuman-insights.js');
    clearAllSuperhumanInsightsSessions();
  } catch {
    /* module not loaded */
  }

  log.info('🧹 All context builder session state cleared');
}

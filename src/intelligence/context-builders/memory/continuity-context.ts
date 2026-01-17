/**
 * Continuity Context Builder
 *
 * Provides "Better than Human" memory continuity by injecting:
 * - Rolling summaries from recent sessions
 * - Active conversation threads
 * - Significant anchor memories
 * - Pending topics to follow up on
 *
 * Uses hybrid retrieval from Firestore (fast) + Spanner (durable).
 *
 * @module intelligence/context-builders/memory/continuity-context
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { BuilderCategory } from '../core/categories.js';
import { createStandardInjection, registerContextBuilder } from '../index.js';
import type { ContextBuilder, ContextBuilderInput, ContextInjection } from '../core/types.js';
import {
  retrieveContinuityBundle,
  formatContinuityForLLM,
  getInjectedMemories,
} from '../../../memory/retrieval/hybrid-continuity-retrieval.js';
import { setInjectedMemories } from '../../../memory/retrieval/injected-memory-store.js';

const log = createLogger({ module: 'context:continuity' });

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build continuity context for LLM injection
 *
 * Retrieves memory continuity from hybrid storage (Firestore + Spanner)
 * and formats it for injection into the system prompt.
 */
async function buildContinuityContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { userText, services } = input;
  const injections: ContextInjection[] = [];

  const userId = services?.userId;
  if (!userId) {
    return [];
  }

  try {
    // Retrieve continuity bundle with current context for relevance scoring
    const bundle = await retrieveContinuityBundle(userId, {
      currentContext: userText,
      maxThreads: 5,
      maxAnchors: 5,
      minAnchorSignificance: 0.5,
      includeSemanticSearch: false, // Skip semantic for now, handled by other builders
    });

    // Skip if no meaningful continuity data
    const hasData =
      bundle.rollingSummary ||
      bundle.activeThreads.length > 0 ||
      bundle.topAnchors.length > 0 ||
      bundle.pendingTopics.length > 0;

    if (!hasData) {
      log.debug({ userId }, 'No continuity data available');
      return [];
    }

    // Format for LLM injection
    const formattedContext = formatContinuityForLLM(bundle);
    if (!formattedContext) {
      return [];
    }

    // Create standard injection
    injections.push(
      createStandardInjection('memory_continuity', formattedContext, {
        category: 'memory',
        confidence: 0.9,
      })
    );

    // Store injected memories for attribution tracking
    const sessionId = services?.sessionId;
    if (sessionId) {
      const injectedMemories = getInjectedMemories(bundle);
      if (injectedMemories.length > 0) {
        setInjectedMemories(sessionId, injectedMemories);
      }
    }

    log.debug(
      {
        userId,
        threads: bundle.activeThreads.length,
        anchors: bundle.topAnchors.length,
        pendingTopics: bundle.pendingTopics.length,
        retrievalTimeMs: bundle.metadata.retrievalTimeMs,
      },
      '🔗 Injected continuity context'
    );
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to build continuity context');
  }

  return injections;
}

// ============================================================================
// REGISTRATION
// ============================================================================

/**
 * Continuity Context Builder
 *
 * Provides long-term memory continuity from Firestore + Spanner.
 * High priority to ensure continuity is available early in context.
 */
export const continuityContextBuilder: ContextBuilder = {
  name: 'memory-continuity',
  description: 'Long-term memory continuity from recent sessions, threads, and anchors',
  priority: 80, // High priority - core to "Better than Human" experience
  category: BuilderCategory.MEMORY,
  build: buildContinuityContext,
};

// Register the builder
registerContextBuilder(continuityContextBuilder);

export { buildContinuityContext };

/**
 * Unified Knowledge Context Builder
 *
 * "Your best friend forgets. We don't."
 *
 * Uses the new buildUnifiedUserKnowledge() to inject comprehensive
 * user knowledge into every conversation. This is the foundation
 * of "Better Than Human" - total recall across all memory sources.
 *
 * @module intelligence/context-builders/memory/unified-knowledge-context
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { ContextBuilderInput, ContextInjection } from '../core/types.js';
import { registerContextBuilder } from '../core/registry.js';
import { BuilderCategory } from '../core/categories.js';

const log = createLogger({ module: 'unified-knowledge-context' });

// ============================================================================
// CACHE
// ============================================================================

interface CacheEntry {
  injection: string;
  timestamp: number;
}

const knowledgeCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes - fresher than most caches

function getCached(userId: string): string | null {
  const entry = knowledgeCache.get(userId);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
    return entry.injection;
  }
  return null;
}

function setCache(userId: string, injection: string): void {
  knowledgeCache.set(userId, { injection, timestamp: Date.now() });

  // Cleanup old entries periodically
  if (knowledgeCache.size > 100) {
    const now = Date.now();
    for (const [key, val] of knowledgeCache.entries()) {
      if (now - val.timestamp > CACHE_TTL_MS) {
        knowledgeCache.delete(key);
      }
    }
  }
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

async function buildUnifiedKnowledgeContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  // Extract userId and turnCount from the input structure
  const userId = input.services?.userId;
  const turnCount = input.userData?.turnCount ?? 0;

  if (!userId) {
    log.debug('No userId available, skipping unified knowledge');
    return [];
  }

  // Only inject on first few turns or periodically
  // Knowledge context is expensive and doesn't change mid-conversation
  if (turnCount > 3 && turnCount % 10 !== 0) {
    return [];
  }

  // Check cache
  const cached = getCached(userId);
  if (cached) {
    log.debug({ userId, cached: true }, 'Using cached unified knowledge');
    return [
      {
        id: `unified-knowledge-${userId}-${Date.now()}`,
        content: cached,
        priority: 'high',
        source: 'unified_knowledge',
      },
    ];
  }

  try {
    // Lazy import to avoid circular dependencies
    const { getUnifiedKnowledgeInjection } = await import(
      '../../../services/superhuman/unified-user-knowledge.js'
    );

    const result = await getUnifiedKnowledgeInjection(userId);

    if (!result || !result.content) {
      return [];
    }

    const injectionContent = result.content;

    // Cache it
    setCache(userId, injectionContent);

    log.debug({ userId, length: injectionContent.length }, 'Built unified knowledge context');

    return [
      {
        id: `unified-knowledge-${userId}-${Date.now()}`,
        content: injectionContent,
        priority: 'high',
        source: 'unified_knowledge',
      },
    ];
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to build unified knowledge context');
    return [];
  }
}

// ============================================================================
// REGISTRATION
// ============================================================================

registerContextBuilder({
  name: 'unified-knowledge',
  description: 'Comprehensive user knowledge from all memory sources (Better Than Human Memory)',
  category: BuilderCategory.MEMORY,
  priority: 85, // High priority - foundational context
  build: buildUnifiedKnowledgeContext,
});

export { buildUnifiedKnowledgeContext };

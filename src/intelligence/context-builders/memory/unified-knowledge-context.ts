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
import type { ContextBuilderInput, ContextInjection } from '../types.js';
import { registerContextBuilder } from '../registry.js';

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
  const { userId, turnCount } = input;

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

    const injection = await getUnifiedKnowledgeInjection(userId, {
      maxPeople: 8, // Keep context reasonable
      maxTopics: 8,
      maxMoments: 3,
    });

    if (!injection) {
      return [];
    }

    // Cache it
    setCache(userId, injection);

    log.debug({ userId, length: injection.length }, 'Built unified knowledge context');

    return [
      {
        content: injection,
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
  id: 'unified-knowledge',
  name: 'Unified Knowledge (Better Than Human Memory)',
  description: 'Comprehensive user knowledge from all memory sources',
  category: 'memory',
  priority: 85, // High priority - foundational context
  enabled: true,

  // Run for all personas - everyone benefits from knowing the user
  personaFilter: () => true,

  // Session-level context - doesn't need every turn
  triggerCondition: (input) => {
    // First turn: always
    if (input.turnCount <= 1) return true;
    // Early turns: help establish context
    if (input.turnCount <= 3) return true;
    // Periodic refresh
    if (input.turnCount % 10 === 0) return true;
    // Handoff: need fresh context
    if (input.isHandoff) return true;

    return false;
  },

  build: buildUnifiedKnowledgeContext,
});

export { buildUnifiedKnowledgeContext };

/**
 * Relational Memory Context Builder
 *
 * Injects relational memory insights into the LLM context.
 *
 * "Better Than Human" capability: Perfect recall of relationship-building moments.
 * Humans forget inside jokes, rituals, and trust milestones over time.
 * Ferni remembers EVERYTHING that makes the relationship special.
 *
 * Features:
 * - Inside jokes (and when to reference them)
 * - Conversation rituals (greetings, check-ins, farewells)
 * - Communication preferences (learned over time)
 * - Trust milestones (first vulnerability, first laugh together)
 *
 * @module intelligence/context-builders/superhuman/relational-memory-context
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { BuilderCategory } from '../core/categories.js';
import type { ContextBuilder, ContextBuilderInput, ContextInjection } from '../core/types.js';
import { createStandardInjection, registerContextBuilder } from '../index.js';

const log = createLogger({ module: 'context:relational-memory' });

// ============================================================================
// CONFIGURATION
// ============================================================================

// Cache TTL for relational memory (relatively stable)
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Cache to avoid repeated fetches
const memoryCache = new Map<string, { data: string; timestamp: number }>();

// ============================================================================
// BUILDER
// ============================================================================

export const relationalMemoryBuilder: ContextBuilder = {
  name: 'relational-memory',
  description: 'Injects inside jokes, rituals, and trust milestones',
  priority: 40, // After memory, before engagement
  category: BuilderCategory.MEMORY,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { services, userData } = input;
    const userId = services?.userId;

    if (!userId) {
      return [];
    }

    // Only for returning users (we need established relationship)
    const isReturning = userData?.isReturningUser ?? false;
    if (!isReturning) {
      return [];
    }

    try {
      // Check cache first
      const cached = memoryCache.get(userId);
      const now = Date.now();

      if (cached && now - cached.timestamp < CACHE_TTL_MS) {
        if (cached.data && cached.data.length > 50) {
          return [
            createStandardInjection('relational_memory', cached.data, {
              category: 'superhuman',
              confidence: 0.85,
            }),
          ];
        }
        return [];
      }

      // Dynamic import to avoid circular dependencies
      const { getRelationalMemory } = await import(
        '../../../services/superhuman/relational-memory/engine.js'
      );

      // Get the relational memory singleton
      const engine = getRelationalMemory();

      // Build context using the service's built-in formatter
      const context = await engine.buildContextForLLM(userId);

      // Cache the result
      memoryCache.set(userId, { data: context, timestamp: now });

      if (!context || context.length < 50) {
        return [];
      }

      log.debug(
        {
          userId,
          contextLength: context.length,
        },
        '💝 Injecting relational memory context'
      );

      return [
        createStandardInjection('relational_memory', context, {
          category: 'superhuman',
          confidence: 0.85,
        }),
      ];
    } catch (error) {
      log.debug({ error: String(error), userId }, 'Relational memory fetch failed (non-fatal)');
      return [];
    }
  },
};

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clear the memory cache
 */
export function clearRelationalMemoryCache(userId?: string): void {
  if (userId) {
    memoryCache.delete(userId);
  } else {
    memoryCache.clear();
  }
}

// ============================================================================
// REGISTRATION
// ============================================================================

registerContextBuilder(relationalMemoryBuilder);

export default relationalMemoryBuilder;

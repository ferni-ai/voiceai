/**
 * User Corrections Context Builder
 *
 * Injects user correction patterns into the LLM context.
 *
 * "Better Than Human" capability: We NEVER make the same mistake twice.
 * This builder surfaces past corrections so Ferni can avoid repeating errors.
 *
 * Examples:
 * - "User corrected pronunciation of their name"
 * - "User prefers 'they' pronouns for their partner"
 * - "User clarified they're vegetarian, not vegan"
 *
 * @module intelligence/context-builders/superhuman/user-corrections-context
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { BuilderCategory } from '../core/categories.js';
import type { ContextBuilder, ContextBuilderInput, ContextInjection } from '../core/types.js';
import { createHighInjection, registerContextBuilder } from '../index.js';

const log = createLogger({ module: 'context:user-corrections' });

// ============================================================================
// CONFIGURATION
// ============================================================================

// Cache TTL for corrections (should be fresh)
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

// Cache for corrections
const correctionsCache = new Map<string, { data: string; timestamp: number }>();

// ============================================================================
// BUILDER
// ============================================================================

export const userCorrectionsBuilder: ContextBuilder = {
  name: 'user-corrections',
  description: 'Injects past correction patterns to avoid repeating mistakes',
  priority: 25, // High priority - safety-adjacent (avoiding errors)
  category: BuilderCategory.MEMORY,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { services } = input;
    const userId = services?.userId;

    if (!userId) {
      return [];
    }

    try {
      // Check cache first
      const cached = correctionsCache.get(userId);
      const now = Date.now();

      if (cached && now - cached.timestamp < CACHE_TTL_MS) {
        if (cached.data && cached.data.length > 50) {
          return [
            createHighInjection('user_corrections', cached.data),
          ];
        }
        return [];
      }

      // Dynamic import to avoid circular dependencies
      const { buildCorrectionContext } = await import(
        '../../../services/superhuman/user-corrections.js'
      );

      // Get correction context (already formatted for LLM)
      const correctionContext = await buildCorrectionContext(userId);

      // Cache the result
      correctionsCache.set(userId, { data: correctionContext, timestamp: now });

      if (!correctionContext || correctionContext.length < 50) {
        return [];
      }

      log.debug(
        {
          userId,
          contextLength: correctionContext.length,
        },
        '✅ Injecting user corrections context'
      );

      return [
        createHighInjection('user_corrections', correctionContext),
      ];
    } catch (error) {
      log.debug({ error: String(error), userId }, 'User corrections fetch failed (non-fatal)');
      return [];
    }
  },
};

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clear the corrections cache
 */
export function clearCorrectionsCache(userId?: string): void {
  if (userId) {
    correctionsCache.delete(userId);
  } else {
    correctionsCache.clear();
  }
}

// ============================================================================
// REGISTRATION
// ============================================================================

registerContextBuilder(userCorrectionsBuilder);

export default userCorrectionsBuilder;

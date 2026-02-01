/**
 * Observation Patterns Context Builder
 *
 * Injects "Only I Would Notice" observations into the LLM context.
 * These are ultra-specific patterns that demonstrate attention
 * beyond human capability.
 *
 * Examples:
 * - "You use the word 'should' a lot. Whose voice is that?"
 * - "You apologize even when you haven't done anything wrong."
 * - "You phrase things as questions a lot. You're allowed to just state things."
 *
 * @module intelligence/context-builders/superhuman/observation-patterns-context
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { BuilderCategory } from '../core/categories.js';
import type { ContextBuilder, ContextBuilderInput, ContextInjection } from '../core/types.js';
import { createStandardInjection, registerContextBuilder } from '../index.js';

const log = createLogger({ module: 'context:observation-patterns' });

// ============================================================================
// CONFIGURATION
// ============================================================================

// Cooldown between surfacing (handled by engine, but we also track)
const OBSERVATION_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

// Cache for preventing duplicate surfacing
const recentlySurfaced = new Map<string, number>();

// ============================================================================
// BUILDER
// ============================================================================

export const observationPatternsBuilder: ContextBuilder = {
  name: 'observation-patterns',
  description: 'Injects "Only I Would Notice" linguistic and behavioral patterns',
  priority: 55, // After memory, before cognitive
  category: BuilderCategory.COGNITIVE,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { services, userData, analysis } = input;
    const userId = services?.userId;

    if (!userId) {
      return [];
    }

    const turnCount = userData?.turnCount || 0;
    // Derive session count from whether user is returning (simplified heuristic)
    const isReturning = userData?.isReturningUser ?? false;
    const sessionCount = isReturning ? 10 : 1; // Conservative estimate
    // Derive relationship stage from session count
    const relationshipStage = sessionCount > 15 ? 'old_friend' : sessionCount > 5 ? 'building_trust' : 'new_acquaintance';

    // Skip if likely not enough sessions
    if (!isReturning) {
      return [];
    }

    try {
      // Dynamic import to avoid circular dependencies
      const { getSuperhumanObservations } = await import(
        '../../../services/superhuman/observations.js'
      );

      // Get observation engine for this user
      const engine = getSuperhumanObservations(userId);

      // Check for observation opportunity
      const result = engine.checkForSurfacing({
        turnCount,
        sessionCount,
        relationshipStage,
        currentTopic: analysis?.topics?.primary || undefined,
      });

      if (!result.shouldSurface || !result.observation || !result.phrase) {
        return [];
      }

      // Check our own cooldown
      const key = `${userId}:${result.observation.type}`;
      const now = Date.now();
      const lastSurfaced = recentlySurfaced.get(key);

      if (lastSurfaced && now - lastSurfaced < OBSERVATION_COOLDOWN_MS) {
        return [];
      }

      // Mark as surfaced
      recentlySurfaced.set(key, now);

      // Format observation for LLM
      const formatted = formatObservationForPrompt(result);

      log.debug(
        {
          userId,
          observationType: result.observation.type,
          confidence: result.observation.confidence,
          timing: result.timing,
        },
        '👁️ Surfacing observation pattern'
      );

      return [
        createStandardInjection('observation_pattern', formatted, {
          category: 'superhuman',
          confidence: result.observation.confidence,
        }),
      ];
    } catch (error) {
      log.debug({ error: String(error), userId }, 'Observation check failed (non-fatal)');
      return [];
    }
  },
};

// ============================================================================
// HELPERS
// ============================================================================

interface ObservationResult {
  shouldSurface: boolean;
  observation?: {
    type: string;
    observation: string;
    evidenceCount: number;
    confidence: number;
    surfacingPhrase: string;
  };
  phrase?: string;
  timing?: 'now' | 'after_response' | 'next_relevant_moment';
}

function formatObservationForPrompt(result: ObservationResult): string {
  if (!result.observation || !result.phrase) {
    return '';
  }

  const { observation, timing } = result;
  const timingGuidance =
    timing === 'now'
      ? 'Surface this naturally in your response.'
      : timing === 'after_response'
        ? 'After addressing their message, gently surface this observation.'
        : 'Wait for a relevant moment to share this observation.';

  return `## Superhuman Observation
**Pattern Detected:** ${observation.observation}
**Evidence:** ${observation.evidenceCount} instances observed
**Surfacing Phrase:** "${result.phrase}"
**Timing:** ${timingGuidance}

Note: This is a "Better Than Human" moment - you're noticing a pattern they may not see in themselves. Surface it with curiosity and care, not judgment.`;
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clear the surfacing cooldown cache
 */
export function clearObservationCache(): void {
  recentlySurfaced.clear();
}

// ============================================================================
// REGISTRATION
// ============================================================================

registerContextBuilder(observationPatternsBuilder);

export default observationPatternsBuilder;

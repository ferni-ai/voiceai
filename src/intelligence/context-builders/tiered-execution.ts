/**
 * Tiered Context Builder Execution
 *
 * ⚡ CRITICAL PERFORMANCE OPTIMIZATION
 *
 * @deprecated This module is SUPERSEDED by behavioral/orchestrator.ts which provides
 * the same tiered execution with timing budgets, integrated with the turn processor.
 *
 * This file is kept for:
 * 1. Reference documentation of tier configuration
 * 2. TIER_BUDGETS and BUILDER_TIERS constants (can be imported)
 * 3. Historical context
 *
 * For actual tiered execution, see:
 * - turn-processor.ts: Uses parallel Promise.all with withTimeout()
 * - behavioral/orchestrator.ts: Orchestrates context building with budgets
 *
 * Tiers:
 * - CRITICAL (0-50ms): Safety, identity, emotion - MUST run, blocks until complete
 * - IMPORTANT (50-150ms): Memory, coaching, behavioral - Should run, aggressive timeout
 * - ENHANCEMENT (150-250ms): Superhuman, trust, topics - Best effort, drop if slow
 * - OPTIONAL (fire-and-forget): Analytics, learning - Non-blocking, no wait
 *
 * Total budget: 250ms max for ALL context building
 *
 * @module intelligence/context-builders/tiered-execution
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { ContextBuilder, ContextBuilderInput, ContextInjection } from './core/types.js';
import { BuilderCategory } from './core/categories.js';

/**
 * Get registered builders from the builder registry
 * Note: This module is standalone and not currently integrated into turn-processor.
 * The behavioral/orchestrator.ts provides similar functionality with budget enforcement.
 */
function getRegisteredBuilders(): ContextBuilder[] {
  // Stub - this module is standalone and not currently used
  // The actual builders are loaded via behavioral/integration.ts
  return [];
}

const log = createLogger({ module: 'TieredContextExecution' });

// ============================================================================
// TIER CONFIGURATION
// ============================================================================

/**
 * Timing budgets for each tier (milliseconds)
 */
export const TIER_BUDGETS = {
  CRITICAL: 50, // Safety/identity - MUST complete
  IMPORTANT: 100, // Memory/coaching - Should complete
  ENHANCEMENT: 100, // Superhuman/trust - Best effort
  TOTAL: 250, // Total budget across all tiers
} as const;

/**
 * Builder categorization by tier
 *
 * CRITICAL: Must run, blocks response
 * IMPORTANT: Should run, timeout allowed
 * ENHANCEMENT: Best effort, drop if slow
 * OPTIONAL: Fire-and-forget, never blocks
 */
export const BUILDER_TIERS: Record<string, string[]> = {
  // CRITICAL - Safety and core identity (must complete before response)
  CRITICAL: [
    'crisis',
    'safety',
    'wellbeing-context',
    'persona-identity',
    'emotional',
    'distress-detector',
  ],

  // IMPORTANT - Core functionality (should complete, can timeout)
  IMPORTANT: [
    'memory',
    'proactive-memory',
    'behavioral',
    'coaching-context',
    'personality',
    'human-personality',
    'voice-emotion',
    'human-listening',
  ],

  // ENHANCEMENT - Makes response better (best effort, drop if slow)
  ENHANCEMENT: [
    'superhuman-insights',
    'trust-context',
    'topics',
    'engagement',
    'session-flow',
    'humanizing',
    'celebration',
    'tool-humanization',
    'persona-memory',
    'cognitive',
  ],

  // OPTIONAL - Analytics/learning (fire-and-forget, never blocks)
  OPTIONAL: [
    'analytics',
    'community-learning',
    'wisdom-synthesis',
    'team-huddle',
    'cross-persona',
    'biometrics',
    'world-awareness',
  ],
};

// ============================================================================
// TIER CLASSIFICATION
// ============================================================================

type TierName = 'CRITICAL' | 'IMPORTANT' | 'ENHANCEMENT' | 'OPTIONAL';

/**
 * Classify a builder into a tier based on its name
 */
function classifyBuilder(builder: ContextBuilder): TierName {
  const name = builder.name.toLowerCase();

  for (const [tier, builderNames] of Object.entries(BUILDER_TIERS)) {
    if (builderNames.some((n) => name.includes(n))) {
      return tier as TierName;
    }
  }

  // Default classification by category
  const category = builder.category;
  if (category === BuilderCategory.SAFETY) return 'CRITICAL';
  if (category === BuilderCategory.EMOTIONAL) return 'IMPORTANT';
  if (category === BuilderCategory.MEMORY) return 'IMPORTANT';
  if (category === BuilderCategory.PERSONA) return 'IMPORTANT';
  if (category === BuilderCategory.HUMANIZING) return 'ENHANCEMENT';
  if (category === BuilderCategory.LEARNING) return 'OPTIONAL';

  return 'ENHANCEMENT'; // Default tier
}

// ============================================================================
// TIERED EXECUTION
// ============================================================================

export interface TieredExecutionResult {
  injections: ContextInjection[];
  metrics: {
    totalDurationMs: number;
    tiersCompleted: TierName[];
    tiersDropped: TierName[];
    buildersRun: number;
    buildersDropped: number;
    builderResults: Array<{
      name: string;
      tier: TierName;
      durationMs: number;
      injectionCount: number;
      dropped: boolean;
    }>;
  };
}

/**
 * Execute a single builder with timeout
 */
async function executeBuilderWithTimeout(
  builder: ContextBuilder,
  input: ContextBuilderInput,
  timeoutMs: number
): Promise<{ injections: ContextInjection[]; durationMs: number; timedOut: boolean }> {
  const startTime = Date.now();

  try {
    const result = await Promise.race([
      builder.build(input),
      new Promise<ContextInjection[]>((_, reject) => {
        setTimeout(() => reject(new Error('Timeout')), timeoutMs);
      }),
    ]);

    return {
      injections: result,
      durationMs: Date.now() - startTime,
      timedOut: false,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const isTimeout = error instanceof Error && error.message === 'Timeout';

    if (!isTimeout) {
      log.warn({ builder: builder.name, error: String(error) }, 'Builder execution failed');
    }

    return {
      injections: [],
      durationMs,
      timedOut: isTimeout,
    };
  }
}

/**
 * Execute builders in tiered fashion with timing budgets.
 *
 * This is the main entry point for optimized context building.
 * It ensures fast responses by dropping slow builders instead of blocking.
 *
 * @param input - Context builder input
 * @param turnStartTime - When the turn started (for total budget tracking)
 * @returns Injections and execution metrics
 */
export async function executeTieredBuilders(
  input: ContextBuilderInput,
  turnStartTime?: number
): Promise<TieredExecutionResult> {
  const startTime = Date.now();
  const absoluteStartTime = turnStartTime || startTime;

  // Get all registered builders and classify by tier
  const allBuilders = getRegisteredBuilders();
  const buildersByTier: Record<TierName, ContextBuilder[]> = {
    CRITICAL: [],
    IMPORTANT: [],
    ENHANCEMENT: [],
    OPTIONAL: [],
  };

  for (const builder of allBuilders) {
    const tier = classifyBuilder(builder);
    buildersByTier[tier].push(builder);
  }

  // Result tracking
  const allInjections: ContextInjection[] = [];
  const tiersCompleted: TierName[] = [];
  const tiersDropped: TierName[] = [];
  const builderResults: TieredExecutionResult['metrics']['builderResults'] = [];

  // ====================================================================
  // TIER 1: CRITICAL (must complete)
  // ====================================================================
  const criticalBuilders = buildersByTier.CRITICAL;
  if (criticalBuilders.length > 0) {
    const criticalResults = await Promise.all(
      criticalBuilders.map(async (builder) => {
        const result = await executeBuilderWithTimeout(builder, input, TIER_BUDGETS.CRITICAL);
        return { builder, ...result };
      })
    );

    for (const { builder, injections, durationMs, timedOut } of criticalResults) {
      builderResults.push({
        name: builder.name,
        tier: 'CRITICAL',
        durationMs,
        injectionCount: injections.length,
        dropped: timedOut,
      });

      if (!timedOut) {
        allInjections.push(...injections);
      }
    }

    tiersCompleted.push('CRITICAL');
  }

  // Check remaining budget
  const elapsedAfterCritical = Date.now() - absoluteStartTime;
  const remainingBudget = TIER_BUDGETS.TOTAL - elapsedAfterCritical;

  // ====================================================================
  // TIER 2: IMPORTANT (should complete, with aggressive timeout)
  // ====================================================================
  if (remainingBudget > 50 && buildersByTier.IMPORTANT.length > 0) {
    const importantTimeout = Math.min(TIER_BUDGETS.IMPORTANT, remainingBudget - 50);

    const importantResults = await Promise.all(
      buildersByTier.IMPORTANT.map(async (builder) => {
        const result = await executeBuilderWithTimeout(builder, input, importantTimeout);
        return { builder, ...result };
      })
    );

    let droppedCount = 0;
    for (const { builder, injections, durationMs, timedOut } of importantResults) {
      builderResults.push({
        name: builder.name,
        tier: 'IMPORTANT',
        durationMs,
        injectionCount: injections.length,
        dropped: timedOut,
      });

      if (timedOut) {
        droppedCount++;
        log.debug(
          { builder: builder.name, timeoutMs: importantTimeout },
          'Builder dropped (timeout)'
        );
      } else {
        allInjections.push(...injections);
      }
    }

    if (droppedCount < buildersByTier.IMPORTANT.length) {
      tiersCompleted.push('IMPORTANT');
    } else {
      tiersDropped.push('IMPORTANT');
    }
  } else if (buildersByTier.IMPORTANT.length > 0) {
    tiersDropped.push('IMPORTANT');
    log.debug({ remainingBudget }, 'Skipping IMPORTANT tier (no budget)');
  }

  // ====================================================================
  // TIER 3: ENHANCEMENT (best effort, drop if slow)
  // ====================================================================
  const elapsedAfterImportant = Date.now() - absoluteStartTime;
  const enhancementBudget = TIER_BUDGETS.TOTAL - elapsedAfterImportant;

  if (enhancementBudget > 30 && buildersByTier.ENHANCEMENT.length > 0) {
    const enhancementTimeout = Math.min(TIER_BUDGETS.ENHANCEMENT, enhancementBudget);

    // Only run first few enhancement builders if budget is tight
    const enhancementBuilders =
      enhancementBudget < 80
        ? buildersByTier.ENHANCEMENT.slice(0, 3) // Limited budget
        : buildersByTier.ENHANCEMENT;

    const enhancementResults = await Promise.all(
      enhancementBuilders.map(async (builder) => {
        const result = await executeBuilderWithTimeout(builder, input, enhancementTimeout);
        return { builder, ...result };
      })
    );

    let successCount = 0;
    for (const { builder, injections, durationMs, timedOut } of enhancementResults) {
      builderResults.push({
        name: builder.name,
        tier: 'ENHANCEMENT',
        durationMs,
        injectionCount: injections.length,
        dropped: timedOut,
      });

      if (!timedOut) {
        allInjections.push(...injections);
        successCount++;
      }
    }

    if (successCount > 0) {
      tiersCompleted.push('ENHANCEMENT');
    } else {
      tiersDropped.push('ENHANCEMENT');
    }
  } else if (buildersByTier.ENHANCEMENT.length > 0) {
    tiersDropped.push('ENHANCEMENT');
    log.debug({ enhancementBudget }, 'Skipping ENHANCEMENT tier (no budget)');
  }

  // ====================================================================
  // TIER 4: OPTIONAL (fire-and-forget, never blocks)
  // ====================================================================
  if (buildersByTier.OPTIONAL.length > 0) {
    // Fire and forget - don't await
    for (const builder of buildersByTier.OPTIONAL) {
      // Non-blocking execution
      builder
        .build(input)
        .then((injections) => {
          if (injections.length > 0) {
            log.debug(
              { builder: builder.name, injectionCount: injections.length },
              'Optional builder completed (after response)'
            );
          }
        })
        .catch(() => {
          // Silently ignore errors in optional builders
        });

      builderResults.push({
        name: builder.name,
        tier: 'OPTIONAL',
        durationMs: 0,
        injectionCount: 0,
        dropped: false, // Not dropped, just async
      });
    }

    tiersCompleted.push('OPTIONAL');
  }

  const totalDurationMs = Date.now() - startTime;

  // Log if we went over budget
  if (totalDurationMs > TIER_BUDGETS.TOTAL) {
    log.warn(
      {
        totalDurationMs,
        budget: TIER_BUDGETS.TOTAL,
        tiersDropped,
        buildersDropped: builderResults.filter((b) => b.dropped).length,
      },
      '⚠️ Context building exceeded budget'
    );
  }

  return {
    injections: allInjections,
    metrics: {
      totalDurationMs,
      tiersCompleted,
      tiersDropped,
      buildersRun: builderResults.filter((b) => !b.dropped).length,
      buildersDropped: builderResults.filter((b) => b.dropped).length,
      builderResults,
    },
  };
}

// ============================================================================
// FAST PATH FOR SIMPLE TURNS
// ============================================================================

/**
 * Fast path for simple conversational turns that don't need full context.
 *
 * Only runs CRITICAL builders. Use for:
 * - Short responses ("yes", "no", "okay")
 * - Follow-up questions
 * - Acknowledgments
 *
 * @param input - Context builder input
 * @returns Minimal injections for fast response
 */
export async function executeFastPathBuilders(
  input: ContextBuilderInput
): Promise<TieredExecutionResult> {
  const startTime = Date.now();

  // Only run critical builders
  const allBuilders = getRegisteredBuilders();
  const criticalBuilders = allBuilders.filter((b) => classifyBuilder(b) === 'CRITICAL');

  const allInjections: ContextInjection[] = [];
  const builderResults: TieredExecutionResult['metrics']['builderResults'] = [];

  if (criticalBuilders.length > 0) {
    const results = await Promise.all(
      criticalBuilders.map(async (builder) => {
        const result = await executeBuilderWithTimeout(builder, input, TIER_BUDGETS.CRITICAL);
        return { builder, ...result };
      })
    );

    for (const { builder, injections, durationMs, timedOut } of results) {
      builderResults.push({
        name: builder.name,
        tier: 'CRITICAL',
        durationMs,
        injectionCount: injections.length,
        dropped: timedOut,
      });

      if (!timedOut) {
        allInjections.push(...injections);
      }
    }
  }

  return {
    injections: allInjections,
    metrics: {
      totalDurationMs: Date.now() - startTime,
      tiersCompleted: ['CRITICAL'],
      tiersDropped: ['IMPORTANT', 'ENHANCEMENT', 'OPTIONAL'],
      buildersRun: builderResults.filter((b) => !b.dropped).length,
      buildersDropped: builderResults.filter((b) => b.dropped).length,
      builderResults,
    },
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  executeTieredBuilders,
  executeFastPathBuilders,
  TIER_BUDGETS,
  BUILDER_TIERS,
};

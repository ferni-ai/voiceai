/**
 * Smart Selector - Main Orchestrator for Context Routing
 *
 * Wraps the existing filterInjections() with ML-informed selection.
 * Supports gradual rollout via A/B testing with auto-rollback.
 *
 * Selection algorithm:
 * 1. Detect conversation mode
 * 2. Score all injections
 * 3. Allocate slots by mode
 * 4. Select top-scoring injections per slot
 * 5. Validate against priority fallback (hybrid mode)
 *
 * @module context-routing/smart-selector
 */

import type {
  ConversationMode,
  ContextInjection,
  PredictiveScore,
  SelectionDecision,
  RejectionInfo,
  SmartSelectorOptions,
  UserBuilderPreferences,
  SlotAllocation,
  SelectionAlgorithm,
  RoutingVariant,
  BuilderEffectiveness,
} from './types.js';
import { DEFAULT_SLOT_COUNT, FAST_MODE_SLOT_COUNT } from './types.js';
import { SlotAllocator, createSlotAllocator, ESSENTIAL_CATEGORIES } from './slot-allocator.js';
import { CacheManager, createCacheManager } from './cache-manager.js';
import { PredictiveScorer, createPredictiveScorer } from './predictive-scorer.js';
import {
  filterInjections,
  detectConversationMode,
  type FilterOptions,
} from '../utils/injection-filter.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'SmartSelector' });

// ============================================================================
// EXPERIMENT INTEGRATION
// ============================================================================

/**
 * Experiment ID for smart routing rollout.
 */
export const SMART_ROUTING_EXPERIMENT_ID = 'smart-context-routing-v1';

/**
 * Get routing variant for a user.
 * Returns 'priority' if experiment not found or user not enrolled.
 */
async function getRoutingVariant(userId: string): Promise<RoutingVariant> {
  try {
    // Dynamic import to avoid circular dependency
    const { getExperimentManager, getABTestingManager } =
      await import('../../tools/intelligence/learning/index.js');
    const manager = getExperimentManager();

    const experiment = manager.getExperiment(SMART_ROUTING_EXPERIMENT_ID);
    if (!experiment || experiment.status !== 'running') {
      return 'priority'; // Fallback to priority-based
    }

    // Use A/B testing manager to get variant assignment
    const abManager = getABTestingManager();
    const variant = abManager.getVariant(userId, SMART_ROUTING_EXPERIMENT_ID);

    if (!variant) {
      return 'priority';
    }

    // Validate variant ID is a valid routing variant
    const validVariants: RoutingVariant[] = ['priority', 'hybrid', 'smart'];
    if (validVariants.includes(variant.id as RoutingVariant)) {
      return variant.id as RoutingVariant;
    }

    return 'priority';
  } catch {
    // If experiment system not available, use priority
    return 'priority';
  }
}

// ============================================================================
// SMART SELECTOR CLASS
// ============================================================================

export class SmartSelector {
  private readonly userId: string;
  private readonly sessionId: string;
  private readonly cacheManager: CacheManager;
  private readonly scorer: PredictiveScorer;

  constructor(userId: string, sessionId: string) {
    this.userId = userId;
    this.sessionId = sessionId;
    this.cacheManager = createCacheManager(sessionId, userId);
    this.scorer = createPredictiveScorer(userId, sessionId, this.cacheManager);
  }

  /**
   * Select injections using smart routing.
   */
  async selectInjections(
    injections: ContextInjection[],
    options: SmartSelectorOptions
  ): Promise<SelectionDecision> {
    const startTime = Date.now();

    // Determine conversation mode
    const mode =
      options.forceMode ??
      detectConversationMode(options.userText, options.emotionalIntensity, options.crisisDetected);

    // Get routing variant for this user
    const variant =
      options.useSmartSelection === false ? 'priority' : await getRoutingVariant(this.userId);

    // Route to appropriate algorithm
    let decision: SelectionDecision;

    switch (variant) {
      case 'smart':
        decision = this.selectWithSmartRouting(injections, mode, options);
        break;
      case 'hybrid':
        decision = this.selectWithHybridRouting(injections, mode, options);
        break;
      case 'priority':
      default:
        decision = this.selectWithPriorityFallback(injections, mode, options);
        break;
    }

    decision.processingTimeMs = Date.now() - startTime;

    log.debug(
      {
        mode,
        variant,
        selectedCount: decision.selected.length,
        rejectedCount: decision.rejected.length,
        confidence: decision.confidence,
        processingTimeMs: decision.processingTimeMs,
      },
      'Selection complete'
    );

    return decision;
  }

  /**
   * Select using full ML-informed routing.
   */
  private selectWithSmartRouting(
    injections: ContextInjection[],
    mode: ConversationMode,
    options: SmartSelectorOptions
  ): SelectionDecision {
    const userPreferences = this.cacheManager.getUserPreferences();
    const maxInjections = options.maxInjections ?? DEFAULT_SLOT_COUNT;
    const isFastMode = maxInjections <= FAST_MODE_SLOT_COUNT;

    // Create slot allocator for this mode
    const allocator = createSlotAllocator(mode, isFastMode);

    // Score all injections
    const scored = injections.map((injection) => ({
      injection,
      score: this.scorer.scoreBuilder(injection.category, mode, userPreferences),
    }));

    // Sort by score (highest first)
    scored.sort((a, b) => b.score.score - a.score.score);

    const selected: ContextInjection[] = [];
    const rejected: RejectionInfo[] = [];

    // First pass: allocate essential categories (they bypass scoring)
    for (const { injection, score } of scored) {
      if (ESSENTIAL_CATEGORIES.has(injection.category)) {
        if (allocator.allocate(injection)) {
          selected.push(injection);
        }
      }
    }

    // Second pass: allocate by score within slot limits
    for (const { injection, score } of scored) {
      // Skip already selected (essential)
      if (selected.includes(injection)) continue;

      // Check if we have room
      if (selected.length >= maxInjections) {
        rejected.push({
          injection,
          reason: 'Max injections reached',
          score,
        });
        continue;
      }

      // Try to allocate
      if (allocator.canAllocate(injection)) {
        allocator.allocate(injection);
        selected.push(injection);
      } else {
        rejected.push({
          injection,
          reason: `No ${allocator.getSlotType(injection.category)} slots available`,
          score,
        });
      }
    }

    // Compute overall confidence
    const avgConfidence =
      selected.length > 0
        ? selected.reduce((sum, inj) => {
            const s = scored.find((x) => x.injection === inj);
            return sum + (s?.score.confidence ?? 0);
          }, 0) / selected.length
        : 0;

    return {
      selected,
      rejected,
      slotUsage: allocator.getUsage(),
      confidence: avgConfidence,
      algorithm: 'smart',
      mode,
      processingTimeMs: 0, // Set by caller
    };
  }

  /**
   * Select using hybrid routing (ML + priority validation).
   */
  private selectWithHybridRouting(
    injections: ContextInjection[],
    mode: ConversationMode,
    options: SmartSelectorOptions
  ): SelectionDecision {
    // Get smart selection
    const smartDecision = this.selectWithSmartRouting(injections, mode, options);

    // Get priority-based selection for validation
    const priorityDecision = this.selectWithPriorityFallback(injections, mode, options);

    // Validate: ensure essential injections from priority are included
    const priorityEssentials = priorityDecision.selected.filter((inj) =>
      ESSENTIAL_CATEGORIES.has(inj.category)
    );

    // Check if smart selection missed any essentials
    const missedEssentials = priorityEssentials.filter(
      (essential) => !smartDecision.selected.some((s) => s.category === essential.category)
    );

    if (missedEssentials.length > 0) {
      log.warn(
        { missedCount: missedEssentials.length },
        'Smart selection missed essential injections, adding from priority'
      );

      // Add missed essentials
      for (const essential of missedEssentials) {
        smartDecision.selected.push(essential);
        // Remove from rejected if present
        const rejectedIdx = smartDecision.rejected.findIndex(
          (r) => r.injection.category === essential.category
        );
        if (rejectedIdx >= 0) {
          smartDecision.rejected.splice(rejectedIdx, 1);
        }
      }
    }

    // Reduce confidence if we had to fix things
    if (missedEssentials.length > 0) {
      smartDecision.confidence *= 0.8;
    }

    smartDecision.algorithm = 'hybrid';
    return smartDecision;
  }

  /**
   * Select using priority-based fallback (wraps existing filterInjections).
   */
  private selectWithPriorityFallback(
    injections: ContextInjection[],
    mode: ConversationMode,
    options: SmartSelectorOptions
  ): SelectionDecision {
    const filterOptions: FilterOptions = {
      mode,
      userText: options.userText,
      emotionalIntensity: options.emotionalIntensity,
      crisisDetected: options.crisisDetected,
      maxInjections: options.maxInjections,
      maxChars: options.maxChars,
    };

    const selected = filterInjections(injections, filterOptions);

    // Build rejected list
    const rejected: RejectionInfo[] = injections
      .filter((inj) => !selected.includes(inj))
      .map((injection) => ({
        injection,
        reason: 'Not selected by priority filter',
        score: {
          builderId: injection.category,
          score: injection.priority,
          confidence: 1,
          factors: {
            roiScore: injection.priority,
            modeRelevance: 50,
            recencyBoost: 0,
            userAffinity: 50,
          },
          source: 'fallback' as const,
        },
      }));

    // Estimate slot usage from priority selection
    const allocator = createSlotAllocator(mode);
    for (const inj of selected) {
      allocator.allocate(inj);
    }

    return {
      selected,
      rejected,
      slotUsage: allocator.getUsage(),
      confidence: 1, // Priority is deterministic
      algorithm: 'priority',
      mode,
      processingTimeMs: 0,
    };
  }

  // --------------------------------------------------------------------------
  // CACHE MANAGEMENT
  // --------------------------------------------------------------------------

  /**
   * Warm caches for this session.
   */
  async warmCache(
    loadUserData?: () => Promise<{
      scores: Map<string, PredictiveScore>;
      preferences: UserBuilderPreferences | null;
    }>,
    loadGlobalData?: () => Promise<Map<string, BuilderEffectiveness>>
  ): Promise<void> {
    await this.cacheManager.warmCache(loadUserData, loadGlobalData);
  }

  /**
   * Clear session resources (call on session end).
   */
  cleanup(): void {
    this.cacheManager.clearSession();
    this.scorer.clearRecency();
    log.debug({ sessionId: this.sessionId }, 'Cleaned up selector');
  }

  // --------------------------------------------------------------------------
  // FEEDBACK INTEGRATION
  // --------------------------------------------------------------------------

  /**
   * Record that an injection was used successfully.
   * Boosts its recency score.
   */
  recordSuccess(builderId: string): void {
    this.scorer.recordSuccess(builderId);
  }

  // --------------------------------------------------------------------------
  // STATS
  // --------------------------------------------------------------------------

  /**
   * Get selector statistics.
   */
  getStats(): {
    cacheStats: ReturnType<CacheManager['getStats']>;
    scorerStats: ReturnType<PredictiveScorer['getStats']>;
  } {
    return {
      cacheStats: this.cacheManager.getStats(),
      scorerStats: this.scorer.getStats(),
    };
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a smart selector for a session.
 */
export function createSmartSelector(userId: string, sessionId: string): SmartSelector {
  return new SmartSelector(userId, sessionId);
}

// ============================================================================
// CONVENIENCE FUNCTION
// ============================================================================

/**
 * Select injections in a single call (creates temporary selector).
 * For one-off selections without session management.
 */
export async function selectInjections(
  injections: ContextInjection[],
  options: SmartSelectorOptions
): Promise<SelectionDecision> {
  const selector = createSmartSelector(options.userId, options.sessionId);
  try {
    return await selector.selectInjections(injections, options);
  } finally {
    selector.cleanup();
  }
}

// ============================================================================
// EXPERIMENT SETUP
// ============================================================================

/**
 * Create the smart routing experiment (run once at startup).
 */
export async function setupSmartRoutingExperiment(): Promise<void> {
  try {
    const { getExperimentManager } = await import('../../tools/intelligence/learning/index.js');
    const manager = getExperimentManager();

    // Check if experiment already exists
    if (manager.getExperiment(SMART_ROUTING_EXPERIMENT_ID)) {
      return;
    }

    manager.createExperiment({
      id: SMART_ROUTING_EXPERIMENT_ID,
      name: 'Smart Context Routing Phase 2',
      type: 'rollout',
      variants: [
        { id: 'priority', name: 'Priority-based (current)', trafficPercent: 100 },
        { id: 'hybrid', name: 'Hybrid (ML + priority validation)', trafficPercent: 0 },
        { id: 'smart', name: 'Full ML selection', trafficPercent: 0 },
      ],
      primaryMetric: 'injection_roi_score',
      secondaryMetrics: ['user_positive_rate', 'context_build_latency_ms'],
      autoEscalate: true,
      autoRollback: true,
      rolloutConfig: {
        stages: [
          { percentage: 2, minDurationMs: 3600000, minSamples: 100 },
          { percentage: 10, minDurationMs: 7200000, minSamples: 500 },
          { percentage: 25, minDurationMs: 14400000, minSamples: 2000 },
          { percentage: 50, minDurationMs: 28800000, minSamples: 5000 },
          { percentage: 100, minDurationMs: 0, minSamples: 0 },
        ],
      },
    });

    log.info({ experimentId: SMART_ROUTING_EXPERIMENT_ID }, 'Created smart routing experiment');
  } catch (error) {
    log.warn({ error: String(error) }, 'Could not setup smart routing experiment');
  }
}

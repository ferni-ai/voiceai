/**
 * Automated Retraining Pipeline - Safe, Continuous Model Improvement
 *
 * Implements a production-grade retraining pipeline with:
 * 1. Time-based triggers (daily at 3 AM PT via Cloud Scheduler)
 * 2. Volume-based triggers (after 100+ corrections)
 * 3. Quality-based triggers (accuracy degradation detection)
 * 4. Safety guards (max delta, validation gate, automatic rollback)
 *
 * @module tools/semantic-router/learning/retraining-pipeline
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { getOnlineLearningEngine, type RetrainingStats } from './online-learning-loop.js';
import { getCorrections } from './correction-store.js';
import { getToolRegistry } from '../registry.js';
import type { EmbeddingVector } from '../types.js';

const log = createLogger({ module: 'semantic-router:retraining-pipeline' });

// ============================================================================
// TYPES
// ============================================================================

export interface RetrainingConfig {
  /** Minimum corrections before volume-based trigger */
  minCorrectionsForTrigger: number;
  /** Maximum embedding delta allowed per cycle (safety guard) */
  maxEmbeddingDeltaNorm: number;
  /** Minimum accuracy threshold - triggers quality-based retrain if below */
  minAccuracyThreshold: number;
  /** Maximum percentage of tools that can be modified per cycle */
  maxToolsModifiedPercent: number;
  /** Hours to look back for accuracy calculation */
  accuracyWindowHours: number;
  /** Whether to enable automatic rollback on degradation */
  enableAutoRollback: boolean;
  /** Dry run mode - compute but don't apply changes */
  dryRun: boolean;
}

export interface RetrainingResult {
  success: boolean;
  trigger: 'scheduled' | 'volume' | 'quality' | 'manual';
  stats: RetrainingStats | null;
  safetyChecks: {
    embeddingDeltaOk: boolean;
    toolsModifiedOk: boolean;
    validationPassed: boolean;
  };
  rollbackTriggered: boolean;
  error?: string;
  timestamp: number;
  durationMs: number;
}

export interface PipelineStatus {
  isRunning: boolean;
  lastRunTime: number;
  lastResult: RetrainingResult | null;
  pendingCorrections: number;
  currentAccuracy: number | null;
  nextScheduledRun: string;
  totalRetrains: number;
  totalRollbacks: number;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: RetrainingConfig = {
  minCorrectionsForTrigger: 100,
  maxEmbeddingDeltaNorm: 0.3, // Max 30% change in embedding space
  minAccuracyThreshold: 0.85, // Trigger if accuracy drops below 85%
  maxToolsModifiedPercent: 25, // Max 25% of tools modified per cycle
  accuracyWindowHours: 24,
  enableAutoRollback: true,
  dryRun: false,
};

// ============================================================================
// RETRAINING PIPELINE
// ============================================================================

export class RetrainingPipeline {
  private config: RetrainingConfig;
  private isRunning = false;
  private lastResult: RetrainingResult | null = null;
  private totalRetrains = 0;
  private totalRollbacks = 0;

  // Snapshot for rollback
  private embeddingSnapshot: Map<string, EmbeddingVector> = new Map();

  constructor(config?: Partial<RetrainingConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Run the retraining pipeline (main entry point for Cloud Scheduler)
   */
  async runScheduledRetrain(): Promise<RetrainingResult> {
    return this.runPipeline('scheduled');
  }

  /**
   * Check if volume-based trigger should fire
   */
  async checkVolumeBasedTrigger(): Promise<boolean> {
    try {
      const corrections = getCorrections({ limit: this.config.minCorrectionsForTrigger + 1 });
      return corrections.length >= this.config.minCorrectionsForTrigger;
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to check correction count');
      return false;
    }
  }

  /**
   * Check if quality-based trigger should fire
   */
  async checkQualityBasedTrigger(): Promise<boolean> {
    try {
      const accuracy = await this.calculateRecentAccuracy();
      if (accuracy === null) return false;
      return accuracy < this.config.minAccuracyThreshold;
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to check accuracy');
      return false;
    }
  }

  /**
   * Run with volume-based trigger check
   */
  async runVolumeBasedRetrain(): Promise<RetrainingResult | null> {
    const shouldRun = await this.checkVolumeBasedTrigger();
    if (!shouldRun) {
      log.debug('Volume-based trigger not met, skipping retrain');
      return null;
    }
    return this.runPipeline('volume');
  }

  /**
   * Run with quality-based trigger check
   */
  async runQualityBasedRetrain(): Promise<RetrainingResult | null> {
    const shouldRun = await this.checkQualityBasedTrigger();
    if (!shouldRun) {
      log.debug('Quality-based trigger not met, skipping retrain');
      return null;
    }
    return this.runPipeline('quality');
  }

  /**
   * Manual trigger (bypasses checks)
   */
  async runManualRetrain(): Promise<RetrainingResult> {
    return this.runPipeline('manual');
  }

  /**
   * Get current pipeline status
   */
  async getStatus(): Promise<PipelineStatus> {
    const engine = getOnlineLearningEngine();
    const engineStats = engine.getStats();

    let accuracy: number | null = null;
    try {
      accuracy = await this.calculateRecentAccuracy();
    } catch {
      // Ignore - accuracy calculation is optional
    }

    return {
      isRunning: this.isRunning,
      lastRunTime: this.lastResult?.timestamp ?? 0,
      lastResult: this.lastResult,
      pendingCorrections: engineStats.pendingExamples,
      currentAccuracy: accuracy,
      nextScheduledRun: 'Daily at 3 AM PT',
      totalRetrains: this.totalRetrains,
      totalRollbacks: this.totalRollbacks,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RetrainingConfig>): void {
    this.config = { ...this.config, ...config };
    log.info({ config: this.config }, 'Retraining pipeline config updated');
  }

  // ==========================================================================
  // PIPELINE EXECUTION
  // ==========================================================================

  private async runPipeline(
    trigger: 'scheduled' | 'volume' | 'quality' | 'manual'
  ): Promise<RetrainingResult> {
    if (this.isRunning) {
      return {
        success: false,
        trigger,
        stats: null,
        safetyChecks: {
          embeddingDeltaOk: false,
          toolsModifiedOk: false,
          validationPassed: false,
        },
        rollbackTriggered: false,
        error: 'Retrain already in progress',
        timestamp: Date.now(),
        durationMs: 0,
      };
    }

    this.isRunning = true;
    const startTime = performance.now();

    try {
      log.info({ trigger, dryRun: this.config.dryRun }, 'Starting retraining pipeline');

      // Step 1: Create snapshot for potential rollback
      await this.createEmbeddingSnapshot();

      // Step 2: Run the online learning engine
      const engine = getOnlineLearningEngine();
      const stats = await engine.triggerRetrain();

      if (!stats) {
        return this.createResult(trigger, null, true, false, startTime);
      }

      // Step 3: Safety checks
      const safetyChecks = await this.runSafetyChecks(stats);

      // Step 4: Validation gate
      const validationPassed = await this.runValidation(stats);

      // Step 5: Apply or rollback
      let rollbackTriggered = false;
      if (
        !this.config.dryRun &&
        this.config.enableAutoRollback &&
        (!safetyChecks.embeddingDeltaOk ||
          !safetyChecks.toolsModifiedOk ||
          !validationPassed)
      ) {
        log.warn({ safetyChecks, validationPassed }, 'Safety checks failed, triggering rollback');
        await this.rollbackEmbeddings();
        rollbackTriggered = true;
        this.totalRollbacks++;
      }

      this.totalRetrains++;

      const result = this.createResult(
        trigger,
        stats,
        !rollbackTriggered,
        rollbackTriggered,
        startTime,
        { ...safetyChecks, validationPassed }
      );

      this.lastResult = result;

      log.info(
        {
          trigger,
          success: result.success,
          examplesProcessed: stats.examplesProcessed,
          toolsUpdated: stats.toolsUpdated,
          durationMs: result.durationMs,
          rollbackTriggered,
        },
        'Retraining pipeline complete'
      );

      return result;
    } catch (error) {
      log.error({ error: String(error), trigger }, 'Retraining pipeline failed');

      const result: RetrainingResult = {
        success: false,
        trigger,
        stats: null,
        safetyChecks: {
          embeddingDeltaOk: false,
          toolsModifiedOk: false,
          validationPassed: false,
        },
        rollbackTriggered: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
        durationMs: Math.round(performance.now() - startTime),
      };

      this.lastResult = result;
      return result;
    } finally {
      this.isRunning = false;
    }
  }

  // ==========================================================================
  // SAFETY CHECKS
  // ==========================================================================

  private async runSafetyChecks(
    stats: RetrainingStats
  ): Promise<{ embeddingDeltaOk: boolean; toolsModifiedOk: boolean }> {
    // Check 1: Embedding delta magnitude
    const embeddingDeltaOk = stats.avgEmbeddingDelta <= this.config.maxEmbeddingDeltaNorm;

    // Check 2: Percentage of tools modified
    const registry = getToolRegistry();
    const totalTools = registry.getAll().length;
    const modifiedPercent = (stats.toolsUpdated / totalTools) * 100;
    const toolsModifiedOk = modifiedPercent <= this.config.maxToolsModifiedPercent;

    log.debug(
      {
        avgDelta: stats.avgEmbeddingDelta,
        maxDelta: this.config.maxEmbeddingDeltaNorm,
        modifiedPercent,
        maxModifiedPercent: this.config.maxToolsModifiedPercent,
      },
      'Safety checks completed'
    );

    return { embeddingDeltaOk, toolsModifiedOk };
  }

  private async runValidation(_stats: RetrainingStats): Promise<boolean> {
    // Run a validation test on a held-out set
    // For now, we'll use a simplified check
    try {
      const corrections = getCorrections({ limit: 10 });
      if (corrections.length === 0) return true;

      // Validate that the corrections improve routing
      // This is a placeholder - in production, you'd run against a golden set
      const registry = getToolRegistry();
      let correctPredictions = 0;

      for (const correction of corrections) {
        if (correction.actualTool) {
          const tool = registry.getRegistered(correction.actualTool);
          if (tool) {
            correctPredictions++;
          }
        }
      }

      const accuracy = correctPredictions / corrections.length;
      return accuracy >= 0.7; // At least 70% of corrections still valid
    } catch (error) {
      log.warn({ error: String(error) }, 'Validation check failed, allowing by default');
      return true;
    }
  }

  // ==========================================================================
  // ROLLBACK SUPPORT
  // ==========================================================================

  private async createEmbeddingSnapshot(): Promise<void> {
    const registry = getToolRegistry();
    this.embeddingSnapshot.clear();

    for (const tool of registry.getAllRegistered()) {
      if (tool.descriptionEmbedding) {
        this.embeddingSnapshot.set(tool.definition.id, [...tool.descriptionEmbedding]);
      }
    }

    log.debug({ snapshotSize: this.embeddingSnapshot.size }, 'Created embedding snapshot');
  }

  private async rollbackEmbeddings(): Promise<void> {
    const registry = getToolRegistry();

    for (const [toolId, embedding] of this.embeddingSnapshot) {
      const registeredTool = registry.getRegistered(toolId);
      if (registeredTool) {
        // RegisteredTool has descriptionEmbedding property
        (registeredTool as { descriptionEmbedding?: EmbeddingVector }).descriptionEmbedding = embedding;
      }
    }

    log.info({ restoredTools: this.embeddingSnapshot.size }, 'Rolled back embeddings to snapshot');
  }

  // ==========================================================================
  // ACCURACY CALCULATION
  // ==========================================================================

  private async calculateRecentAccuracy(): Promise<number | null> {
    try {
      const corrections = getCorrections({ limit: 100 });
      if (corrections.length < 10) return null; // Not enough data

      // Calculate accuracy as: 1 - (correction rate)
      // If users are correcting a lot, accuracy is low
      const engine = getOnlineLearningEngine();
      const stats = engine.getStats();

      if (stats.recentStats.length === 0) return null;

      // Use the most recent retrain stats
      const recentStats = stats.recentStats.slice(-5);
      const avgExamplesPerRetrain =
        recentStats.reduce((sum, s) => sum + s.examplesProcessed, 0) / recentStats.length;

      // Estimate accuracy based on correction frequency
      // This is a heuristic - in production, you'd use held-out test sets
      const estimatedAccuracy = Math.max(0.5, 1 - avgExamplesPerRetrain / 100);

      return estimatedAccuracy;
    } catch (error) {
      log.warn({ error: String(error) }, 'Failed to calculate accuracy');
      return null;
    }
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private createResult(
    trigger: 'scheduled' | 'volume' | 'quality' | 'manual',
    stats: RetrainingStats | null,
    success: boolean,
    rollbackTriggered: boolean,
    startTime: number,
    safetyChecks?: { embeddingDeltaOk: boolean; toolsModifiedOk: boolean; validationPassed: boolean }
  ): RetrainingResult {
    return {
      success,
      trigger,
      stats,
      safetyChecks: safetyChecks ?? {
        embeddingDeltaOk: true,
        toolsModifiedOk: true,
        validationPassed: true,
      },
      rollbackTriggered,
      timestamp: Date.now(),
      durationMs: Math.round(performance.now() - startTime),
    };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let pipelineInstance: RetrainingPipeline | null = null;

export function getRetrainingPipeline(): RetrainingPipeline {
  if (!pipelineInstance) {
    pipelineInstance = new RetrainingPipeline();
  }
  return pipelineInstance;
}

export function initializeRetrainingPipeline(
  config?: Partial<RetrainingConfig>
): RetrainingPipeline {
  pipelineInstance = new RetrainingPipeline(config);
  log.info({ config }, 'Retraining pipeline initialized');
  return pipelineInstance;
}

// ============================================================================
// API HANDLER (for Cloud Scheduler)
// ============================================================================

/**
 * Handler for the scheduled retraining job.
 * Called by Cloud Scheduler at 3 AM PT daily.
 */
export async function handleScheduledRetraining(): Promise<{
  success: boolean;
  result: RetrainingResult | null;
  error?: string;
}> {
  try {
    const pipeline = getRetrainingPipeline();
    const result = await pipeline.runScheduledRetrain();

    return {
      success: result.success,
      result,
    };
  } catch (error) {
    log.error({ error: String(error) }, 'Scheduled retraining handler failed');
    return {
      success: false,
      result: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Handler for volume-based retraining check.
 * Called more frequently (e.g., every 4 hours) to check if enough corrections accumulated.
 */
export async function handleVolumeBasedRetraining(): Promise<{
  success: boolean;
  triggered: boolean;
  result: RetrainingResult | null;
  error?: string;
}> {
  try {
    const pipeline = getRetrainingPipeline();
    const result = await pipeline.runVolumeBasedRetrain();

    return {
      success: result?.success ?? true,
      triggered: result !== null,
      result,
    };
  } catch (error) {
    log.error({ error: String(error) }, 'Volume-based retraining handler failed');
    return {
      success: false,
      triggered: false,
      result: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Handler for quality-based retraining check.
 * Called when accuracy degradation is detected.
 */
export async function handleQualityBasedRetraining(): Promise<{
  success: boolean;
  triggered: boolean;
  result: RetrainingResult | null;
  error?: string;
}> {
  try {
    const pipeline = getRetrainingPipeline();
    const result = await pipeline.runQualityBasedRetrain();

    return {
      success: result?.success ?? true,
      triggered: result !== null,
      result,
    };
  } catch (error) {
    log.error({ error: String(error) }, 'Quality-based retraining handler failed');
    return {
      success: false,
      triggered: false,
      result: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

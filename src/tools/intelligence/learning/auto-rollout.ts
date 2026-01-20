/**
 * Auto-Escalating Rollout Manager
 *
 * Automatically escalates traffic allocation based on statistical confidence.
 * Stages: 2% → 10% → 25% → 50% → 100%
 *
 * Each stage requires:
 * - Minimum samples
 * - Minimum duration
 * - Statistical confidence
 * - No degradation vs baseline
 *
 * @module tools/intelligence/learning/auto-rollout
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { getABTestingManager, type VariantMetrics } from './ab-testing.js';

const log = createLogger({ module: 'auto-rollout' });

// ============================================================================
// TYPES
// ============================================================================

export interface RolloutStage {
  /** Traffic percentage for this stage */
  percentage: number;
  /** Minimum time to stay at this stage (ms) */
  minDurationMs: number;
  /** Minimum samples required at this stage */
  minSamples: number;
}

export interface AutoRolloutConfig {
  /** Experiment ID to manage */
  experimentId: string;
  /** Rollout stages */
  stages: RolloutStage[];
  /** Minimum confidence to advance (0-1) */
  minConfidence: number;
  /** Check interval in ms */
  checkIntervalMs: number;
  /** Auto-rollback on degradation */
  autoRollback: boolean;
  /** Rollback threshold (relative degradation) */
  rollbackThreshold: number;
  /** Callback when stage changes */
  onStageChange?: (stage: number, percentage: number) => void;
  /** Callback when rollback occurs */
  onRollback?: (reason: string) => void;
}

export interface RolloutStatus {
  /** Current stage index */
  currentStage: number;
  /** Current traffic percentage */
  percentage: number;
  /** Time at current stage (ms) */
  timeAtStageMs: number;
  /** Samples at current stage */
  samplesAtStage: number;
  /** Current confidence level */
  confidence: number;
  /** Whether promotion criteria are met */
  readyToAdvance: boolean;
  /** Reasons blocking advancement */
  blockingReasons: string[];
  /** Whether rollout is paused */
  isPaused: boolean;
  /** Pause reason if paused */
  pauseReason?: string;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

export const DEFAULT_STAGES: RolloutStage[] = [
  { percentage: 2, minDurationMs: 30 * 60 * 1000, minSamples: 50 }, // 30 min
  { percentage: 10, minDurationMs: 60 * 60 * 1000, minSamples: 100 }, // 1 hour
  { percentage: 25, minDurationMs: 2 * 60 * 60 * 1000, minSamples: 250 }, // 2 hours
  { percentage: 50, minDurationMs: 4 * 60 * 60 * 1000, minSamples: 500 }, // 4 hours
  { percentage: 100, minDurationMs: 0, minSamples: 0 }, // Final stage
];

// ============================================================================
// AUTO ROLLOUT MANAGER
// ============================================================================

export class AutoRolloutManager {
  private config: AutoRolloutConfig;
  private currentStage = 0;
  private stageStartTime = Date.now();
  private stageStartSamples = 0;
  private isPaused = false;
  private pauseReason?: string;
  private checkInterval: NodeJS.Timeout | null = null;
  private baselineMetrics: VariantMetrics | null = null;

  constructor(config: Partial<AutoRolloutConfig> & { experimentId: string }) {
    this.config = {
      experimentId: config.experimentId,
      stages: config.stages || DEFAULT_STAGES,
      minConfidence: config.minConfidence ?? 0.95,
      checkIntervalMs: config.checkIntervalMs ?? 60000,
      autoRollback: config.autoRollback ?? true,
      rollbackThreshold: config.rollbackThreshold ?? 0.05,
      onStageChange: config.onStageChange,
      onRollback: config.onRollback,
    };
  }

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  /**
   * Start auto-rollout monitoring
   */
  start(): void {
    if (this.checkInterval) {
      return; // Already running
    }

    log.info(
      {
        experimentId: this.config.experimentId,
        stages: this.config.stages.length,
        checkIntervalMs: this.config.checkIntervalMs,
      },
      '🚀 Auto-rollout started'
    );

    // Initial setup
    this.stageStartTime = Date.now();
    this.captureBaselineMetrics();

    // Start periodic checks
    this.checkInterval = setInterval(() => {
      this.runCheck();
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop auto-rollout monitoring
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    log.info({ experimentId: this.config.experimentId }, '⏹️ Auto-rollout stopped');
  }

  /**
   * Pause rollout (stays at current stage)
   */
  pause(reason: string): void {
    this.isPaused = true;
    this.pauseReason = reason;
    log.warn({ reason }, '⏸️ Auto-rollout paused');
  }

  /**
   * Resume rollout
   */
  resume(): void {
    this.isPaused = false;
    this.pauseReason = undefined;
    log.info('▶️ Auto-rollout resumed');
  }

  // ==========================================================================
  // STAGE MANAGEMENT
  // ==========================================================================

  /**
   * Run a promotion check
   */
  private runCheck(): void {
    if (this.isPaused) {
      return;
    }

    // Check for rollback first
    if (this.config.autoRollback && this.shouldRollback()) {
      this.rollback('Performance degradation detected');
      return;
    }

    // Check if ready to advance
    const status = this.getStatus();
    if (status.readyToAdvance && this.currentStage < this.config.stages.length - 1) {
      this.advanceStage();
    }
  }

  /**
   * Advance to next stage
   */
  private advanceStage(): void {
    const previousStage = this.currentStage;
    this.currentStage++;

    const newPercentage = this.config.stages[this.currentStage].percentage;

    // Update experiment traffic
    this.updateExperimentTraffic(newPercentage);

    // Reset stage tracking
    this.stageStartTime = Date.now();
    this.stageStartSamples = this.getCurrentSampleCount();

    log.info(
      {
        previousStage,
        newStage: this.currentStage,
        percentage: newPercentage,
      },
      '📈 Auto-rollout advanced to next stage'
    );

    // Notify callback
    this.config.onStageChange?.(this.currentStage, newPercentage);
  }

  /**
   * Rollback to previous stage (or stage 0)
   */
  private rollback(reason: string): void {
    const previousStage = this.currentStage;
    this.currentStage = Math.max(0, this.currentStage - 1);

    const newPercentage = this.config.stages[this.currentStage].percentage;

    // Update experiment traffic
    this.updateExperimentTraffic(newPercentage);

    // Pause to prevent immediate re-escalation
    this.pause(`Rolled back: ${reason}`);

    log.error(
      {
        previousStage,
        newStage: this.currentStage,
        percentage: newPercentage,
        reason,
      },
      '🔙 Auto-rollout rolled back'
    );

    // Notify callback
    this.config.onRollback?.(reason);
  }

  // ==========================================================================
  // METRICS & DECISIONS
  // ==========================================================================

  /**
   * Check if we should roll back
   */
  private shouldRollback(): boolean {
    if (!this.baselineMetrics || this.currentStage === 0) {
      return false;
    }

    const abManager = getABTestingManager();
    const results = abManager.calculateResults(this.config.experimentId);

    if (!results) {
      return false;
    }

    // Find treatment metrics
    const treatmentMetrics = Object.values(results.variantMetrics).find(
      (m) => m.variantId !== 'control'
    );

    if (!treatmentMetrics || treatmentMetrics.sampleSize < 20) {
      return false; // Not enough data
    }

    // Check for degradation
    const baselineRate = this.baselineMetrics.conversionRate;
    const treatmentRate = treatmentMetrics.conversionRate;

    if (baselineRate > 0) {
      const degradation = (baselineRate - treatmentRate) / baselineRate;
      return degradation > this.config.rollbackThreshold;
    }

    return false;
  }

  /**
   * Calculate confidence level for current stage
   */
  private calculateConfidence(): number {
    const abManager = getABTestingManager();
    const results = abManager.calculateResults(this.config.experimentId);

    if (!results || !results.pValue) {
      return 0;
    }

    // Convert p-value to confidence
    return 1 - results.pValue;
  }

  /**
   * Capture baseline metrics for comparison
   */
  private captureBaselineMetrics(): void {
    const abManager = getABTestingManager();
    const results = abManager.calculateResults(this.config.experimentId);

    if (results) {
      this.baselineMetrics = results.variantMetrics['control'] || null;
    }
  }

  /**
   * Get current sample count
   */
  private getCurrentSampleCount(): number {
    const abManager = getABTestingManager();
    const results = abManager.calculateResults(this.config.experimentId);

    if (!results) {
      return 0;
    }

    return Object.values(results.variantMetrics).reduce((sum, m) => sum + m.sampleSize, 0);
  }

  /**
   * Update experiment traffic allocation
   */
  private updateExperimentTraffic(treatmentPercent: number): void {
    // This integrates with the existing A/B testing system
    // The ABTestingManager handles the actual traffic split
    const abManager = getABTestingManager();

    // Stop and recreate with new traffic split
    abManager.stopExperiment(this.config.experimentId);

    abManager.createExperiment({
      id: this.config.experimentId,
      name: `Auto-rollout: ${this.config.experimentId}`,
      description: `Stage ${this.currentStage}: ${treatmentPercent}% traffic`,
      variants: [
        {
          id: 'control',
          name: 'Control',
          trafficPercent: 100 - treatmentPercent,
          config: { isControl: true },
          isControl: true,
        },
        {
          id: 'treatment',
          name: 'Treatment',
          trafficPercent: treatmentPercent,
          config: { isControl: false },
          isControl: false,
        },
      ],
      startDate: new Date(),
      endDate: null,
      minSampleSize: this.config.stages[this.currentStage].minSamples,
      primaryMetric: 'success_rate',
      secondaryMetrics: ['latency', 'user_satisfaction'],
    });
  }

  // ==========================================================================
  // STATUS
  // ==========================================================================

  /**
   * Get current rollout status
   */
  getStatus(): RolloutStatus {
    const stage = this.config.stages[this.currentStage];
    const timeAtStage = Date.now() - this.stageStartTime;
    const currentSamples = this.getCurrentSampleCount();
    const samplesAtStage = currentSamples - this.stageStartSamples;
    const confidence = this.calculateConfidence();

    const blockingReasons: string[] = [];

    // Check duration
    const durationMet = timeAtStage >= stage.minDurationMs;
    if (!durationMet) {
      const remaining = Math.ceil((stage.minDurationMs - timeAtStage) / 60000);
      blockingReasons.push(`${remaining} minutes remaining at stage`);
    }

    // Check samples
    const samplesMet = samplesAtStage >= stage.minSamples;
    if (!samplesMet) {
      blockingReasons.push(`${stage.minSamples - samplesAtStage} more samples needed`);
    }

    // Check confidence
    const confidenceMet = confidence >= this.config.minConfidence;
    if (!confidenceMet) {
      blockingReasons.push(
        `Confidence ${(confidence * 100).toFixed(1)}% < ${this.config.minConfidence * 100}%`
      );
    }

    // Final stage check
    const isLastStage = this.currentStage >= this.config.stages.length - 1;
    if (isLastStage) {
      blockingReasons.push('Already at final stage');
    }

    const readyToAdvance =
      durationMet && samplesMet && confidenceMet && !isLastStage && !this.isPaused;

    return {
      currentStage: this.currentStage,
      percentage: stage.percentage,
      timeAtStageMs: timeAtStage,
      samplesAtStage,
      confidence,
      readyToAdvance,
      blockingReasons,
      isPaused: this.isPaused,
      pauseReason: this.pauseReason,
    };
  }

  /**
   * Get config
   */
  getConfig(): AutoRolloutConfig {
    return { ...this.config };
  }

  /**
   * Force advance to next stage (manual override)
   */
  forceAdvance(): boolean {
    if (this.currentStage >= this.config.stages.length - 1) {
      return false;
    }
    this.advanceStage();
    return true;
  }

  /**
   * Force rollback to previous stage (manual override)
   */
  forceRollback(reason: string = 'Manual rollback'): boolean {
    if (this.currentStage === 0) {
      return false;
    }
    this.rollback(reason);
    return true;
  }
}

// ============================================================================
// SINGLETON & FACTORY
// ============================================================================

const rolloutManagers = new Map<string, AutoRolloutManager>();

/**
 * Get or create an auto-rollout manager for an experiment
 */
export function getAutoRolloutManager(
  experimentId: string,
  config?: Partial<AutoRolloutConfig>
): AutoRolloutManager {
  let manager = rolloutManagers.get(experimentId);

  if (!manager) {
    manager = new AutoRolloutManager({ experimentId, ...config });
    rolloutManagers.set(experimentId, manager);
  }

  return manager;
}

/**
 * Remove an auto-rollout manager
 */
export function removeAutoRolloutManager(experimentId: string): void {
  const manager = rolloutManagers.get(experimentId);
  if (manager) {
    manager.stop();
    rolloutManagers.delete(experimentId);
  }
}

/**
 * Get all active auto-rollout managers
 */
export function getAllAutoRolloutManagers(): Map<string, AutoRolloutManager> {
  return new Map(rolloutManagers);
}

/**
 * Reset all managers (for testing)
 */
export function resetAutoRolloutManagers(): void {
  for (const manager of rolloutManagers.values()) {
    manager.stop();
  }
  rolloutManagers.clear();
}

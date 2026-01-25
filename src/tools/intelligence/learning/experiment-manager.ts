/**
 * Autonomous Experiment Manager
 *
 * Central orchestrator for automated A/B testing, bandits, and rollouts.
 * Manages experiment lifecycle, autonomous checks, and promotion decisions.
 *
 * Features:
 * - Create experiments (A/B, bandit, rollout)
 * - Automatic stage escalation
 * - Autonomous promotion/rollback decisions
 * - Unified experiment monitoring
 *
 * @module tools/intelligence/learning/experiment-manager
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { getABTestingManager, type ExperimentResults } from './ab-testing.js';
import {
  getAutoRolloutManager,
  removeAutoRolloutManager,
  type AutoRolloutConfig,
  type RolloutStatus,
} from './auto-rollout.js';
import {
  getMultiArmedBandit,
  removeMultiArmedBandit,
  type BanditConfig,
  type BanditStats,
} from './bandit.js';
import {
  getSequentialTestTracker,
  removeSequentialTestTracker,
  checkSequentialTest,
  type SequentialTestConfig,
  type SequentialTestResult,
} from './sequential-test.js';

const log = createLogger({ module: 'experiment-manager' });

// ============================================================================
// TYPES
// ============================================================================

export type ExperimentType = 'ab' | 'bandit' | 'rollout';

export interface ExperimentConfig {
  /** Unique experiment ID */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description?: string;
  /** Experiment type */
  type: ExperimentType;
  /** Variants configuration */
  variants: Array<{
    id: string;
    name: string;
    trafficPercent?: number; // For A/B
    config?: Record<string, unknown>;
  }>;
  /** Primary metric to optimize */
  primaryMetric: string;
  /** Secondary metrics to track */
  secondaryMetrics?: string[];
  /** Enable auto-escalation for rollouts */
  autoEscalate?: boolean;
  /** Enable auto-promotion when winner is found */
  autoPromote?: boolean;
  /** Enable auto-rollback on degradation */
  autoRollback?: boolean;
  /** Schedule (optional) */
  schedule?: {
    startAt?: Date;
    endAt?: Date;
  };
  /** A/B specific config */
  abConfig?: {
    minSampleSize: number;
  };
  /** Bandit specific config */
  banditConfig?: Partial<BanditConfig>;
  /** Rollout specific config */
  rolloutConfig?: Partial<AutoRolloutConfig>;
  /** Sequential testing config */
  sequentialConfig?: Partial<SequentialTestConfig>;
}

export interface ManagedExperiment {
  /** Config */
  config: ExperimentConfig;
  /** Current status */
  status: 'pending' | 'running' | 'paused' | 'completed' | 'promoted' | 'rolled_back';
  /** When created */
  createdAt: Date;
  /** When started */
  startedAt?: Date;
  /** When completed */
  completedAt?: Date;
  /** Winner (if determined) */
  winner?: string;
  /** Pause reason */
  pauseReason?: string;
}

export interface ExperimentHealth {
  /** Experiment ID */
  experimentId: string;
  /** Overall health */
  status: 'healthy' | 'warning' | 'critical';
  /** Type-specific status */
  typeStatus: {
    ab?: ExperimentResults;
    bandit?: BanditStats;
    rollout?: RolloutStatus;
    sequential?: SequentialTestResult;
  };
  /** Recommendations */
  recommendations: string[];
  /** Last check time */
  lastCheck: Date;
}

export interface PromotionDecision {
  /** Should promote */
  shouldPromote: boolean;
  /** Winner variant (if promoting) */
  winner?: string;
  /** Confidence level */
  confidence: number;
  /** Reason */
  reason: string;
  /** Blocking issues */
  blockingIssues: string[];
}

export interface RollbackDecision {
  /** Should rollback */
  shouldRollback: boolean;
  /** Reason */
  reason: string;
  /** Severity */
  severity: 'low' | 'medium' | 'high';
}

// ============================================================================
// EXPERIMENT MANAGER
// ============================================================================

export class ExperimentManager {
  private experiments = new Map<string, ManagedExperiment>();
  private checkInterval: NodeJS.Timeout | null = null;
  private checkIntervalMs = 60000; // 1 minute

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  /**
   * Start the autonomous check loop
   */
  start(): void {
    if (this.checkInterval) {
      return;
    }

    log.info('🚀 Experiment Manager started');

    this.checkInterval = setInterval(() => {
      this.runAutonomousCheck();
    }, this.checkIntervalMs);
  }

  /**
   * Stop the autonomous check loop
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    log.info('⏹️ Experiment Manager stopped');
  }

  /**
   * Set check interval
   */
  setCheckInterval(ms: number): void {
    this.checkIntervalMs = ms;
    if (this.checkInterval) {
      this.stop();
      this.start();
    }
  }

  // ==========================================================================
  // EXPERIMENT CREATION
  // ==========================================================================

  /**
   * Create a new experiment
   */
  createExperiment(config: ExperimentConfig): ManagedExperiment {
    if (this.experiments.has(config.id)) {
      throw new Error(`Experiment ${config.id} already exists`);
    }

    const experiment: ManagedExperiment = {
      config,
      status: 'pending',
      createdAt: new Date(),
    };

    // Initialize type-specific components
    switch (config.type) {
      case 'ab':
        this.initializeABTest(config);
        break;
      case 'bandit':
        this.initializeBandit(config);
        break;
      case 'rollout':
        this.initializeRollout(config);
        break;
    }

    // Initialize sequential testing if configured
    if (config.sequentialConfig) {
      getSequentialTestTracker(config.id, config.sequentialConfig);
    }

    this.experiments.set(config.id, experiment);

    log.info(
      {
        experimentId: config.id,
        type: config.type,
        variants: config.variants.length,
      },
      '🧪 Experiment created'
    );

    // Auto-start if no schedule
    if (!config.schedule?.startAt) {
      this.startExperiment(config.id);
    }

    return experiment;
  }

  /**
   * Initialize A/B test
   */
  private initializeABTest(config: ExperimentConfig): void {
    const abManager = getABTestingManager();

    // Validate traffic percentages
    const totalTraffic = config.variants.reduce((sum, v) => sum + (v.trafficPercent || 0), 0);
    if (Math.abs(totalTraffic - 100) > 0.01) {
      // Auto-distribute if not specified
      const perVariant = 100 / config.variants.length;
      config.variants.forEach((v) => {
        v.trafficPercent = perVariant;
      });
    }

    abManager.createExperiment({
      id: config.id,
      name: config.name,
      description: config.description || '',
      variants: config.variants.map((v, i) => ({
        id: v.id,
        name: v.name,
        trafficPercent: v.trafficPercent || 100 / config.variants.length,
        config: v.config || {},
        isControl: i === 0, // First variant is control
      })),
      startDate: new Date(),
      endDate: config.schedule?.endAt || null,
      minSampleSize: config.abConfig?.minSampleSize || 100,
      primaryMetric: config.primaryMetric,
      secondaryMetrics: config.secondaryMetrics || [],
    });
  }

  /**
   * Initialize bandit
   */
  private initializeBandit(config: ExperimentConfig): void {
    const bandit = getMultiArmedBandit(config.id, config.banditConfig);

    for (const variant of config.variants) {
      bandit.addVariant(variant.id, variant.name);
    }
  }

  /**
   * Initialize rollout
   */
  private initializeRollout(config: ExperimentConfig): void {
    // Also create underlying A/B test
    this.initializeABTest(config);

    // Create auto-rollout manager
    const rollout = getAutoRolloutManager(config.id, {
      ...config.rolloutConfig,
      onStageChange: (stage, percentage) => {
        log.info({ experimentId: config.id, stage, percentage }, 'Rollout stage changed');
      },
      onRollback: (reason) => {
        log.warn({ experimentId: config.id, reason }, 'Rollout rolled back');
        const exp = this.experiments.get(config.id);
        if (exp) {
          exp.status = 'rolled_back';
        }
      },
    });

    if (config.autoEscalate !== false) {
      rollout.start();
    }
  }

  // ==========================================================================
  // EXPERIMENT CONTROL
  // ==========================================================================

  /**
   * Start an experiment
   */
  startExperiment(id: string): void {
    const experiment = this.experiments.get(id);
    if (!experiment) {
      throw new Error(`Experiment ${id} not found`);
    }

    experiment.status = 'running';
    experiment.startedAt = new Date();

    // Start rollout if applicable
    if (experiment.config.type === 'rollout') {
      const rollout = getAutoRolloutManager(id);
      rollout.start();
    }

    log.info({ experimentId: id }, '▶️ Experiment started');
  }

  /**
   * Pause an experiment
   */
  pauseExperiment(id: string, reason: string): void {
    const experiment = this.experiments.get(id);
    if (!experiment) {
      throw new Error(`Experiment ${id} not found`);
    }

    experiment.status = 'paused';
    experiment.pauseReason = reason;

    // Pause rollout if applicable
    if (experiment.config.type === 'rollout') {
      const rollout = getAutoRolloutManager(id);
      rollout.pause(reason);
    }

    log.info({ experimentId: id, reason }, '⏸️ Experiment paused');
  }

  /**
   * Resume an experiment
   */
  resumeExperiment(id: string): void {
    const experiment = this.experiments.get(id);
    if (!experiment) {
      throw new Error(`Experiment ${id} not found`);
    }

    if (experiment.status !== 'paused') {
      return;
    }

    experiment.status = 'running';
    experiment.pauseReason = undefined;

    // Resume rollout if applicable
    if (experiment.config.type === 'rollout') {
      const rollout = getAutoRolloutManager(id);
      rollout.resume();
    }

    log.info({ experimentId: id }, '▶️ Experiment resumed');
  }

  /**
   * Complete an experiment
   */
  completeExperiment(id: string, winner?: string): void {
    const experiment = this.experiments.get(id);
    if (!experiment) {
      throw new Error(`Experiment ${id} not found`);
    }

    experiment.status = 'completed';
    experiment.completedAt = new Date();
    experiment.winner = winner;

    // Stop rollout if applicable
    if (experiment.config.type === 'rollout') {
      const rollout = getAutoRolloutManager(id);
      rollout.stop();
    }

    log.info({ experimentId: id, winner }, '🏁 Experiment completed');
  }

  /**
   * Delete an experiment
   */
  deleteExperiment(id: string): void {
    const experiment = this.experiments.get(id);
    if (!experiment) {
      return;
    }

    // Cleanup type-specific resources
    if (experiment.config.type === 'rollout') {
      removeAutoRolloutManager(id);
    }
    if (experiment.config.type === 'bandit') {
      removeMultiArmedBandit(id);
    }
    removeSequentialTestTracker(id);

    // Stop A/B test
    const abManager = getABTestingManager();
    abManager.stopExperiment(id);

    this.experiments.delete(id);
    log.info({ experimentId: id }, '🗑️ Experiment deleted');
  }

  // ==========================================================================
  // AUTONOMOUS OPERATIONS
  // ==========================================================================

  /**
   * Run autonomous check for all experiments
   */
  runAutonomousCheck(): void {
    for (const [id, experiment] of this.experiments) {
      if (experiment.status !== 'running') {
        continue;
      }

      try {
        // Check promotion
        if (experiment.config.autoPromote) {
          const promotion = this.checkPromotion(id);
          if (promotion.shouldPromote && promotion.winner) {
            this.promoteWinner(id, promotion.winner);
          }
        }

        // Check rollback
        if (experiment.config.autoRollback) {
          const rollback = this.checkRollback(id);
          if (rollback.shouldRollback) {
            this.executeRollback(id, rollback.reason);
          }
        }

        // Check schedule
        if (experiment.config.schedule?.endAt) {
          if (new Date() >= experiment.config.schedule.endAt) {
            this.completeExperiment(id);
          }
        }
      } catch (error) {
        log.error({ experimentId: id, error: String(error) }, 'Autonomous check failed');
      }
    }
  }

  /**
   * Check if experiment should promote winner
   */
  checkPromotion(id: string): PromotionDecision {
    const experiment = this.experiments.get(id);
    if (!experiment) {
      return {
        shouldPromote: false,
        confidence: 0,
        reason: 'Experiment not found',
        blockingIssues: ['Experiment not found'],
      };
    }

    const blockingIssues: string[] = [];

    // Check based on type
    switch (experiment.config.type) {
      case 'ab': {
        const abManager = getABTestingManager();
        const results = abManager.calculateResults(id);

        if (!results) {
          return {
            shouldPromote: false,
            confidence: 0,
            reason: 'No results available',
            blockingIssues: ['No results available'],
          };
        }

        if (results.recommendation === 'winner_found' && results.winner) {
          return {
            shouldPromote: true,
            winner: results.winner,
            confidence: results.pValue ? 1 - results.pValue : 0.95,
            reason: 'Statistical significance reached',
            blockingIssues: [],
          };
        }

        if (results.recommendation === 'continue') {
          blockingIssues.push('Insufficient data for decision');
        }
        if (results.recommendation === 'no_difference') {
          blockingIssues.push('No significant difference detected');
        }

        return {
          shouldPromote: false,
          confidence: results.pValue ? 1 - results.pValue : 0,
          reason: results.recommendation,
          blockingIssues,
        };
      }

      case 'bandit': {
        const bandit = getMultiArmedBandit(id);
        const stats = bandit.getStats();

        // Promote if best variant has >95% confidence
        if (stats.bestConfidence >= 0.95) {
          return {
            shouldPromote: true,
            winner: stats.estimatedBest,
            confidence: stats.bestConfidence,
            reason: `Best variant ${stats.estimatedBest} has ${(stats.bestConfidence * 100).toFixed(1)}% confidence`,
            blockingIssues: [],
          };
        }

        return {
          shouldPromote: false,
          confidence: stats.bestConfidence,
          reason: 'Confidence not high enough',
          blockingIssues: [`Confidence ${(stats.bestConfidence * 100).toFixed(1)}% < 95%`],
        };
      }

      case 'rollout': {
        const rollout = getAutoRolloutManager(id);
        const status = rollout.getStatus();

        // Promote when at 100% and healthy
        if (status.percentage === 100 && !status.isPaused) {
          return {
            shouldPromote: true,
            winner: 'treatment',
            confidence: status.confidence,
            reason: 'Rollout completed at 100%',
            blockingIssues: [],
          };
        }

        return {
          shouldPromote: false,
          confidence: status.confidence,
          reason: `At ${status.percentage}%, ${status.blockingReasons.join(', ')}`,
          blockingIssues: status.blockingReasons,
        };
      }

      default: {
        // Exhaustiveness check - should never reach here
        const _exhaustive: never = experiment.config.type;
        return {
          shouldPromote: false,
          confidence: 0,
          reason: `Unknown experiment type: ${_exhaustive}`,
          blockingIssues: ['Unknown experiment type'],
        };
      }
    }
  }

  /**
   * Check if experiment should rollback
   */
  checkRollback(id: string): RollbackDecision {
    const experiment = this.experiments.get(id);
    if (!experiment) {
      return { shouldRollback: false, reason: 'Experiment not found', severity: 'low' };
    }

    // Check sequential test for early stopping
    const sequential = getSequentialTestTracker(id);
    const seqResult = sequential.getResult();

    if (seqResult.decision === 'reject') {
      return {
        shouldRollback: true,
        reason: 'Sequential test rejected treatment',
        severity: 'high',
      };
    }

    // Check A/B results for degradation
    const abManager = getABTestingManager();
    const results = abManager.calculateResults(id);

    if (results) {
      const control = results.variantMetrics['control'];
      const treatment = Object.values(results.variantMetrics).find(
        (m) => m.variantId !== 'control'
      );

      if (control && treatment && control.sampleSize > 50 && treatment.sampleSize > 50) {
        const degradation =
          (control.conversionRate - treatment.conversionRate) / control.conversionRate;

        if (degradation > 0.1) {
          return {
            shouldRollback: true,
            reason: `Treatment is ${(degradation * 100).toFixed(1)}% worse than control`,
            severity: 'high',
          };
        }

        if (degradation > 0.05) {
          return {
            shouldRollback: false,
            reason: `Warning: Treatment is ${(degradation * 100).toFixed(1)}% worse`,
            severity: 'medium',
          };
        }
      }
    }

    return { shouldRollback: false, reason: 'No issues detected', severity: 'low' };
  }

  /**
   * Promote winner and complete experiment
   */
  private promoteWinner(id: string, winner: string): void {
    const experiment = this.experiments.get(id);
    if (!experiment) return;

    experiment.status = 'promoted';
    experiment.winner = winner;
    experiment.completedAt = new Date();

    log.info({ experimentId: id, winner }, '🏆 Winner promoted');
  }

  /**
   * Execute rollback
   */
  private executeRollback(id: string, reason: string): void {
    const experiment = this.experiments.get(id);
    if (!experiment) return;

    experiment.status = 'rolled_back';
    experiment.pauseReason = reason;

    // If rollout, use its rollback mechanism
    if (experiment.config.type === 'rollout') {
      const rollout = getAutoRolloutManager(id);
      rollout.forceRollback(reason);
    }

    log.warn({ experimentId: id, reason }, '🔙 Experiment rolled back');
  }

  // ==========================================================================
  // OBSERVABILITY
  // ==========================================================================

  /**
   * Get experiment health
   */
  getExperimentHealth(id: string): ExperimentHealth {
    const experiment = this.experiments.get(id);
    if (!experiment) {
      throw new Error(`Experiment ${id} not found`);
    }

    const health: ExperimentHealth = {
      experimentId: id,
      status: 'healthy',
      typeStatus: {},
      recommendations: [],
      lastCheck: new Date(),
    };

    // Get type-specific status
    switch (experiment.config.type) {
      case 'ab': {
        const abManager = getABTestingManager();
        const results = abManager.calculateResults(id);
        if (results) {
          health.typeStatus.ab = results;
        }
        break;
      }
      case 'bandit': {
        const bandit = getMultiArmedBandit(id);
        health.typeStatus.bandit = bandit.getStats();
        break;
      }
      case 'rollout': {
        const rollout = getAutoRolloutManager(id);
        health.typeStatus.rollout = rollout.getStatus();
        if (health.typeStatus.rollout.isPaused) {
          health.status = 'critical';
        }
        break;
      }
    }

    // Add sequential test status
    try {
      const abManager = getABTestingManager();
      const results = abManager.calculateResults(id);
      if (results) {
        const control = results.variantMetrics['control'];
        const treatment = Object.values(results.variantMetrics).find(
          (m) => m.variantId !== 'control'
        );
        if (control && treatment) {
          health.typeStatus.sequential = checkSequentialTest(control, treatment);
        }
      }
    } catch {
      // Sequential test not configured
    }

    // Generate recommendations
    const promotion = this.checkPromotion(id);
    const rollback = this.checkRollback(id);

    if (promotion.shouldPromote) {
      health.recommendations.push(`Ready to promote ${promotion.winner}`);
    } else {
      health.recommendations.push(...promotion.blockingIssues);
    }

    if (rollback.shouldRollback) {
      health.status = 'critical';
      health.recommendations.push(`⚠️ Rollback recommended: ${rollback.reason}`);
    } else if (rollback.severity === 'medium') {
      health.status = 'warning';
      health.recommendations.push(`Warning: ${rollback.reason}`);
    }

    return health;
  }

  /**
   * Get all experiments
   */
  getAllExperiments(): ManagedExperiment[] {
    return Array.from(this.experiments.values());
  }

  /**
   * Get experiment by ID
   */
  getExperiment(id: string): ManagedExperiment | undefined {
    return this.experiments.get(id);
  }

  /**
   * Get experiment summary
   */
  getSummary(): {
    total: number;
    running: number;
    paused: number;
    completed: number;
    byType: Record<ExperimentType, number>;
  } {
    const experiments = Array.from(this.experiments.values());

    return {
      total: experiments.length,
      running: experiments.filter((e) => e.status === 'running').length,
      paused: experiments.filter((e) => e.status === 'paused').length,
      completed: experiments.filter((e) =>
        ['completed', 'promoted', 'rolled_back'].includes(e.status)
      ).length,
      byType: {
        ab: experiments.filter((e) => e.config.type === 'ab').length,
        bandit: experiments.filter((e) => e.config.type === 'bandit').length,
        rollout: experiments.filter((e) => e.config.type === 'rollout').length,
      },
    };
  }

  /**
   * Clear all experiments (for testing)
   */
  clear(): void {
    for (const id of this.experiments.keys()) {
      this.deleteExperiment(id);
    }
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let managerInstance: ExperimentManager | null = null;

/**
 * Get the singleton ExperimentManager instance
 */
export function getExperimentManager(): ExperimentManager {
  if (!managerInstance) {
    managerInstance = new ExperimentManager();
  }
  return managerInstance;
}

/**
 * Reset the manager (for testing)
 */
export function resetExperimentManager(): void {
  if (managerInstance) {
    managerInstance.stop();
    managerInstance.clear();
  }
  managerInstance = null;
}

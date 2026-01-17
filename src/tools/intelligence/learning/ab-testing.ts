/**
 * A/B Testing Framework
 *
 * Manages experiments for tool selection strategies.
 * Supports traffic allocation, variant tracking, and statistical analysis.
 *
 * @module tools/intelligence/learning/ab-testing
 */

import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'ftis:ab-testing' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Experiment variant
 */
export interface Variant {
  /** Variant ID */
  id: string;
  /** Display name */
  name: string;
  /** Traffic allocation (0-100) */
  trafficPercent: number;
  /** Variant configuration */
  config: Record<string, unknown>;
  /** Is this the control group */
  isControl: boolean;
}

/**
 * Experiment definition
 */
export interface Experiment {
  /** Unique experiment ID */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Variants */
  variants: Variant[];
  /** Start date */
  startDate: Date;
  /** End date (null = ongoing) */
  endDate: Date | null;
  /** Is experiment active */
  isActive: boolean;
  /** User cohort filter (e.g., "new_users") */
  cohort?: string;
  /** Minimum sample size for significance */
  minSampleSize: number;
  /** Primary metric to optimize */
  primaryMetric: string;
  /** Secondary metrics to track */
  secondaryMetrics: string[];
}

/**
 * Metrics for a variant
 */
export interface VariantMetrics {
  /** Variant ID */
  variantId: string;
  /** Number of participants */
  sampleSize: number;
  /** Conversion count (success) */
  conversions: number;
  /** Conversion rate */
  conversionRate: number;
  /** Mean of primary metric */
  primaryMetricMean: number;
  /** Standard deviation */
  primaryMetricStdDev: number;
  /** Secondary metric values */
  secondaryMetrics: Record<string, number>;
}

/**
 * Experiment results
 */
export interface ExperimentResults {
  /** Experiment ID */
  experimentId: string;
  /** Per-variant metrics */
  variantMetrics: Record<string, VariantMetrics>;
  /** Winner (if determined) */
  winner?: string;
  /** Statistical significance (p-value) */
  pValue?: number;
  /** Confidence interval */
  confidenceInterval?: {
    lower: number;
    upper: number;
  };
  /** Recommendation */
  recommendation: 'continue' | 'winner_found' | 'no_difference' | 'insufficient_data';
  /** When results were calculated */
  calculatedAt: Date;
}

/**
 * User assignment to experiment
 */
export interface UserAssignment {
  userId: string;
  experimentId: string;
  variantId: string;
  assignedAt: Date;
}

// ============================================================================
// A/B TESTING MANAGER
// ============================================================================

export class ABTestingManager {
  // Active experiments
  private experiments = new Map<string, Experiment>();

  // User assignments
  private assignments = new Map<string, Map<string, UserAssignment>>();

  // Metrics per variant
  private metrics = new Map<string, Map<string, number[]>>();

  // ==========================================================================
  // EXPERIMENT MANAGEMENT
  // ==========================================================================

  /**
   * Create a new experiment
   */
  createExperiment(experiment: Omit<Experiment, 'isActive'>): void {
    // Validate traffic percentages sum to 100
    const totalTraffic = experiment.variants.reduce((sum, v) => sum + v.trafficPercent, 0);
    if (Math.abs(totalTraffic - 100) > 0.01) {
      throw new Error(`Traffic percentages must sum to 100, got ${totalTraffic}`);
    }

    // Ensure exactly one control
    const controls = experiment.variants.filter((v) => v.isControl);
    if (controls.length !== 1) {
      throw new Error('Exactly one variant must be control');
    }

    this.experiments.set(experiment.id, {
      ...experiment,
      isActive: true,
    });

    // Initialize metrics storage
    this.metrics.set(experiment.id, new Map());
    for (const variant of experiment.variants) {
      this.metrics.get(experiment.id)!.set(variant.id, []);
    }

    log.info(
      { experimentId: experiment.id, variantCount: experiment.variants.length },
      'Experiment created'
    );
  }

  /**
   * Stop an experiment
   */
  stopExperiment(experimentId: string): void {
    const experiment = this.experiments.get(experimentId);
    if (experiment) {
      experiment.isActive = false;
      experiment.endDate = new Date();
      log.info({ experimentId }, 'Experiment stopped');
    }
  }

  /**
   * Get active experiments
   */
  getActiveExperiments(): Experiment[] {
    return Array.from(this.experiments.values()).filter((e) => e.isActive);
  }

  // ==========================================================================
  // USER ASSIGNMENT
  // ==========================================================================

  /**
   * Get or assign user to variant
   */
  getVariant(userId: string, experimentId: string): Variant | null {
    const experiment = this.experiments.get(experimentId);
    if (!experiment || !experiment.isActive) {
      return null;
    }

    // Check existing assignment
    const userAssignments = this.assignments.get(userId);
    if (userAssignments?.has(experimentId)) {
      const assignment = userAssignments.get(experimentId)!;
      return experiment.variants.find((v) => v.id === assignment.variantId) || null;
    }

    // New assignment
    const variant = this.assignVariant(userId, experiment);

    // Store assignment
    if (!this.assignments.has(userId)) {
      this.assignments.set(userId, new Map());
    }
    this.assignments.get(userId)!.set(experimentId, {
      userId,
      experimentId,
      variantId: variant.id,
      assignedAt: new Date(),
    });

    log.debug({ userId, experimentId, variantId: variant.id }, 'User assigned to variant');

    return variant;
  }

  /**
   * Assign user to variant based on traffic percentages
   */
  private assignVariant(userId: string, experiment: Experiment): Variant {
    // Deterministic assignment based on user ID hash
    const hash = this.hashUserId(userId + experiment.id);
    const bucket = hash % 100;

    let cumulative = 0;
    for (const variant of experiment.variants) {
      cumulative += variant.trafficPercent;
      if (bucket < cumulative) {
        return variant;
      }
    }

    // Fallback to control
    return experiment.variants.find((v) => v.isControl) || experiment.variants[0];
  }

  /**
   * Simple hash function for user ID
   */
  private hashUserId(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  // ==========================================================================
  // METRICS
  // ==========================================================================

  /**
   * Record a metric for a variant
   */
  recordMetric(experimentId: string, variantId: string, value: number): void {
    const experimentMetrics = this.metrics.get(experimentId);
    if (!experimentMetrics) return;

    const variantMetrics = experimentMetrics.get(variantId);
    if (!variantMetrics) return;

    variantMetrics.push(value);
  }

  /**
   * Record conversion (success)
   */
  recordConversion(userId: string, experimentId: string, success: boolean): void {
    const assignment = this.assignments.get(userId)?.get(experimentId);
    if (!assignment) return;

    this.recordMetric(experimentId, assignment.variantId, success ? 1 : 0);
  }

  // ==========================================================================
  // ANALYSIS
  // ==========================================================================

  /**
   * Calculate experiment results
   */
  calculateResults(experimentId: string): ExperimentResults | null {
    const experiment = this.experiments.get(experimentId);
    const experimentMetrics = this.metrics.get(experimentId);

    if (!experiment || !experimentMetrics) {
      return null;
    }

    const variantMetrics: Record<string, VariantMetrics> = {};

    for (const variant of experiment.variants) {
      const values = experimentMetrics.get(variant.id) || [];
      const conversions = values.filter((v) => v === 1).length;

      variantMetrics[variant.id] = {
        variantId: variant.id,
        sampleSize: values.length,
        conversions,
        conversionRate: values.length > 0 ? conversions / values.length : 0,
        primaryMetricMean: this.mean(values),
        primaryMetricStdDev: this.stdDev(values),
        secondaryMetrics: {},
      };
    }

    // Determine recommendation
    const control = experiment.variants.find((v) => v.isControl)!;
    const treatment = experiment.variants.find((v) => !v.isControl);

    if (!treatment) {
      return {
        experimentId,
        variantMetrics,
        recommendation: 'insufficient_data',
        calculatedAt: new Date(),
      };
    }

    const controlMetrics = variantMetrics[control.id];
    const treatmentMetrics = variantMetrics[treatment.id];

    // Check sample size
    if (
      controlMetrics.sampleSize < experiment.minSampleSize ||
      treatmentMetrics.sampleSize < experiment.minSampleSize
    ) {
      return {
        experimentId,
        variantMetrics,
        recommendation: 'continue',
        calculatedAt: new Date(),
      };
    }

    // Calculate p-value (simplified z-test)
    const pValue = this.calculatePValue(controlMetrics, treatmentMetrics);

    let recommendation: ExperimentResults['recommendation'];
    let winner: string | undefined;

    if (pValue < 0.05) {
      if (treatmentMetrics.conversionRate > controlMetrics.conversionRate) {
        winner = treatment.id;
        recommendation = 'winner_found';
      } else {
        winner = control.id;
        recommendation = 'winner_found';
      }
    } else if (pValue > 0.5) {
      recommendation = 'no_difference';
    } else {
      recommendation = 'continue';
    }

    return {
      experimentId,
      variantMetrics,
      winner,
      pValue,
      recommendation,
      calculatedAt: new Date(),
    };
  }

  /**
   * Calculate p-value using z-test for proportions
   */
  private calculatePValue(control: VariantMetrics, treatment: VariantMetrics): number {
    const n1 = control.sampleSize;
    const n2 = treatment.sampleSize;
    const p1 = control.conversionRate;
    const p2 = treatment.conversionRate;

    if (n1 === 0 || n2 === 0) return 1;

    // Pooled proportion
    const p = (control.conversions + treatment.conversions) / (n1 + n2);

    // Standard error
    const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));

    if (se === 0) return 1;

    // Z-score
    const z = Math.abs(p1 - p2) / se;

    // Convert to p-value (two-tailed)
    return 2 * (1 - this.normalCDF(z));
  }

  /**
   * Normal CDF approximation
   */
  private normalCDF(z: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = z < 0 ? -1 : 1;
    z = Math.abs(z) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * z);
    const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);

    return 0.5 * (1.0 + sign * y);
  }

  /**
   * Calculate mean
   */
  private mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Calculate standard deviation
   */
  private stdDev(values: number[]): number {
    if (values.length < 2) return 0;
    const avg = this.mean(values);
    const squareDiffs = values.map((v) => Math.pow(v - avg, 2));
    return Math.sqrt(this.mean(squareDiffs));
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  /**
   * Clear all data
   */
  clear(): void {
    this.experiments.clear();
    this.assignments.clear();
    this.metrics.clear();
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let managerInstance: ABTestingManager | null = null;

export function getABTestingManager(): ABTestingManager {
  if (!managerInstance) {
    managerInstance = new ABTestingManager();
  }
  return managerInstance;
}

export function resetABTestingManager(): void {
  managerInstance = null;
}

// ============================================================================
// FTIS EXPERIMENT INITIALIZATION
// ============================================================================

/**
 * Create the FTIS v1 rollout experiment.
 * This experiment tests the full FTIS stack (complexity routing, sequence prediction,
 * MCTS planning, transition matrix) against the baseline semantic routing.
 *
 * Call this on app startup to ensure the experiment is active.
 */
export function initializeFTISExperiment(): void {
  const manager = getABTestingManager();

  // Check if experiment already exists
  const existing = manager.getActiveExperiments().find((e) => e.id === 'ftis-v1-rollout');
  if (existing) {
    log.info('FTIS v1 rollout experiment already active');
    return;
  }

  try {
    manager.createExperiment({
      id: 'ftis-v1-rollout',
      name: 'FTIS Full System Rollout',
      description:
        'Tests FTIS (complexity routing, sequence prediction, MCTS) against semantic-only baseline',
      variants: [
        {
          id: 'control',
          name: 'Semantic Only',
          trafficPercent: 50,
          config: { useFTIS: false },
          isControl: true,
        },
        {
          id: 'ftis',
          name: 'FTIS Full Stack',
          trafficPercent: 50,
          config: { useFTIS: true },
          isControl: false,
        },
      ],
      startDate: new Date(),
      endDate: null, // 3 days initially, extended if successful
      minSampleSize: 100,
      primaryMetric: 'tool_accuracy',
      secondaryMetrics: ['latency_ms', 'user_satisfaction', 'tool_sequence_completion'],
    });

    log.info('🧪 FTIS v1 rollout experiment created (50/50 split)');
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to create FTIS experiment');
  }
}

/**
 * Update FTIS experiment traffic allocation.
 * Use this to ramp up or down FTIS traffic during rollout.
 */
export function updateFTISExperimentTraffic(ftisPercent: number): void {
  const manager = getABTestingManager();

  // Stop old experiment
  manager.stopExperiment('ftis-v1-rollout');

  // Create new with updated traffic
  manager.createExperiment({
    id: 'ftis-v1-rollout',
    name: 'FTIS Full System Rollout',
    description: 'Tests FTIS against semantic-only baseline',
    variants: [
      {
        id: 'control',
        name: 'Semantic Only',
        trafficPercent: 100 - ftisPercent,
        config: { useFTIS: false },
        isControl: true,
      },
      {
        id: 'ftis',
        name: 'FTIS Full Stack',
        trafficPercent: ftisPercent,
        config: { useFTIS: true },
        isControl: false,
      },
    ],
    startDate: new Date(),
    endDate: null,
    minSampleSize: 100,
    primaryMetric: 'tool_accuracy',
    secondaryMetrics: ['latency_ms', 'user_satisfaction'],
  });

  log.info({ ftisPercent }, '🧪 FTIS experiment traffic updated');
}

/**
 * Check if a user should use FTIS based on A/B test assignment.
 */
export function shouldUseFTIS(userId: string): boolean {
  const manager = getABTestingManager();
  const variant = manager.getVariant(userId, 'ftis-v1-rollout');

  if (!variant) {
    return false; // No active experiment, use baseline
  }

  return variant.id === 'ftis';
}

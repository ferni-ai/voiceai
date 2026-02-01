/**
 * Sequential Testing (SPRT)
 *
 * Sequential Probability Ratio Test for early stopping.
 * Allows making decisions before reaching fixed sample size
 * while controlling Type I and Type II error rates.
 *
 * Algorithm:
 * 1. Define H0 (null) and H1 (alternative) based on minimum effect
 * 2. At each observation, calculate likelihood ratio
 * 3. Compare to upper (A) and lower (B) boundaries
 *    - LR >= A → Accept H1 (treatment is better)
 *    - LR <= B → Accept H0 (no effect/treatment worse)
 *    - B < LR < A → Continue sampling
 *
 * Boundaries:
 * - A = (1 - beta) / alpha
 * - B = beta / (1 - alpha)
 *
 * Benefits:
 * - Typically 50-60% fewer samples than fixed tests
 * - Controls both Type I and Type II error rates
 * - Mathematical guarantees on error rates
 *
 * @module tools/intelligence/learning/sequential-test
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { VariantMetrics } from './ab-testing.js';

const log = createLogger({ module: 'sequential-test' });

// ============================================================================
// TYPES
// ============================================================================

export interface SequentialTestConfig {
  /** Type I error rate (false positive) - typically 0.05 */
  alpha: number;
  /** Type II error rate (false negative) - typically 0.20 */
  beta: number;
  /** Minimum detectable effect (relative improvement) */
  minEffect: number;
  /** Maximum samples before forced decision */
  maxSamples: number;
  /** Baseline conversion rate (for boundary calculations) */
  baselineRate?: number;
}

export type SequentialDecision = 'continue' | 'accept' | 'reject';

export interface SequentialTestResult {
  /** Decision: continue, accept (treatment wins), reject (no effect) */
  decision: SequentialDecision;
  /** Current likelihood ratio */
  likelihoodRatio: number;
  /** Log likelihood ratio (more stable numerically) */
  logLikelihoodRatio: number;
  /** Upper boundary (accept treatment if LR >= this) */
  upperBoundary: number;
  /** Lower boundary (reject treatment if LR <= this) */
  lowerBoundary: number;
  /** Samples used so far */
  samplesUsed: number;
  /** Estimated samples remaining (if continuing) */
  estimatedRemaining?: number;
  /** Confidence in current decision */
  confidence: number;
}

export interface SPRTState {
  /** Experiment ID */
  experimentId: string;
  /** Config */
  config: SequentialTestConfig;
  /** Running log likelihood ratio */
  logLR: number;
  /** Total observations */
  observations: number;
  /** Control successes */
  controlSuccesses: number;
  /** Control failures */
  controlFailures: number;
  /** Treatment successes */
  treatmentSuccesses: number;
  /** Treatment failures */
  treatmentFailures: number;
  /** Final decision (if made) */
  finalDecision?: SequentialDecision;
  /** When decision was made */
  decisionAt?: Date;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: SequentialTestConfig = {
  alpha: 0.05, // 5% false positive rate
  beta: 0.2, // 20% false negative rate (80% power)
  minEffect: 0.02, // 2% minimum detectable effect
  maxSamples: 10000, // Safety cap
};

// ============================================================================
// SPRT CALCULATOR
// ============================================================================

/**
 * Calculate SPRT boundaries from config.
 */
export function calculateBoundaries(config: SequentialTestConfig): {
  upper: number;
  lower: number;
  logUpper: number;
  logLower: number;
} {
  // Wald's boundaries
  const upper = (1 - config.beta) / config.alpha;
  const lower = config.beta / (1 - config.alpha);

  return {
    upper,
    lower,
    logUpper: Math.log(upper),
    logLower: Math.log(lower),
  };
}

/**
 * Check sequential test status given variant metrics.
 */
export function checkSequentialTest(
  control: VariantMetrics,
  treatment: VariantMetrics,
  config: SequentialTestConfig = DEFAULT_CONFIG
): SequentialTestResult {
  const boundaries = calculateBoundaries(config);
  const totalSamples = control.sampleSize + treatment.sampleSize;

  // Calculate log likelihood ratio for Bernoulli observations
  // H0: p_treatment = p_control
  // H1: p_treatment = p_control * (1 + minEffect)

  const pControl = control.conversionRate;
  // Note: pTreatment is observed but we use pControl-based hypothesis

  // Observed log likelihood ratio
  let logLR = 0;

  if (control.sampleSize > 0 && treatment.sampleSize > 0 && pControl > 0) {
    // For each treatment success
    const pUnderH1 = Math.min(pControl * (1 + config.minEffect), 0.999);
    const pUnderH0 = pControl;

    // Log likelihood contribution from treatment arm
    const treatmentSuccesses = treatment.conversions;
    const treatmentFailures = treatment.sampleSize - treatment.conversions;

    logLR =
      treatmentSuccesses * Math.log(pUnderH1 / pUnderH0) +
      treatmentFailures * Math.log((1 - pUnderH1) / (1 - pUnderH0));
  }

  // Make decision
  let decision: SequentialDecision = 'continue';

  if (logLR >= boundaries.logUpper) {
    decision = 'accept';
  } else if (logLR <= boundaries.logLower) {
    decision = 'reject';
  } else if (totalSamples >= config.maxSamples) {
    // Forced decision at max samples
    decision = logLR > 0 ? 'accept' : 'reject';
  }

  // Estimate remaining samples (Wald approximation)
  let estimatedRemaining: number | undefined;
  if (decision === 'continue' && pControl > 0) {
    const avgInfo =
      Math.pow(Math.log((pControl * (1 + config.minEffect)) / pControl), 2) *
      pControl *
      (1 - pControl);

    if (avgInfo > 0) {
      const expectedSamples = boundaries.logUpper / avgInfo;
      estimatedRemaining = Math.max(0, Math.ceil(expectedSamples - totalSamples));
    }
  }

  // Calculate confidence (probability decision is correct)
  // Based on distance from boundaries
  let confidence = 0.5;
  if (decision === 'accept') {
    confidence = 1 - config.alpha;
  } else if (decision === 'reject') {
    confidence = 1 - config.beta;
  } else {
    // Interpolate based on position between boundaries
    const range = boundaries.logUpper - boundaries.logLower;
    const position = logLR - boundaries.logLower;
    confidence = 0.5 + 0.3 * (position / range - 0.5);
  }

  return {
    decision,
    likelihoodRatio: Math.exp(logLR),
    logLikelihoodRatio: logLR,
    upperBoundary: boundaries.upper,
    lowerBoundary: boundaries.lower,
    samplesUsed: totalSamples,
    estimatedRemaining,
    confidence,
  };
}

// ============================================================================
// SEQUENTIAL TEST TRACKER
// ============================================================================

export class SequentialTestTracker {
  private config: SequentialTestConfig;
  private state: SPRTState;

  constructor(experimentId: string, config: Partial<SequentialTestConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      experimentId,
      config: this.config,
      logLR: 0,
      observations: 0,
      controlSuccesses: 0,
      controlFailures: 0,
      treatmentSuccesses: 0,
      treatmentFailures: 0,
    };
  }

  /**
   * Record a single observation
   */
  recordObservation(variant: 'control' | 'treatment', success: boolean): SequentialTestResult {
    if (this.state.finalDecision) {
      // Already decided, return final state
      return this.getResult();
    }

    this.state.observations++;

    if (variant === 'control') {
      if (success) {
        this.state.controlSuccesses++;
      } else {
        this.state.controlFailures++;
      }
    } else {
      if (success) {
        this.state.treatmentSuccesses++;
      } else {
        this.state.treatmentFailures++;
      }

      // Update log likelihood ratio for treatment observation
      this.updateLogLR(success);
    }

    // Check boundaries
    const result = this.checkBoundaries();

    if (result.decision !== 'continue') {
      this.state.finalDecision = result.decision;
      this.state.decisionAt = new Date();

      log.info(
        {
          experimentId: this.state.experimentId,
          decision: result.decision,
          observations: this.state.observations,
          logLR: this.state.logLR,
        },
        '🎯 Sequential test decision reached'
      );
    }

    return result;
  }

  /**
   * Update log likelihood ratio for a treatment observation
   */
  private updateLogLR(success: boolean): void {
    const controlTotal = this.state.controlSuccesses + this.state.controlFailures;

    if (controlTotal === 0) {
      return; // Need control observations first
    }

    // Estimate baseline rate from control
    const pControl = this.state.controlSuccesses / controlTotal;

    if (pControl <= 0 || pControl >= 1) {
      return;
    }

    // H1 rate (with minimum effect)
    const pH1 = Math.min(pControl * (1 + this.config.minEffect), 0.999);

    // Update log LR
    if (success) {
      this.state.logLR += Math.log(pH1 / pControl);
    } else {
      this.state.logLR += Math.log((1 - pH1) / (1 - pControl));
    }
  }

  /**
   * Check current boundaries
   */
  private checkBoundaries(): SequentialTestResult {
    const boundaries = calculateBoundaries(this.config);

    let decision: SequentialDecision = 'continue';

    if (this.state.logLR >= boundaries.logUpper) {
      decision = 'accept';
    } else if (this.state.logLR <= boundaries.logLower) {
      decision = 'reject';
    } else if (this.state.observations >= this.config.maxSamples) {
      decision = this.state.logLR > 0 ? 'accept' : 'reject';
    }

    // Calculate confidence
    let confidence = 0.5;
    if (decision === 'accept') {
      confidence = 1 - this.config.alpha;
    } else if (decision === 'reject') {
      confidence = 1 - this.config.beta;
    } else {
      const range = boundaries.logUpper - boundaries.logLower;
      const position = this.state.logLR - boundaries.logLower;
      confidence = Math.min(0.8, Math.max(0.2, 0.5 + 0.3 * (position / range - 0.5)));
    }

    return {
      decision,
      likelihoodRatio: Math.exp(this.state.logLR),
      logLikelihoodRatio: this.state.logLR,
      upperBoundary: boundaries.upper,
      lowerBoundary: boundaries.lower,
      samplesUsed: this.state.observations,
      confidence,
    };
  }

  /**
   * Get current result without recording observation
   */
  getResult(): SequentialTestResult {
    return this.checkBoundaries();
  }

  /**
   * Get current state
   */
  getState(): SPRTState {
    return { ...this.state };
  }

  /**
   * Check if test is complete
   */
  isComplete(): boolean {
    return this.state.finalDecision !== undefined;
  }

  /**
   * Get final decision (if complete)
   */
  getFinalDecision(): SequentialDecision | undefined {
    return this.state.finalDecision;
  }

  /**
   * Reset the tracker
   */
  reset(): void {
    this.state = {
      experimentId: this.state.experimentId,
      config: this.config,
      logLR: 0,
      observations: 0,
      controlSuccesses: 0,
      controlFailures: 0,
      treatmentSuccesses: 0,
      treatmentFailures: 0,
    };
  }

  /**
   * Export state for persistence
   */
  exportState(): SPRTState {
    return { ...this.state };
  }

  /**
   * Import state from persistence
   */
  importState(state: SPRTState): void {
    this.state = { ...state };
    this.config = state.config;
  }
}

// ============================================================================
// SINGLETON & FACTORY
// ============================================================================

const trackers = new Map<string, SequentialTestTracker>();

/**
 * Get or create a sequential test tracker for an experiment
 */
export function getSequentialTestTracker(
  experimentId: string,
  config?: Partial<SequentialTestConfig>
): SequentialTestTracker {
  let tracker = trackers.get(experimentId);

  if (!tracker) {
    tracker = new SequentialTestTracker(experimentId, config);
    trackers.set(experimentId, tracker);
  }

  return tracker;
}

/**
 * Remove a tracker
 */
export function removeSequentialTestTracker(experimentId: string): void {
  trackers.delete(experimentId);
}

/**
 * Get all active trackers
 */
export function getAllSequentialTestTrackers(): Map<string, SequentialTestTracker> {
  return new Map(trackers);
}

/**
 * Reset all trackers (for testing)
 */
export function resetAllSequentialTestTrackers(): void {
  trackers.clear();
}

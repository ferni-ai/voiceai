/**
 * Multi-Armed Bandit with Thompson Sampling
 *
 * Dynamic traffic allocation that balances exploration and exploitation.
 * Uses Beta distributions to model variant success rates.
 *
 * Algorithm:
 * 1. For each variant, model success rate as Beta(α, β)
 *    - α = successes + 1 (prior)
 *    - β = failures + 1 (prior)
 * 2. To select a variant, sample from each Beta distribution
 * 3. Choose the variant with highest sampled value
 * 4. Update α/β based on outcome
 *
 * Benefits:
 * - Automatically balances exploration vs exploitation
 * - Converges to optimal variant over time
 * - Handles cold start gracefully (uniform prior)
 *
 * @module tools/intelligence/learning/bandit
 */

import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'bandit' });

// ============================================================================
// TYPES
// ============================================================================

export interface BanditVariant {
  /** Variant identifier */
  id: string;
  /** Display name */
  name: string;
  /** Beta distribution alpha (successes + prior) */
  alpha: number;
  /** Beta distribution beta (failures + prior) */
  beta: number;
  /** Total pulls (assignments) */
  pulls: number;
  /** Total rewards (successes) */
  rewards: number;
  /** Last sampled value (for debugging) */
  lastSample?: number;
}

export interface BanditConfig {
  /** Experiment ID */
  experimentId: string;
  /** Exploration factor (1.0 = pure Thompson, <1 = more exploitation) */
  explorationFactor: number;
  /** Minimum exploration rate (ensures all variants get some traffic) */
  minExploration: number;
  /** Update after N outcomes (batched updates) */
  updateBatchSize: number;
  /** Initial prior (higher = more exploration initially) */
  priorStrength: number;
}

export interface BanditSelection {
  /** Selected variant ID */
  variantId: string;
  /** Sampled value */
  sample: number;
  /** All sampled values (for debugging) */
  allSamples: Record<string, number>;
  /** Selection method used */
  method: 'thompson' | 'exploration' | 'forced';
}

export interface BanditStats {
  /** Experiment ID */
  experimentId: string;
  /** Per-variant statistics */
  variants: Array<{
    id: string;
    name: string;
    pulls: number;
    rewards: number;
    observedRate: number;
    expectedRate: number;
    pullShare: number;
  }>;
  /** Total selections */
  totalPulls: number;
  /** Estimated best variant */
  estimatedBest: string;
  /** Confidence in best */
  bestConfidence: number;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: Omit<BanditConfig, 'experimentId'> = {
  explorationFactor: 1.0,
  minExploration: 0.05,
  updateBatchSize: 50,
  priorStrength: 1,
};

// ============================================================================
// BETA DISTRIBUTION HELPERS
// ============================================================================

/**
 * Sample from Beta distribution using the Inverse Transform method.
 * This is a simple approximation that works well for our use case.
 */
function sampleBeta(alpha: number, beta: number): number {
  // Use Box-Muller for Normal, then transform
  // For computational efficiency, we use the Gamma sampling method

  const gammaAlpha = sampleGamma(alpha);
  const gammaBeta = sampleGamma(beta);

  return gammaAlpha / (gammaAlpha + gammaBeta);
}

/**
 * Sample from Gamma distribution using Marsaglia and Tsang's method.
 */
function sampleGamma(shape: number): number {
  if (shape < 1) {
    // Boost method for shape < 1
    const u = Math.random();
    return sampleGamma(1 + shape) * Math.pow(u, 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let x: number;
    let v: number;

    do {
      x = randomNormal();
      v = 1 + c * x;
    } while (v <= 0);

    v = v * v * v;
    const u = Math.random();

    if (u < 1 - 0.0331 * (x * x) * (x * x)) {
      return d * v;
    }

    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return d * v;
    }
  }
}

/**
 * Box-Muller transform for standard normal.
 */
function randomNormal(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Calculate expected value of Beta distribution.
 */
function betaMean(alpha: number, beta: number): number {
  return alpha / (alpha + beta);
}

/**
 * Calculate probability that variant A is better than B.
 * Uses Monte Carlo sampling.
 */
function probabilityABetterThanB(
  alphaA: number,
  betaA: number,
  alphaB: number,
  betaB: number,
  samples = 10000
): number {
  let countABetter = 0;

  for (let i = 0; i < samples; i++) {
    const sampleA = sampleBeta(alphaA, betaA);
    const sampleB = sampleBeta(alphaB, betaB);
    if (sampleA > sampleB) {
      countABetter++;
    }
  }

  return countABetter / samples;
}

// ============================================================================
// MULTI-ARMED BANDIT
// ============================================================================

export class MultiArmedBandit {
  private config: BanditConfig;
  private variants = new Map<string, BanditVariant>();
  private pendingOutcomes: Array<{ variantId: string; success: boolean }> = [];

  constructor(config: Partial<BanditConfig> & { experimentId: string }) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  // ==========================================================================
  // VARIANT MANAGEMENT
  // ==========================================================================

  /**
   * Add a variant to the bandit
   */
  addVariant(id: string, name: string): void {
    if (this.variants.has(id)) {
      return;
    }

    this.variants.set(id, {
      id,
      name,
      alpha: this.config.priorStrength,
      beta: this.config.priorStrength,
      pulls: 0,
      rewards: 0,
    });

    log.debug({ variantId: id, name }, 'Variant added to bandit');
  }

  /**
   * Remove a variant
   */
  removeVariant(id: string): void {
    this.variants.delete(id);
  }

  /**
   * Get all variants
   */
  getVariants(): BanditVariant[] {
    return Array.from(this.variants.values());
  }

  // ==========================================================================
  // SELECTION
  // ==========================================================================

  /**
   * Select a variant using Thompson Sampling
   */
  select(userId?: string): BanditSelection {
    if (this.variants.size === 0) {
      throw new Error('No variants available');
    }

    const variantList = Array.from(this.variants.values());

    // Ensure minimum exploration
    if (Math.random() < this.config.minExploration) {
      const randomIndex = Math.floor(Math.random() * variantList.length);
      const selected = variantList[randomIndex];
      selected.pulls++;

      return {
        variantId: selected.id,
        sample: 0,
        allSamples: {},
        method: 'exploration',
      };
    }

    // Thompson Sampling
    const samples: Record<string, number> = {};
    let bestVariant: BanditVariant | null = null;
    let bestSample = -Infinity;

    for (const variant of variantList) {
      // Sample from Beta distribution
      let sample = sampleBeta(variant.alpha, variant.beta);

      // Apply exploration factor
      if (this.config.explorationFactor !== 1) {
        const mean = betaMean(variant.alpha, variant.beta);
        sample = mean + this.config.explorationFactor * (sample - mean);
      }

      samples[variant.id] = sample;
      variant.lastSample = sample;

      if (sample > bestSample) {
        bestSample = sample;
        bestVariant = variant;
      }
    }

    if (!bestVariant) {
      bestVariant = variantList[0];
    }

    bestVariant.pulls++;

    log.debug(
      {
        selected: bestVariant.id,
        sample: bestSample,
        userId,
      },
      '🎰 Bandit selection'
    );

    return {
      variantId: bestVariant.id,
      sample: bestSample,
      allSamples: samples,
      method: 'thompson',
    };
  }

  /**
   * Force selection of a specific variant (for testing)
   */
  forceSelect(variantId: string): BanditSelection {
    const variant = this.variants.get(variantId);
    if (!variant) {
      throw new Error(`Variant ${variantId} not found`);
    }

    variant.pulls++;

    return {
      variantId,
      sample: 1,
      allSamples: { [variantId]: 1 },
      method: 'forced',
    };
  }

  // ==========================================================================
  // OUTCOME TRACKING
  // ==========================================================================

  /**
   * Record an outcome for a variant
   */
  recordOutcome(variantId: string, success: boolean): void {
    this.pendingOutcomes.push({ variantId, success });

    // Batch update
    if (this.pendingOutcomes.length >= this.config.updateBatchSize) {
      this.flushOutcomes();
    }
  }

  /**
   * Flush pending outcomes to update distributions
   */
  flushOutcomes(): void {
    for (const outcome of this.pendingOutcomes) {
      const variant = this.variants.get(outcome.variantId);
      if (variant) {
        if (outcome.success) {
          variant.alpha++;
          variant.rewards++;
        } else {
          variant.beta++;
        }
      }
    }

    const flushed = this.pendingOutcomes.length;
    this.pendingOutcomes = [];

    if (flushed > 0) {
      log.debug({ flushedCount: flushed }, 'Bandit outcomes flushed');
    }
  }

  /**
   * Get pending outcome count
   */
  getPendingCount(): number {
    return this.pendingOutcomes.length;
  }

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  /**
   * Get bandit statistics
   */
  getStats(): BanditStats {
    // Ensure outcomes are flushed
    this.flushOutcomes();

    const variantList = Array.from(this.variants.values());
    const totalPulls = variantList.reduce((sum, v) => sum + v.pulls, 0);

    // Find best variant
    let bestVariant: BanditVariant | null = null;
    let bestExpected = -Infinity;

    for (const variant of variantList) {
      const expected = betaMean(variant.alpha, variant.beta);
      if (expected > bestExpected) {
        bestExpected = expected;
        bestVariant = variant;
      }
    }

    // Calculate confidence in best
    let bestConfidence = 1.0;
    if (bestVariant && variantList.length > 1) {
      const others = variantList.filter((v) => v.id !== bestVariant!.id);
      let maxProbOtherBetter = 0;

      for (const other of others) {
        const prob = probabilityABetterThanB(
          other.alpha,
          other.beta,
          bestVariant.alpha,
          bestVariant.beta,
          1000
        );
        maxProbOtherBetter = Math.max(maxProbOtherBetter, prob);
      }

      bestConfidence = 1 - maxProbOtherBetter;
    }

    return {
      experimentId: this.config.experimentId,
      variants: variantList.map((v) => ({
        id: v.id,
        name: v.name,
        pulls: v.pulls,
        rewards: v.rewards,
        observedRate: v.pulls > 0 ? v.rewards / v.pulls : 0,
        expectedRate: betaMean(v.alpha, v.beta),
        pullShare: totalPulls > 0 ? v.pulls / totalPulls : 0,
      })),
      totalPulls,
      estimatedBest: bestVariant?.id || '',
      bestConfidence,
    };
  }

  /**
   * Get probability that a variant is the best
   */
  getProbabilityBest(variantId: string, samples = 5000): number {
    const variant = this.variants.get(variantId);
    if (!variant) {
      return 0;
    }

    const others = Array.from(this.variants.values()).filter((v) => v.id !== variantId);

    if (others.length === 0) {
      return 1;
    }

    let countBest = 0;

    for (let i = 0; i < samples; i++) {
      const sample = sampleBeta(variant.alpha, variant.beta);
      let isBest = true;

      for (const other of others) {
        const otherSample = sampleBeta(other.alpha, other.beta);
        if (otherSample > sample) {
          isBest = false;
          break;
        }
      }

      if (isBest) {
        countBest++;
      }
    }

    return countBest / samples;
  }

  // ==========================================================================
  // PERSISTENCE
  // ==========================================================================

  /**
   * Export state for persistence
   */
  exportState(): {
    experimentId: string;
    config: BanditConfig;
    variants: BanditVariant[];
  } {
    return {
      experimentId: this.config.experimentId,
      config: this.config,
      variants: Array.from(this.variants.values()),
    };
  }

  /**
   * Import state from persistence
   */
  importState(state: { variants: BanditVariant[] }): void {
    for (const variant of state.variants) {
      this.variants.set(variant.id, { ...variant });
    }
  }

  /**
   * Reset all variants (for testing)
   */
  reset(): void {
    for (const variant of this.variants.values()) {
      variant.alpha = this.config.priorStrength;
      variant.beta = this.config.priorStrength;
      variant.pulls = 0;
      variant.rewards = 0;
      variant.lastSample = undefined;
    }
    this.pendingOutcomes = [];
  }
}

// ============================================================================
// SINGLETON & FACTORY
// ============================================================================

const bandits = new Map<string, MultiArmedBandit>();

/**
 * Get or create a multi-armed bandit for an experiment
 */
export function getMultiArmedBandit(
  experimentId: string,
  config?: Partial<BanditConfig>
): MultiArmedBandit {
  let bandit = bandits.get(experimentId);

  if (!bandit) {
    bandit = new MultiArmedBandit({ experimentId, ...config });
    bandits.set(experimentId, bandit);
  }

  return bandit;
}

/**
 * Remove a bandit
 */
export function removeMultiArmedBandit(experimentId: string): void {
  bandits.delete(experimentId);
}

/**
 * Get all active bandits
 */
export function getAllBandits(): Map<string, MultiArmedBandit> {
  return new Map(bandits);
}

/**
 * Reset all bandits (for testing)
 */
export function resetAllBandits(): void {
  bandits.clear();
}

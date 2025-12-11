/**
 * Thompson Sampler - Multi-Armed Bandit
 *
 * Implements Thompson Sampling for intelligent traffic allocation.
 * Instead of 50/50 splits, dynamically allocates more traffic to
 * better-performing variants while maintaining exploration.
 *
 * Better than human: We minimize regret automatically.
 *
 * @module services/experiments/thompson-sampler
 */

import { getFirestore } from 'firebase-admin/firestore';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ThompsonSampler' });

// ============================================================================
// TYPES
// ============================================================================

export interface BanditArm {
  variantId: string;
  successes: number; // Conversions
  failures: number; // Non-conversions (exposures - conversions)
}

export interface BanditConfig {
  experimentId: string;
  enabled: boolean;
  explorationWeight: number; // 0-1, higher = more exploration
  minimumExploration: number; // Minimum % traffic to each variant (0-100)
  warmupSamples: number; // Samples before bandit kicks in
}

export interface BanditMetrics {
  experimentId: string;
  totalRegret: number;
  averageRegret: number;
  estimatedBestArm: string;
  armProbabilities: Record<string, number>;
  explorationRatio: number;
  sampleCount: number;
}

export interface BanditSelection {
  variantId: string;
  probability: number;
  isExploration: boolean;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_BANDIT_CONFIG: Omit<BanditConfig, 'experimentId'> = {
  enabled: true,
  explorationWeight: 0.1,
  minimumExploration: 5, // At least 5% traffic to each variant
  warmupSamples: 100, // Need 100 samples before bandit activates
};

// ============================================================================
// IN-MEMORY CACHE
// ============================================================================

const configCache = new Map<string, BanditConfig>();
const armsCache = new Map<string, BanditArm[]>();

// ============================================================================
// THOMPSON SAMPLING CORE
// ============================================================================

/**
 * Sample from Beta distribution using Gamma distribution
 * Beta(a, b) = Gamma(a, 1) / (Gamma(a, 1) + Gamma(b, 1))
 */
function sampleBeta(alpha: number, beta: number): number {
  const gammaA = gammaSample(alpha);
  const gammaB = gammaSample(beta);
  return gammaA / (gammaA + gammaB);
}

/**
 * Sample from Gamma distribution using Marsaglia and Tsang's method
 */
function gammaSample(shape: number): number {
  if (shape < 1) {
    // For shape < 1, use: Gamma(shape) = Gamma(shape + 1) * U^(1/shape)
    return gammaSample(shape + 1) * Math.pow(Math.random(), 1 / shape);
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

    if (u < 1 - 0.0331 * x * x * x * x) {
      return d * v;
    }

    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return d * v;
    }
  }
}

/**
 * Sample from standard normal distribution using Box-Muller transform
 */
function randomNormal(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Select a variant using Thompson Sampling
 */
export function selectVariantThompson(
  arms: BanditArm[],
  config: Omit<BanditConfig, 'experimentId'>
): BanditSelection {
  if (arms.length === 0) {
    throw new Error('No arms to select from');
  }

  // Sample from posterior for each arm
  const samples: Array<{ variantId: string; sample: number }> = [];

  for (const arm of arms) {
    // Beta(successes + 1, failures + 1) is the posterior
    // +1 is the prior (uniform Beta(1,1))
    const sample = sampleBeta(arm.successes + 1, arm.failures + 1);
    samples.push({ variantId: arm.variantId, sample });
  }

  // Find the arm with highest sample
  samples.sort((a, b) => b.sample - a.sample);
  const selected = samples[0];

  // Calculate selection probability (for logging)
  const totalSamples = arms.reduce((sum, a) => sum + a.successes + a.failures, 0);
  const selectedArm = arms.find((a) => a.variantId === selected.variantId)!;
  const selectedRate = selectedArm.successes / (selectedArm.successes + selectedArm.failures + 1);

  // Determine if this was exploration (selected arm isn't the empirical best)
  const empiricalBest = [...arms].sort(
    (a, b) =>
      b.successes / (b.successes + b.failures + 1) - a.successes / (a.successes + a.failures + 1)
  )[0];

  const isExploration = selected.variantId !== empiricalBest.variantId;

  return {
    variantId: selected.variantId,
    probability: selectedRate,
    isExploration,
  };
}

/**
 * Select variant with minimum exploration guarantee
 */
export function selectVariantWithMinExploration(
  arms: BanditArm[],
  config: Omit<BanditConfig, 'experimentId'>
): BanditSelection {
  // Check if minimum exploration should kick in
  const minExplorationProb = config.minimumExploration / 100;

  if (Math.random() < minExplorationProb * arms.length) {
    // Force random exploration
    const randomArm = arms[Math.floor(Math.random() * arms.length)];
    return {
      variantId: randomArm.variantId,
      probability: 1 / arms.length,
      isExploration: true,
    };
  }

  // Otherwise use Thompson Sampling
  return selectVariantThompson(arms, config);
}

// ============================================================================
// BANDIT MANAGEMENT
// ============================================================================

/**
 * Get or create bandit config for an experiment
 */
export async function getBanditConfig(experimentId: string): Promise<BanditConfig> {
  // Check cache
  if (configCache.has(experimentId)) {
    return configCache.get(experimentId)!;
  }

  // Load from Firestore
  const db = getFirestore();
  const doc = await db.collection('bandit_configs').doc(experimentId).get();

  if (doc.exists) {
    const config = doc.data() as BanditConfig;
    configCache.set(experimentId, config);
    return config;
  }

  // Create default config
  const defaultConfig: BanditConfig = {
    ...DEFAULT_BANDIT_CONFIG,
    experimentId,
  };

  await db.collection('bandit_configs').doc(experimentId).set(defaultConfig);
  configCache.set(experimentId, defaultConfig);

  return defaultConfig;
}

/**
 * Update bandit config
 */
export async function updateBanditConfig(
  experimentId: string,
  updates: Partial<BanditConfig>
): Promise<BanditConfig> {
  const db = getFirestore();
  const current = await getBanditConfig(experimentId);
  const updated = { ...current, ...updates };

  await db.collection('bandit_configs').doc(experimentId).update(updates);
  configCache.set(experimentId, updated);

  log.info({ experimentId, updates }, 'Bandit config updated');

  return updated;
}

/**
 * Get arm statistics for an experiment
 */
export async function getArmStats(experimentId: string): Promise<BanditArm[]> {
  // Check cache
  if (armsCache.has(experimentId)) {
    return armsCache.get(experimentId)!;
  }

  // Load from Firestore metrics
  const db = getFirestore();
  const metricsSnap = await db
    .collection('web_experiments')
    .doc(experimentId)
    .collection('metrics')
    .get();

  const arms: BanditArm[] = [];

  for (const doc of metricsSnap.docs) {
    const data = doc.data();
    const exposures = data.exposures || 0;
    const conversions = data.conversions?.cta_click || 0; // Default goal

    arms.push({
      variantId: doc.id,
      successes: conversions,
      failures: Math.max(0, exposures - conversions),
    });
  }

  armsCache.set(experimentId, arms);

  return arms;
}

/**
 * Update arm statistics after a conversion
 */
export async function recordArmOutcome(
  experimentId: string,
  variantId: string,
  isConversion: boolean
): Promise<void> {
  // Clear cache to force refresh
  armsCache.delete(experimentId);

  // The actual metrics update happens in web-experiments.ts
  // This function is for explicit bandit tracking if needed

  log.debug({ experimentId, variantId, isConversion }, 'Arm outcome recorded');
}

// ============================================================================
// REGRET CALCULATION
// ============================================================================

/**
 * Calculate regret metrics for an experiment
 */
export async function calculateRegret(experimentId: string): Promise<BanditMetrics> {
  const arms = await getArmStats(experimentId);
  const config = await getBanditConfig(experimentId);

  if (arms.length === 0) {
    return {
      experimentId,
      totalRegret: 0,
      averageRegret: 0,
      estimatedBestArm: 'unknown',
      armProbabilities: {},
      explorationRatio: 0,
      sampleCount: 0,
    };
  }

  // Estimate true conversion rates
  const rates = arms.map((arm) => ({
    variantId: arm.variantId,
    rate: arm.successes / (arm.successes + arm.failures + 1),
    samples: arm.successes + arm.failures,
  }));

  const bestRate = Math.max(...rates.map((r) => r.rate));
  const bestArm = rates.find((r) => r.rate === bestRate)?.variantId || 'unknown';
  const totalSamples = rates.reduce((sum, r) => sum + r.samples, 0);

  // Calculate regret (simplified - actual regret requires assignment history)
  // Regret = sum of (best_rate - selected_rate) for each assignment
  // Here we approximate using observed rates
  let totalRegret = 0;
  for (const rate of rates) {
    const armRegret = (bestRate - rate.rate) * rate.samples;
    totalRegret += armRegret;
  }

  // Calculate arm probabilities (using posterior mean)
  const armProbabilities: Record<string, number> = {};
  for (const arm of arms) {
    // Posterior mean of Beta(s+1, f+1) is (s+1)/(s+f+2)
    armProbabilities[arm.variantId] = (arm.successes + 1) / (arm.successes + arm.failures + 2);
  }

  // Exploration ratio (samples not on best arm / total samples)
  const bestArmSamples = rates.find((r) => r.variantId === bestArm)?.samples || 0;
  const explorationRatio = totalSamples > 0 ? (totalSamples - bestArmSamples) / totalSamples : 0;

  return {
    experimentId,
    totalRegret,
    averageRegret: totalSamples > 0 ? totalRegret / totalSamples : 0,
    estimatedBestArm: bestArm,
    armProbabilities,
    explorationRatio,
    sampleCount: totalSamples,
  };
}

// ============================================================================
// VARIANT SELECTION (MAIN ENTRY POINT)
// ============================================================================

/**
 * Select a variant for a user using the bandit algorithm
 */
export async function selectVariantWithBandit(
  experimentId: string
): Promise<BanditSelection | null> {
  try {
    const config = await getBanditConfig(experimentId);

    // Check if bandit is enabled
    if (!config.enabled) {
      return null; // Fall back to random assignment
    }

    const arms = await getArmStats(experimentId);

    // Check warmup period
    const totalSamples = arms.reduce((sum, a) => sum + a.successes + a.failures, 0);
    if (totalSamples < config.warmupSamples) {
      log.debug(
        { experimentId, samples: totalSamples, required: config.warmupSamples },
        'Bandit in warmup period, using random assignment'
      );
      return null; // Fall back to random assignment
    }

    // Use Thompson Sampling with minimum exploration
    const selection = selectVariantWithMinExploration(arms, config);

    log.debug(
      {
        experimentId,
        selected: selection.variantId,
        isExploration: selection.isExploration,
      },
      'Bandit selection made'
    );

    return selection;
  } catch (error) {
    log.warn({ error, experimentId }, 'Bandit selection failed, falling back to random');
    return null;
  }
}

/**
 * Enable bandit for an experiment
 */
export async function enableBandit(
  experimentId: string,
  config?: Partial<Omit<BanditConfig, 'experimentId'>>
): Promise<void> {
  await updateBanditConfig(experimentId, {
    enabled: true,
    ...config,
  });

  log.info({ experimentId }, 'Bandit enabled for experiment');
}

/**
 * Disable bandit for an experiment
 */
export async function disableBandit(experimentId: string): Promise<void> {
  await updateBanditConfig(experimentId, { enabled: false });
  log.info({ experimentId }, 'Bandit disabled for experiment');
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Clear all caches (useful for testing)
 */
export function clearCaches(): void {
  configCache.clear();
  armsCache.clear();
}

/**
 * Invalidate cache for a specific experiment
 */
export function invalidateCache(experimentId: string): void {
  configCache.delete(experimentId);
  armsCache.delete(experimentId);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  selectVariantWithBandit,
  selectVariantThompson,
  selectVariantWithMinExploration,
  getBanditConfig,
  updateBanditConfig,
  getArmStats,
  recordArmOutcome,
  calculateRegret,
  enableBandit,
  disableBandit,
  clearCaches,
  invalidateCache,
  DEFAULT_BANDIT_CONFIG,
};

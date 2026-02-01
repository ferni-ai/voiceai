/**
 * Bandit Algorithms for Superhuman Experiments
 *
 * Implements multi-armed bandit algorithms for dynamic traffic allocation:
 * - Thompson Sampling (Bayesian approach with Beta distributions)
 * - Epsilon-Greedy (simple exploration/exploitation)
 * - UCB1 (Upper Confidence Bound)
 *
 * These algorithms learn which variants perform better and automatically
 * allocate more traffic to winning variants - a "better than human" capability
 * that no manual A/B test can match.
 *
 * @module experiments/bandit-algorithm
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'bandit-algorithm' });

// ============================================================================
// Types
// ============================================================================

export interface BanditArm {
  id: string;
  successes: number; // Alpha parameter for Beta distribution
  failures: number; // Beta parameter for Beta distribution
  exposures: number; // Total times this arm was selected
}

export interface BanditSelection {
  armId: string;
  confidence: number; // How confident we are in this selection (0-1)
  isExploration: boolean; // Whether this was an exploration vs exploitation
  expectedRate: number; // Expected success rate for selected arm
}

export interface WinnerDetection {
  hasWinner: boolean;
  winnerId: string | null;
  confidence: number; // Probability that winner is truly best
  margin: number; // How much better winner is than runner-up
  recommendation: 'continue' | 'graduate' | 'stop';
}

// ============================================================================
// Beta Distribution Sampling (Core of Thompson Sampling)
// ============================================================================

/**
 * Sample from Beta distribution using Jöhnk's algorithm
 * Beta(alpha, beta) where alpha = successes + 1, beta = failures + 1
 */
export function sampleFromBeta(alpha: number, beta: number): number {
  // Handle edge cases
  if (alpha <= 0) alpha = 1;
  if (beta <= 0) beta = 1;

  // Use gamma sampling for Beta: Beta(a,b) = Gamma(a) / (Gamma(a) + Gamma(b))
  const gammaA = sampleFromGamma(alpha);
  const gammaB = sampleFromGamma(beta);

  if (gammaA + gammaB === 0) return 0.5;
  return gammaA / (gammaA + gammaB);
}

/**
 * Sample from Gamma distribution using Marsaglia and Tsang's method
 */
function sampleFromGamma(shape: number): number {
  if (shape < 1) {
    // Use Ahrens-Dieter method for shape < 1
    const u = Math.random();
    return sampleFromGamma(1 + shape) * Math.pow(u, 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

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
 * Generate standard normal random variable (Box-Muller transform)
 */
function randomNormal(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// ============================================================================
// Thompson Sampling
// ============================================================================

/**
 * Thompson Sampling - Select variant by sampling from posterior distributions
 *
 * This is the "superhuman" algorithm that dynamically learns which variants
 * perform better and automatically allocates more traffic to winners.
 */
export function thompsonSample(arms: BanditArm[]): BanditSelection {
  if (arms.length === 0) {
    throw new Error('Cannot sample from empty arm list');
  }

  // Sample from Beta distribution for each arm
  const samples = arms.map((arm) => ({
    arm,
    sample: sampleFromBeta(arm.successes + 1, arm.failures + 1),
    expectedRate: getExpectedRate(arm),
  }));

  // Select arm with highest sample
  samples.sort((a, b) => b.sample - a.sample);
  const selected = samples[0];

  // Calculate confidence based on separation from other arms
  const secondBest = samples[1]?.sample ?? 0;
  const separation = selected.sample - secondBest;
  const confidence = Math.min(0.5 + separation * 2, 0.99);

  // Determine if this is exploration (sampling uncertainty) vs exploitation
  const isExploration = selected.expectedRate < (samples[1]?.expectedRate ?? 0);

  log.debug(
    {
      selectedArm: selected.arm.id,
      sample: selected.sample.toFixed(4),
      confidence: confidence.toFixed(4),
      isExploration,
    },
    'Thompson sampling selection'
  );

  return {
    armId: selected.arm.id,
    confidence,
    isExploration,
    expectedRate: selected.expectedRate,
  };
}

// ============================================================================
// Epsilon-Greedy (Simple Alternative)
// ============================================================================

/**
 * Epsilon-Greedy - Simple exploration/exploitation balance
 * With probability epsilon, explore randomly; otherwise exploit best arm
 */
export function epsilonGreedy(arms: BanditArm[], epsilon: number = 0.1): BanditSelection {
  if (arms.length === 0) {
    throw new Error('Cannot select from empty arm list');
  }

  const explore = Math.random() < epsilon;

  if (explore) {
    // Random exploration
    const randomIndex = Math.floor(Math.random() * arms.length);
    const selected = arms[randomIndex];
    return {
      armId: selected.id,
      confidence: 0.5,
      isExploration: true,
      expectedRate: getExpectedRate(selected),
    };
  }

  // Exploitation - select best performing arm
  const sorted = [...arms].sort((a, b) => getExpectedRate(b) - getExpectedRate(a));
  const selected = sorted[0];

  return {
    armId: selected.id,
    confidence: Math.min(0.5 + getExpectedRate(selected), 0.99),
    isExploration: false,
    expectedRate: getExpectedRate(selected),
  };
}

// ============================================================================
// UCB1 (Upper Confidence Bound)
// ============================================================================

/**
 * UCB1 - Balance exploration/exploitation using confidence bounds
 * Selects arm with highest upper confidence bound
 */
export function ucb1Select(arms: BanditArm[], totalPulls: number): BanditSelection {
  if (arms.length === 0) {
    throw new Error('Cannot select from empty arm list');
  }

  // First, try each arm at least once
  const unexplored = arms.filter((arm) => arm.exposures === 0);
  if (unexplored.length > 0) {
    const selected = unexplored[0];
    return {
      armId: selected.id,
      confidence: 0.5,
      isExploration: true,
      expectedRate: 0.5,
    };
  }

  // Calculate UCB value for each arm
  const ucbValues = arms.map((arm) => {
    const avgReward = getExpectedRate(arm);
    const explorationBonus = Math.sqrt((2 * Math.log(totalPulls)) / arm.exposures);
    return {
      arm,
      ucb: avgReward + explorationBonus,
      avgReward,
    };
  });

  ucbValues.sort((a, b) => b.ucb - a.ucb);
  const selected = ucbValues[0];

  return {
    armId: selected.arm.id,
    confidence: Math.min(selected.avgReward + 0.3, 0.99),
    isExploration: selected.ucb > selected.avgReward + 0.1,
    expectedRate: selected.avgReward,
  };
}

// ============================================================================
// Winner Detection
// ============================================================================

/**
 * Detect if we have a clear winner using Bayesian analysis
 *
 * @param arms - All arms in the experiment
 * @param confidenceThreshold - Required confidence to declare winner (default 95%)
 * @param minimumSamples - Minimum samples per arm before declaring winner
 */
export function detectWinner(
  arms: BanditArm[],
  confidenceThreshold: number = 0.95,
  minimumSamples: number = 100
): WinnerDetection {
  if (arms.length < 2) {
    return {
      hasWinner: false,
      winnerId: null,
      confidence: 0,
      margin: 0,
      recommendation: 'continue',
    };
  }

  // Check minimum samples
  const hasEnoughSamples = arms.every((arm) => arm.exposures >= minimumSamples);
  if (!hasEnoughSamples) {
    return {
      hasWinner: false,
      winnerId: null,
      confidence: 0,
      margin: 0,
      recommendation: 'continue',
    };
  }

  // Monte Carlo simulation to estimate probability each arm is best
  const simulations = 10000;
  const winCounts: Record<string, number> = {};
  arms.forEach((arm) => (winCounts[arm.id] = 0));

  for (let i = 0; i < simulations; i++) {
    let bestArm = arms[0].id;
    let bestSample = -1;

    for (const arm of arms) {
      const sample = sampleFromBeta(arm.successes + 1, arm.failures + 1);
      if (sample > bestSample) {
        bestSample = sample;
        bestArm = arm.id;
      }
    }

    winCounts[bestArm]++;
  }

  // Find the arm with highest win probability
  let maxWins = 0;
  let winnerId = arms[0].id;
  for (const [armId, wins] of Object.entries(winCounts)) {
    if (wins > maxWins) {
      maxWins = wins;
      winnerId = armId;
    }
  }

  const confidence = maxWins / simulations;

  // Calculate margin over runner-up
  const winnerArm = arms.find((a) => a.id === winnerId)!;
  const others = arms.filter((a) => a.id !== winnerId);
  const runnerUp = others.reduce((best, arm) =>
    getExpectedRate(arm) > getExpectedRate(best) ? arm : best
  );
  const margin = getExpectedRate(winnerArm) - getExpectedRate(runnerUp);

  // Determine recommendation
  let recommendation: 'continue' | 'graduate' | 'stop';
  if (confidence >= confidenceThreshold) {
    recommendation = 'graduate';
  } else if (confidence < 0.6 && arms.every((a) => a.exposures > minimumSamples * 3)) {
    recommendation = 'stop'; // No clear winner after lots of data
  } else {
    recommendation = 'continue';
  }

  log.info(
    {
      winnerId,
      confidence: confidence.toFixed(4),
      margin: margin.toFixed(4),
      recommendation,
    },
    'Winner detection result'
  );

  return {
    hasWinner: confidence >= confidenceThreshold,
    winnerId: confidence >= confidenceThreshold ? winnerId : null,
    confidence,
    margin,
    recommendation,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a new bandit arm
 */
export function createArm(id: string): BanditArm {
  return {
    id,
    successes: 0,
    failures: 0,
    exposures: 0,
  };
}

/**
 * Record a conversion (success or failure) for an arm
 */
export function recordConversion(arm: BanditArm, success: boolean): BanditArm {
  return {
    ...arm,
    successes: arm.successes + (success ? 1 : 0),
    failures: arm.failures + (success ? 0 : 1),
    exposures: arm.exposures + 1,
  };
}

/**
 * Get expected success rate (mean of Beta distribution)
 */
export function getExpectedRate(arm: BanditArm): number {
  const alpha = arm.successes + 1;
  const beta = arm.failures + 1;
  return alpha / (alpha + beta);
}

/**
 * Get 95% credible interval for success rate
 */
export function getCredibleInterval(arm: BanditArm): { lower: number; upper: number } {
  const alpha = arm.successes + 1;
  const beta = arm.failures + 1;

  // Use normal approximation for Beta distribution
  const mean = alpha / (alpha + beta);
  const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
  const std = Math.sqrt(variance);

  return {
    lower: Math.max(0, mean - 1.96 * std),
    upper: Math.min(1, mean + 1.96 * std),
  };
}

/**
 * Calculate regret - how much we've lost by not always choosing best arm
 */
export function calculateRegret(arms: BanditArm[]): number {
  if (arms.length === 0) return 0;

  // Find best performing arm
  const bestRate = Math.max(...arms.map(getExpectedRate));

  // Sum up regret across all arms
  let totalRegret = 0;
  for (const arm of arms) {
    const armRate = getExpectedRate(arm);
    totalRegret += arm.exposures * (bestRate - armRate);
  }

  return totalRegret;
}

export default {
  thompsonSample,
  epsilonGreedy,
  ucb1Select,
  detectWinner,
  createArm,
  recordConversion,
  getExpectedRate,
  getCredibleInterval,
  calculateRegret,
  sampleFromBeta,
};

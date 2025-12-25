/**
 * Dynamic Strategy Selection
 *
 * SOTA per-user routing strategy optimization using Thompson Sampling.
 *
 * Different users have different tolerances for latency vs. accuracy:
 * - Power users: prefer fast responses, tolerate occasional corrections
 * - Careful users: prefer accuracy, tolerate slightly slower responses
 *
 * This module learns the optimal routing cascade per user:
 * 1. Fast (pattern → keyword only) - ~10ms
 * 2. Balanced (pattern → keyword → embedding) - ~50ms
 * 3. Accurate (full cascade + LLM fallback) - ~200ms
 *
 * Uses Thompson Sampling (Bayesian bandits) to balance exploration/exploitation.
 *
 * @module tools/semantic-router/learning/dynamic-strategy
 */

import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'semantic-router:dynamic-strategy' });

// ============================================================================
// TYPES
// ============================================================================

/** Available routing strategies (in order of speed→accuracy tradeoff) */
export type RoutingStrategy = 'fast' | 'balanced' | 'accurate' | 'adaptive';

/** Configuration for each strategy */
export interface StrategyConfig {
  name: RoutingStrategy;
  layers: string[];
  maxLatencyMs: number;
  description: string;
  defaultWeight: number;
}

/** Outcome of a routing attempt for learning */
export interface StrategyOutcome {
  strategy: RoutingStrategy;
  latencyMs: number;
  wasCorrect: boolean; // No correction needed
  userSatisfaction?: number; // 0-1, from implicit signals
  toolExecuted: boolean;
  timestamp: number;
}

/** Bayesian belief state for a strategy (Beta distribution parameters) */
interface BetaDistribution {
  alpha: number; // Successes + 1
  beta: number; // Failures + 1
}

/** Per-user strategy profile */
export interface UserStrategyProfile {
  userId: string;
  // Beta distributions for each strategy (for Thompson Sampling)
  beliefs: Record<RoutingStrategy, BetaDistribution>;
  // Performance history
  outcomes: StrategyOutcome[];
  // Inferred user type
  userType: UserType;
  // Total samples
  totalSamples: number;
  // Last update
  lastUpdate: number;
  // Decay factor (for non-stationary environments)
  decayFactor: number;
}

/** User types based on behavior patterns */
export type UserType =
  | 'speed_seeker' // Prefers fast responses
  | 'accuracy_seeker' // Prefers accurate responses
  | 'balanced' // No strong preference
  | 'adaptive' // Changes based on context
  | 'unknown';

/** Selection result */
export interface StrategySelection {
  strategy: RoutingStrategy;
  confidence: number;
  reason: string;
  expectedLatencyMs: number;
  expectedAccuracy: number;
}

/** Configuration for the dynamic strategy system */
export interface DynamicStrategyConfig {
  // Enable/disable dynamic selection
  enabled: boolean;
  // Minimum samples before personalizing (use defaults before this)
  minSamplesForPersonalization: number;
  // Exploration rate (epsilon-greedy backup)
  explorationRate: number;
  // Decay factor for old outcomes (0-1, lower = faster forget)
  decayFactor: number;
  // Max outcomes to keep per user
  maxOutcomesPerUser: number;
  // Default strategy for new users
  defaultStrategy: RoutingStrategy;
  // Latency sensitivity threshold (ms difference that matters)
  latencySensitivityMs: number;
}

// ============================================================================
// STRATEGY DEFINITIONS
// ============================================================================

export const STRATEGY_CONFIGS: Record<RoutingStrategy, StrategyConfig> = {
  fast: {
    name: 'fast',
    layers: ['pattern', 'keyword'],
    maxLatencyMs: 15,
    description: 'Pattern + keyword matching only (fastest)',
    defaultWeight: 0.25,
  },
  balanced: {
    name: 'balanced',
    layers: ['pattern', 'keyword', 'embedding'],
    maxLatencyMs: 60,
    description: 'Pattern + keyword + semantic embedding',
    defaultWeight: 0.5,
  },
  accurate: {
    name: 'accurate',
    layers: ['pattern', 'keyword', 'embedding', 'context', 'history'],
    maxLatencyMs: 200,
    description: 'Full cascade with context and history',
    defaultWeight: 0.2,
  },
  adaptive: {
    name: 'adaptive',
    layers: ['pattern', 'keyword', 'embedding'], // Starts balanced
    maxLatencyMs: 100,
    description: 'Dynamically selects based on input complexity',
    defaultWeight: 0.05,
  },
};

const DEFAULT_CONFIG: DynamicStrategyConfig = {
  enabled: true,
  minSamplesForPersonalization: 10,
  explorationRate: 0.1,
  decayFactor: 0.95,
  maxOutcomesPerUser: 100,
  defaultStrategy: 'balanced',
  latencySensitivityMs: 50,
};

// ============================================================================
// DYNAMIC STRATEGY ENGINE
// ============================================================================

export class DynamicStrategyEngine {
  private config: DynamicStrategyConfig;
  private userProfiles = new Map<string, UserStrategyProfile>();

  constructor(config?: Partial<DynamicStrategyConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Select the optimal strategy for a user.
   * Uses Thompson Sampling for exploration/exploitation balance.
   */
  selectStrategy(
    userId: string,
    context?: {
      inputComplexity?: number; // 0-1, how complex the input is
      urgencySignal?: number; // 0-1, how urgent the request seems
      recentLatency?: number; // Recent average latency
    }
  ): StrategySelection {
    if (!this.config.enabled) {
      return {
        strategy: this.config.defaultStrategy,
        confidence: 0.5,
        reason: 'Dynamic strategy disabled',
        expectedLatencyMs: STRATEGY_CONFIGS[this.config.defaultStrategy].maxLatencyMs,
        expectedAccuracy: 0.8,
      };
    }

    const profile = this.getOrCreateProfile(userId);

    // Not enough data? Use exploration with default strategy
    if (profile.totalSamples < this.config.minSamplesForPersonalization) {
      const explorationStrategy = this.sampleUniformly();
      return {
        strategy: explorationStrategy,
        confidence: 0.3,
        reason: `Exploring (${profile.totalSamples}/${this.config.minSamplesForPersonalization} samples)`,
        expectedLatencyMs: STRATEGY_CONFIGS[explorationStrategy].maxLatencyMs,
        expectedAccuracy: 0.75,
      };
    }

    // Thompson Sampling: sample from each strategy's Beta distribution
    const samples = this.thompsonSample(profile);

    // Find the best sampled value
    let bestStrategy: RoutingStrategy = this.config.defaultStrategy;
    let bestValue = -1;

    for (const [strategy, value] of Object.entries(samples)) {
      // Adjust for context if provided
      let adjustedValue = value;

      if (context?.inputComplexity !== undefined) {
        // Complex inputs benefit more from accurate strategies
        if (context.inputComplexity > 0.7 && strategy === 'accurate') {
          adjustedValue *= 1.2;
        }
        // Simple inputs can use fast strategies
        if (context.inputComplexity < 0.3 && strategy === 'fast') {
          adjustedValue *= 1.2;
        }
      }

      if (context?.urgencySignal !== undefined && context.urgencySignal > 0.8) {
        // Urgent requests favor fast strategies
        if (strategy === 'fast') {
          adjustedValue *= 1.3;
        }
      }

      if (adjustedValue > bestValue) {
        bestValue = adjustedValue;
        bestStrategy = strategy as RoutingStrategy;
      }
    }

    // Calculate expected metrics
    const expectedAccuracy = this.getExpectedAccuracy(profile, bestStrategy);
    const expectedLatency = STRATEGY_CONFIGS[bestStrategy].maxLatencyMs;

    return {
      strategy: bestStrategy,
      confidence: this.getConfidence(profile, bestStrategy),
      reason: this.getSelectionReason(profile, bestStrategy),
      expectedLatencyMs: expectedLatency,
      expectedAccuracy,
    };
  }

  /**
   * Record the outcome of a routing attempt.
   * This updates the Bayesian beliefs for the user.
   */
  recordOutcome(userId: string, outcome: StrategyOutcome): void {
    const profile = this.getOrCreateProfile(userId);

    // Apply decay to old beliefs (for non-stationary environments)
    this.applyDecay(profile);

    // Update Beta distribution for this strategy
    const belief = profile.beliefs[outcome.strategy];
    if (outcome.wasCorrect) {
      belief.alpha += 1;
    } else {
      belief.beta += 1;
    }

    // Record outcome
    profile.outcomes.push(outcome);

    // Trim old outcomes
    if (profile.outcomes.length > this.config.maxOutcomesPerUser) {
      profile.outcomes = profile.outcomes.slice(-this.config.maxOutcomesPerUser);
    }

    // Update stats
    profile.totalSamples++;
    profile.lastUpdate = Date.now();

    // Update user type classification
    profile.userType = this.classifyUserType(profile);

    log.debug(
      {
        userId,
        strategy: outcome.strategy,
        wasCorrect: outcome.wasCorrect,
        userType: profile.userType,
        totalSamples: profile.totalSamples,
      },
      'Strategy outcome recorded'
    );
  }

  /**
   * Get the inferred user type for a user.
   */
  getUserType(userId: string): UserType {
    const profile = this.userProfiles.get(userId);
    return profile?.userType ?? 'unknown';
  }

  /**
   * Get profile stats for debugging/monitoring.
   */
  getProfileStats(userId: string): {
    userType: UserType;
    totalSamples: number;
    strategyDistribution: Record<RoutingStrategy, number>;
    expectedAccuracies: Record<RoutingStrategy, number>;
    lastUpdate: number;
  } | null {
    const profile = this.userProfiles.get(userId);
    if (!profile) return null;

    const distribution: Record<RoutingStrategy, number> = {
      fast: 0,
      balanced: 0,
      accurate: 0,
      adaptive: 0,
    };

    const accuracies: Record<RoutingStrategy, number> = {
      fast: 0,
      balanced: 0,
      accurate: 0,
      adaptive: 0,
    };

    for (const outcome of profile.outcomes) {
      distribution[outcome.strategy]++;
    }

    // Normalize
    const total = profile.outcomes.length || 1;
    for (const key of Object.keys(distribution) as RoutingStrategy[]) {
      distribution[key] /= total;
      accuracies[key] = this.getExpectedAccuracy(profile, key);
    }

    return {
      userType: profile.userType,
      totalSamples: profile.totalSamples,
      strategyDistribution: distribution,
      expectedAccuracies: accuracies,
      lastUpdate: profile.lastUpdate,
    };
  }

  /**
   * Get global statistics across all users.
   */
  getGlobalStats(): {
    totalUsers: number;
    userTypeDistribution: Record<UserType, number>;
    overallStrategyDistribution: Record<RoutingStrategy, number>;
    avgSamplesPerUser: number;
  } {
    const userTypes: Record<UserType, number> = {
      speed_seeker: 0,
      accuracy_seeker: 0,
      balanced: 0,
      adaptive: 0,
      unknown: 0,
    };

    const strategies: Record<RoutingStrategy, number> = {
      fast: 0,
      balanced: 0,
      accurate: 0,
      adaptive: 0,
    };

    let totalSamples = 0;

    for (const profile of this.userProfiles.values()) {
      userTypes[profile.userType]++;
      totalSamples += profile.totalSamples;

      for (const outcome of profile.outcomes) {
        strategies[outcome.strategy]++;
      }
    }

    const numUsers = this.userProfiles.size || 1;

    // Normalize strategies
    const totalOutcomes = totalSamples || 1;
    for (const key of Object.keys(strategies) as RoutingStrategy[]) {
      strategies[key] /= totalOutcomes;
    }

    return {
      totalUsers: this.userProfiles.size,
      userTypeDistribution: userTypes,
      overallStrategyDistribution: strategies,
      avgSamplesPerUser: totalSamples / numUsers,
    };
  }

  /**
   * Clear all user profiles.
   */
  clearAll(): void {
    this.userProfiles.clear();
    log.info('Cleared all strategy profiles');
  }

  /**
   * Clear a specific user's profile.
   */
  clearUser(userId: string): void {
    this.userProfiles.delete(userId);
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  private getOrCreateProfile(userId: string): UserStrategyProfile {
    let profile = this.userProfiles.get(userId);

    if (!profile) {
      profile = {
        userId,
        beliefs: {
          fast: { alpha: 1, beta: 1 }, // Uniform prior
          balanced: { alpha: 2, beta: 1 }, // Slight prior for balanced
          accurate: { alpha: 1, beta: 1 },
          adaptive: { alpha: 1, beta: 1 },
        },
        outcomes: [],
        userType: 'unknown',
        totalSamples: 0,
        lastUpdate: Date.now(),
        decayFactor: this.config.decayFactor,
      };
      this.userProfiles.set(userId, profile);
    }

    return profile;
  }

  /**
   * Thompson Sampling: draw a sample from each strategy's Beta distribution.
   */
  private thompsonSample(profile: UserStrategyProfile): Record<RoutingStrategy, number> {
    const samples: Record<RoutingStrategy, number> = {
      fast: 0,
      balanced: 0,
      accurate: 0,
      adaptive: 0,
    };

    for (const strategy of Object.keys(profile.beliefs) as RoutingStrategy[]) {
      const { alpha, beta } = profile.beliefs[strategy];
      // Sample from Beta(alpha, beta)
      samples[strategy] = this.sampleBeta(alpha, beta);
    }

    return samples;
  }

  /**
   * Sample from a Beta distribution using the gamma function approach.
   */
  private sampleBeta(alpha: number, beta: number): number {
    // Use the fact that Beta(a,b) = Gamma(a) / (Gamma(a) + Gamma(b))
    const x = this.sampleGamma(alpha);
    const y = this.sampleGamma(beta);
    return x / (x + y);
  }

  /**
   * Sample from a Gamma distribution using Marsaglia's method.
   */
  private sampleGamma(shape: number): number {
    if (shape < 1) {
      // For shape < 1, use Gamma(shape) = Gamma(shape+1) * U^(1/shape)
      return this.sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
    }

    // Marsaglia and Tsang's method for shape >= 1
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);

    while (true) {
      let x: number;
      let v: number;

      do {
        x = this.sampleStandardNormal();
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
   * Sample from standard normal distribution (Box-Muller).
   */
  private sampleStandardNormal(): number {
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /**
   * Sample uniformly from strategies (for exploration).
   */
  private sampleUniformly(): RoutingStrategy {
    const strategies: RoutingStrategy[] = ['fast', 'balanced', 'accurate', 'adaptive'];
    return strategies[Math.floor(Math.random() * strategies.length)];
  }

  /**
   * Apply decay to beliefs (for non-stationary environments).
   */
  private applyDecay(profile: UserStrategyProfile): void {
    const decay = profile.decayFactor;

    for (const strategy of Object.keys(profile.beliefs) as RoutingStrategy[]) {
      const belief = profile.beliefs[strategy];
      // Decay towards prior (1, 1)
      belief.alpha = 1 + (belief.alpha - 1) * decay;
      belief.beta = 1 + (belief.beta - 1) * decay;
    }
  }

  /**
   * Classify user type based on their behavior patterns.
   */
  private classifyUserType(profile: UserStrategyProfile): UserType {
    if (profile.totalSamples < this.config.minSamplesForPersonalization) {
      return 'unknown';
    }

    // Count outcomes by strategy
    const counts: Record<RoutingStrategy, { correct: number; total: number }> = {
      fast: { correct: 0, total: 0 },
      balanced: { correct: 0, total: 0 },
      accurate: { correct: 0, total: 0 },
      adaptive: { correct: 0, total: 0 },
    };

    for (const outcome of profile.outcomes.slice(-50)) {
      // Last 50 outcomes
      counts[outcome.strategy].total++;
      if (outcome.wasCorrect) {
        counts[outcome.strategy].correct++;
      }
    }

    // Calculate accuracy and preference scores
    const fastSuccess = counts.fast.total > 0 ? counts.fast.correct / counts.fast.total : 0;
    const accurateSuccess =
      counts.accurate.total > 0 ? counts.accurate.correct / counts.accurate.total : 0;

    // User frequently corrects fast routing? They're accuracy seekers
    if (fastSuccess < 0.7 && counts.fast.total > 5) {
      return 'accuracy_seeker';
    }

    // User happy with fast routing? They're speed seekers
    if (fastSuccess > 0.9 && counts.fast.total > 5) {
      return 'speed_seeker';
    }

    // User behavior varies by context?
    const variance = this.calculateBehaviorVariance(profile.outcomes.slice(-50));
    if (variance > 0.3) {
      return 'adaptive';
    }

    return 'balanced';
  }

  /**
   * Calculate variance in strategy usage (higher = more adaptive).
   */
  private calculateBehaviorVariance(outcomes: StrategyOutcome[]): number {
    if (outcomes.length < 5) return 0;

    const counts: Record<RoutingStrategy, number> = {
      fast: 0,
      balanced: 0,
      accurate: 0,
      adaptive: 0,
    };

    for (const outcome of outcomes) {
      counts[outcome.strategy]++;
    }

    const total = outcomes.length;
    const proportions = Object.values(counts).map((c) => c / total);

    // Calculate entropy as measure of variance
    const entropy = -proportions.reduce((sum, p) => (p > 0 ? sum + p * Math.log(p) : sum), 0);
    const maxEntropy = Math.log(4); // 4 strategies

    return entropy / maxEntropy; // Normalized 0-1
  }

  /**
   * Get expected accuracy for a strategy based on profile.
   */
  private getExpectedAccuracy(profile: UserStrategyProfile, strategy: RoutingStrategy): number {
    const belief = profile.beliefs[strategy];
    // Expected value of Beta distribution
    return belief.alpha / (belief.alpha + belief.beta);
  }

  /**
   * Get confidence in the selection.
   */
  private getConfidence(profile: UserStrategyProfile, strategy: RoutingStrategy): number {
    const belief = profile.beliefs[strategy];
    const n = belief.alpha + belief.beta - 2; // Effective sample size

    // More samples = more confidence
    const sampleConfidence = Math.min(1, n / 50);

    // Higher expected value = more confidence
    const valueConfidence = this.getExpectedAccuracy(profile, strategy);

    return (sampleConfidence + valueConfidence) / 2;
  }

  /**
   * Get human-readable reason for selection.
   */
  private getSelectionReason(profile: UserStrategyProfile, strategy: RoutingStrategy): string {
    const expectedAccuracy = (this.getExpectedAccuracy(profile, strategy) * 100).toFixed(0);
    const userType = profile.userType;

    switch (strategy) {
      case 'fast':
        return `Fast routing (${expectedAccuracy}% expected accuracy, user: ${userType})`;
      case 'balanced':
        return `Balanced routing (${expectedAccuracy}% expected accuracy, user: ${userType})`;
      case 'accurate':
        return `Accurate routing (${expectedAccuracy}% expected accuracy, user: ${userType})`;
      case 'adaptive':
        return `Adaptive routing (${expectedAccuracy}% expected accuracy, user: ${userType})`;
      default:
        return `Unknown strategy (${expectedAccuracy}% expected accuracy)`;
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let engineInstance: DynamicStrategyEngine | null = null;

export function getDynamicStrategyEngine(
  config?: Partial<DynamicStrategyConfig>
): DynamicStrategyEngine {
  if (!engineInstance) {
    engineInstance = new DynamicStrategyEngine(config);
  }
  return engineInstance;
}

export function initializeDynamicStrategy(
  config?: Partial<DynamicStrategyConfig>
): DynamicStrategyEngine {
  engineInstance = new DynamicStrategyEngine(config);
  log.info('Dynamic strategy engine initialized');
  return engineInstance;
}

export function shutdownDynamicStrategy(): void {
  if (engineInstance) {
    engineInstance.clearAll();
    engineInstance = null;
    log.info('Dynamic strategy engine shutdown');
  }
}

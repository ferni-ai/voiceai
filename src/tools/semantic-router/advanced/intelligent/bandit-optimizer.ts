/**
 * Multi-Armed Bandit Optimizer
 *
 * Uses reinforcement learning to optimize tool routing over time.
 * Learns from actual outcomes (task completion, user satisfaction)
 * rather than just click-through rates.
 *
 * Implements:
 * - Thompson Sampling for exploration/exploitation
 * - Contextual bandits for user/situation-aware selection
 * - Delayed reward tracking
 *
 * @module semantic-router/advanced/intelligent/bandit-optimizer
 */

import { createLogger } from '../../../../utils/safe-logger.js';

const log = createLogger({ module: 'bandit-optimizer' });

// ============================================================================
// TYPES
// ============================================================================

export interface BanditConfig {
  /** Prior successes (Beta distribution alpha) */
  priorAlpha: number;
  /** Prior failures (Beta distribution beta) */
  priorBeta: number;
  /** Decay factor for old observations */
  decayFactor: number;
  /** Minimum samples before using bandit */
  minSamples: number;
  /** Enable contextual features */
  enableContextual: boolean;
  /** Reward decay for time-delayed outcomes */
  rewardDecayHours: number;
  /** Persistence interval */
  persistIntervalMs: number;
}

export interface ToolArm {
  /** Tool ID */
  toolId: string;
  /** Successes (task completed) */
  successes: number;
  /** Failures (task failed/abandoned) */
  failures: number;
  /** Total attempts */
  attempts: number;
  /** Average reward (0-1) */
  averageReward: number;
  /** Last updated */
  lastUpdated: Date;
  /** Contextual weights (intent → boost) */
  contextWeights: Map<string, number>;
}

export interface SelectionResult {
  /** Selected tool */
  toolId: string;
  /** Thompson sample value */
  sampleValue: number;
  /** Exploration vs exploitation */
  wasExploration: boolean;
  /** Expected value (mean) */
  expectedValue: number;
  /** Confidence interval */
  confidenceInterval: [number, number];
  /** Context boost applied */
  contextBoost: number;
}

export interface RewardSignal {
  /** Tool that was used */
  toolId: string;
  /** Reward value (0-1) */
  reward: number;
  /** User ID for tracking */
  userId: string;
  /** Session ID */
  sessionId?: string;
  /** Context at time of selection */
  context?: RoutingContext;
  /** Time of original selection */
  selectionTime: Date;
  /** Time of reward signal */
  rewardTime: Date;
  /** Reward type */
  rewardType: 'explicit' | 'implicit' | 'delayed';
}

export interface RoutingContext {
  /** Intent category (e.g., 'music', 'weather', 'calendar') */
  intentCategory?: string;
  /** Time of day */
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
  /** Day of week */
  dayOfWeek?: 'weekday' | 'weekend';
  /** User segment */
  userSegment?: string;
  /** Persona active */
  personaId?: string;
  /** Recent conversation topic */
  topic?: string;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: BanditConfig = {
  priorAlpha: 1, // Uniform prior
  priorBeta: 1,
  decayFactor: 0.995, // Slow decay
  minSamples: 10,
  enableContextual: true,
  rewardDecayHours: 24,
  persistIntervalMs: 60000, // 1 minute
};

// ============================================================================
// MULTI-ARMED BANDIT OPTIMIZER
// ============================================================================

export class BanditOptimizer {
  private config: BanditConfig;
  private arms = new Map<string, ToolArm>();
  private pendingRewards = new Map<
    string,
    { toolId: string; time: Date; context?: RoutingContext }
  >();
  private persistCallback?: (arms: Map<string, ToolArm>) => Promise<void>;
  private loadCallback?: () => Promise<Map<string, ToolArm>>;
  private persistTimer?: ReturnType<typeof setInterval>;

  constructor(config: Partial<BanditConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize with existing arm data
   */
  async initialize(tools: string[]): Promise<void> {
    // Try to load persisted data
    if (this.loadCallback) {
      try {
        const loaded = await this.loadCallback();
        if (loaded.size > 0) {
          this.arms = loaded;
          log.info({ armCount: this.arms.size }, 'Loaded bandit arms from storage');
        }
      } catch (error) {
        log.warn({ error }, 'Failed to load bandit arms');
      }
    }

    // Initialize any missing tools
    for (const toolId of tools) {
      if (!this.arms.has(toolId)) {
        this.arms.set(toolId, {
          toolId,
          successes: this.config.priorAlpha,
          failures: this.config.priorBeta,
          attempts: 0,
          averageReward: 0.5,
          lastUpdated: new Date(),
          contextWeights: new Map(),
        });
      }
    }

    // Start persistence timer
    if (this.persistCallback && !this.persistTimer) {
      this.persistTimer = setInterval(() => {
        this.persist().catch((e) => log.warn({ error: e }, 'Persist failed'));
      }, this.config.persistIntervalMs);
    }

    log.info({ toolCount: tools.length, armCount: this.arms.size }, 'Bandit optimizer initialized');
  }

  /**
   * Set persistence callbacks
   */
  setPersistence(
    save: (arms: Map<string, ToolArm>) => Promise<void>,
    load: () => Promise<Map<string, ToolArm>>
  ): void {
    this.persistCallback = save;
    this.loadCallback = load;
  }

  /**
   * Select the best tool using Thompson Sampling
   */
  select(candidates: string[], context?: RoutingContext): SelectionResult {
    const samples: Array<{
      toolId: string;
      sample: number;
      expected: number;
      ci: [number, number];
      contextBoost: number;
    }> = [];

    for (const toolId of candidates) {
      const arm = this.arms.get(toolId);

      if (!arm || arm.attempts < this.config.minSamples) {
        // Not enough data - use prior with exploration bonus
        const sample = this.betaSample(this.config.priorAlpha + 1, this.config.priorBeta);
        samples.push({
          toolId,
          sample: sample + 0.1, // Exploration bonus for new tools
          expected: 0.5,
          ci: [0.2, 0.8],
          contextBoost: 0,
        });
        continue;
      }

      // Get contextual boost
      const contextBoost = this.getContextBoost(arm, context);

      // Thompson sample from Beta distribution
      const alpha = arm.successes + this.config.priorAlpha;
      const beta = arm.failures + this.config.priorBeta;
      const sample = this.betaSample(alpha, beta) + contextBoost;

      // Calculate confidence interval
      const ci = this.confidenceInterval(alpha, beta);

      samples.push({
        toolId,
        sample,
        expected: alpha / (alpha + beta),
        ci,
        contextBoost,
      });
    }

    // Select highest sample
    samples.sort((a, b) => b.sample - a.sample);
    const selected = samples[0];

    // Determine if this was exploration
    const wasExploration =
      selected.expected < 0.5 ||
      (samples.length > 1 && selected.sample > samples[1].expected + 0.2);

    return {
      toolId: selected.toolId,
      sampleValue: selected.sample,
      wasExploration,
      expectedValue: selected.expected,
      confidenceInterval: selected.ci,
      contextBoost: selected.contextBoost,
    };
  }

  /**
   * Record that a tool was selected (for delayed reward)
   */
  recordSelection(
    toolId: string,
    userId: string,
    sessionId?: string,
    context?: RoutingContext
  ): string {
    const selectionId = `${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.pendingRewards.set(selectionId, { toolId, time: new Date(), context });

    // Cleanup old pending rewards
    const cutoff = new Date(Date.now() - this.config.rewardDecayHours * 3600000);
    for (const [id, pending] of this.pendingRewards) {
      if (pending.time < cutoff) {
        this.pendingRewards.delete(id);
      }
    }

    return selectionId;
  }

  /**
   * Record immediate reward
   */
  recordReward(toolId: string, reward: number, context?: RoutingContext): void {
    const arm = this.arms.get(toolId);
    if (!arm) {
      log.warn({ toolId }, 'Reward for unknown tool');
      return;
    }

    // Apply decay to old observations
    arm.successes *= this.config.decayFactor;
    arm.failures *= this.config.decayFactor;

    // Update with new observation
    if (reward >= 0.5) {
      arm.successes += reward;
    } else {
      arm.failures += 1 - reward;
    }

    arm.attempts++;
    arm.averageReward = arm.successes / (arm.successes + arm.failures);
    arm.lastUpdated = new Date();

    // Update contextual weights
    if (this.config.enableContextual && context) {
      this.updateContextWeights(arm, context, reward);
    }

    log.debug(
      {
        toolId,
        reward,
        newAverage: arm.averageReward.toFixed(3),
        attempts: arm.attempts,
      },
      'Recorded reward'
    );
  }

  /**
   * Record delayed reward by selection ID
   */
  recordDelayedReward(selectionId: string, reward: number): boolean {
    const pending = this.pendingRewards.get(selectionId);
    if (!pending) {
      log.warn({ selectionId }, 'Unknown selection ID for delayed reward');
      return false;
    }

    // Apply time decay to reward
    const hoursSinceSelection = (Date.now() - pending.time.getTime()) / 3600000;
    const decayedReward = reward * Math.exp(-hoursSinceSelection / this.config.rewardDecayHours);

    this.recordReward(pending.toolId, decayedReward, pending.context);
    this.pendingRewards.delete(selectionId);

    return true;
  }

  /**
   * Get context-based boost for an arm
   */
  private getContextBoost(arm: ToolArm, context?: RoutingContext): number {
    if (!context || !this.config.enableContextual) return 0;

    let boost = 0;

    // Intent category boost
    if (context.intentCategory) {
      boost += arm.contextWeights.get(`intent:${context.intentCategory}`) || 0;
    }

    // Time of day boost
    if (context.timeOfDay) {
      boost += arm.contextWeights.get(`time:${context.timeOfDay}`) || 0;
    }

    // Persona boost
    if (context.personaId) {
      boost += arm.contextWeights.get(`persona:${context.personaId}`) || 0;
    }

    return Math.min(0.3, Math.max(-0.3, boost)); // Cap at ±30%
  }

  /**
   * Update contextual weights based on reward
   */
  private updateContextWeights(arm: ToolArm, context: RoutingContext, reward: number): void {
    const learningRate = 0.1;
    const update = (reward - arm.averageReward) * learningRate;

    const keys: string[] = [];
    if (context.intentCategory) keys.push(`intent:${context.intentCategory}`);
    if (context.timeOfDay) keys.push(`time:${context.timeOfDay}`);
    if (context.personaId) keys.push(`persona:${context.personaId}`);

    for (const key of keys) {
      const current = arm.contextWeights.get(key) || 0;
      arm.contextWeights.set(key, current + update);
    }
  }

  /**
   * Sample from Beta distribution using Box-Muller approximation
   */
  private betaSample(alpha: number, beta: number): number {
    // For large alpha, beta use normal approximation
    if (alpha > 20 && beta > 20) {
      const mean = alpha / (alpha + beta);
      const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
      const std = Math.sqrt(variance);

      // Box-Muller transform
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

      return Math.max(0, Math.min(1, mean + z * std));
    }

    // For small values, use simple gamma ratio
    const x = this.gammaSample(alpha);
    const y = this.gammaSample(beta);
    return x / (x + y);
  }

  /**
   * Sample from Gamma distribution using Marsaglia-Tsang method
   */
  private gammaSample(shape: number): number {
    if (shape < 1) {
      return this.gammaSample(1 + shape) * Math.pow(Math.random(), 1 / shape);
    }

    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);

    while (true) {
      let x: number;
      let v: number;

      do {
        const u1 = Math.random();
        const u2 = Math.random();
        x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
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
   * Calculate confidence interval for Beta distribution
   */
  private confidenceInterval(alpha: number, beta: number, level = 0.95): [number, number] {
    // Use normal approximation for speed
    const mean = alpha / (alpha + beta);
    const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
    const std = Math.sqrt(variance);
    const z = 1.96; // 95% CI

    return [Math.max(0, mean - z * std), Math.min(1, mean + z * std)];
  }

  /**
   * Get arm statistics
   */
  getArmStats(toolId: string): ToolArm | undefined {
    return this.arms.get(toolId);
  }

  /**
   * Get all arms sorted by expected value
   */
  getAllArms(): ToolArm[] {
    return Array.from(this.arms.values()).sort((a, b) => b.averageReward - a.averageReward);
  }

  /**
   * Get exploration rate (how often we pick non-optimal)
   */
  getExplorationStats(): { explorationRate: number; totalSelections: number } {
    const total = Array.from(this.arms.values()).reduce((sum, arm) => sum + arm.attempts, 0);
    // Estimate based on variance
    const avgVariance =
      Array.from(this.arms.values()).reduce((sum, arm) => {
        const alpha = arm.successes + this.config.priorAlpha;
        const beta = arm.failures + this.config.priorBeta;
        return sum + (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
      }, 0) / this.arms.size;

    return {
      explorationRate: Math.min(1, avgVariance * 10), // Rough estimate
      totalSelections: total,
    };
  }

  /**
   * Persist arms to storage
   */
  async persist(): Promise<void> {
    if (this.persistCallback) {
      await this.persistCallback(this.arms);
    }
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    if (this.persistTimer) {
      clearInterval(this.persistTimer);
      this.persistTimer = undefined;
    }
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let banditInstance: BanditOptimizer | null = null;

export function getBanditOptimizer(): BanditOptimizer {
  if (!banditInstance) {
    banditInstance = new BanditOptimizer();
  }
  return banditInstance;
}

export function initializeBanditOptimizer(
  config?: Partial<BanditConfig>,
  tools?: string[]
): BanditOptimizer {
  banditInstance = new BanditOptimizer(config);

  if (tools) {
    banditInstance.initialize(tools).catch((e) => log.error({ error: e }, 'Bandit init failed'));
  }

  return banditInstance;
}

// ============================================================================
// REWARD HELPERS
// ============================================================================

/**
 * Calculate implicit reward from user behavior
 */
export function calculateImplicitReward(signals: {
  /** Did user continue conversation? */
  continued: boolean;
  /** Did user correct/retry? */
  corrected: boolean;
  /** Time to next user input (ms) */
  responseTimeMs?: number;
  /** Did user explicitly thank/acknowledge? */
  thanked: boolean;
  /** Did user switch topic immediately? */
  switchedTopic: boolean;
}): number {
  let reward = 0.5; // Base reward

  if (signals.thanked) reward += 0.3;
  if (signals.continued && !signals.switchedTopic) reward += 0.2;
  if (signals.corrected) reward -= 0.4;
  if (signals.switchedTopic) reward -= 0.1;

  // Quick response is good
  if (signals.responseTimeMs && signals.responseTimeMs < 2000) {
    reward += 0.1;
  }

  return Math.max(0, Math.min(1, reward));
}

/**
 * Calculate explicit reward from user feedback
 */
export function calculateExplicitReward(feedback: {
  rating?: 1 | 2 | 3 | 4 | 5;
  thumbs?: 'up' | 'down';
  helpful?: boolean;
}): number {
  if (feedback.rating !== undefined) {
    return (feedback.rating - 1) / 4; // 1-5 → 0-1
  }

  if (feedback.thumbs !== undefined) {
    return feedback.thumbs === 'up' ? 1 : 0;
  }

  if (feedback.helpful !== undefined) {
    return feedback.helpful ? 1 : 0;
  }

  return 0.5; // No feedback = neutral
}

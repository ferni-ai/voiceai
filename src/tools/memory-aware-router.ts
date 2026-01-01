/**
 * Memory-Aware Router
 *
 * Enhances the semantic router with memory awareness:
 * - Boosts tools the user has successfully used before
 * - Considers recent conversation context
 * - Factors in emotional state for tool selection
 * - Uses memory to understand user preferences
 *
 * This makes tool selection feel personalized - Ferni learns
 * which tools work best for each user.
 *
 * @module tools/memory-aware-router
 */

import { createLogger } from '../utils/safe-logger.js';
import { getToolSuccessTracker } from './tool-success-tracker.js';
import { getContextCarrier } from './context-carrier.js';
import type { ToolRecommendation } from './tool-success-tracker.js';

const log = createLogger({ module: 'MemoryAwareRouter' });

// ============================================================================
// TYPES
// ============================================================================

export interface RoutingContext {
  userId: string;
  sessionId: string;
  query: string;
  topic?: string;
  emotion?: string;
  personaId?: string;
  recentToolIds?: string[];
}

export interface RoutingBoost {
  toolId: string;
  boost: number; // Multiplier (1.0 = no change, >1 = boost, <1 = penalize)
  reason: string;
}

export interface EnhancedToolScore {
  toolId: string;
  baseScore: number;
  memoryBoost: number;
  finalScore: number;
  boostReasons: string[];
}

export interface MemoryAwareRouterConfig {
  // How much to boost based on user history
  historyBoostWeight: number;

  // How much to boost based on recent context
  contextBoostWeight: number;

  // How much to penalize recently used tools
  recencyPenaltyWeight: number;

  // Minimum calls before using history
  minCallsForHistory: number;

  // Maximum boost/penalty multiplier
  maxBoostMultiplier: number;
  minBoostMultiplier: number;
}

const DEFAULT_CONFIG: MemoryAwareRouterConfig = {
  historyBoostWeight: 0.3,
  contextBoostWeight: 0.2,
  recencyPenaltyWeight: 0.1,
  minCallsForHistory: 5,
  maxBoostMultiplier: 1.5,
  minBoostMultiplier: 0.5,
};

// ============================================================================
// MEMORY-AWARE ROUTER
// ============================================================================

export class MemoryAwareRouter {
  private config: MemoryAwareRouterConfig;

  constructor(config?: Partial<MemoryAwareRouterConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // CORE API
  // ==========================================================================

  /**
   * Calculate routing boosts based on memory and context
   */
  async calculateBoosts(
    context: RoutingContext,
    toolIds: string[]
  ): Promise<RoutingBoost[]> {
    const boosts: RoutingBoost[] = [];

    for (const toolId of toolIds) {
      let totalBoost = 1.0;
      const reasons: string[] = [];

      // 1. History-based boost
      const historyBoost = await this.calculateHistoryBoost(context, toolId);
      if (historyBoost !== 1.0) {
        totalBoost *= historyBoost;
        reasons.push(
          historyBoost > 1
            ? `User has good history with this tool (+${Math.round((historyBoost - 1) * 100)}%)`
            : `User has mixed history with this tool (${Math.round((historyBoost - 1) * 100)}%)`
        );
      }

      // 2. Context-based boost
      const contextBoost = await this.calculateContextBoost(context, toolId);
      if (contextBoost !== 1.0) {
        totalBoost *= contextBoost;
        reasons.push(
          contextBoost > 1
            ? `Fits current context well (+${Math.round((contextBoost - 1) * 100)}%)`
            : `Doesn't fit current context (${Math.round((contextBoost - 1) * 100)}%)`
        );
      }

      // 3. Recency penalty
      const recencyPenalty = this.calculateRecencyPenalty(context, toolId);
      if (recencyPenalty !== 1.0) {
        totalBoost *= recencyPenalty;
        reasons.push(`Recently used (${Math.round((recencyPenalty - 1) * 100)}%)`);
      }

      // 4. Emotional fit boost
      const emotionalBoost = this.calculateEmotionalBoost(context, toolId);
      if (emotionalBoost !== 1.0) {
        totalBoost *= emotionalBoost;
        reasons.push(
          emotionalBoost > 1
            ? `Good for current emotional state (+${Math.round((emotionalBoost - 1) * 100)}%)`
            : `May not fit emotional state (${Math.round((emotionalBoost - 1) * 100)}%)`
        );
      }

      // Clamp to bounds
      totalBoost = Math.max(
        this.config.minBoostMultiplier,
        Math.min(this.config.maxBoostMultiplier, totalBoost)
      );

      boosts.push({
        toolId,
        boost: totalBoost,
        reason: reasons.join('; ') || 'Default score',
      });
    }

    return boosts;
  }

  /**
   * Enhance tool scores with memory awareness
   */
  async enhanceScores(
    context: RoutingContext,
    baseScores: Array<{ toolId: string; score: number }>
  ): Promise<EnhancedToolScore[]> {
    const boosts = await this.calculateBoosts(
      context,
      baseScores.map((s) => s.toolId)
    );

    const boostMap = new Map(boosts.map((b) => [b.toolId, b]));

    return baseScores.map((base) => {
      const boost = boostMap.get(base.toolId);
      const memoryBoost = boost?.boost ?? 1.0;

      return {
        toolId: base.toolId,
        baseScore: base.score,
        memoryBoost,
        finalScore: base.score * memoryBoost,
        boostReasons: boost?.reason ? [boost.reason] : [],
      };
    });
  }

  /**
   * Get recommended tools based on memory
   */
  async getMemoryBasedRecommendations(
    context: RoutingContext,
    availableTools: string[],
    maxResults: number = 5
  ): Promise<ToolRecommendation[]> {
    const tracker = getToolSuccessTracker();

    return tracker.getRecommendations(
      context.userId,
      availableTools,
      {
        topic: context.topic,
        emotion: context.emotion,
        personaId: context.personaId,
      },
      maxResults
    );
  }

  // ==========================================================================
  // BOOST CALCULATIONS
  // ==========================================================================

  /**
   * Calculate boost based on user's history with the tool
   */
  private async calculateHistoryBoost(
    context: RoutingContext,
    toolId: string
  ): Promise<number> {
    const tracker = getToolSuccessTracker();
    const metrics = await tracker.getMetrics(context.userId, toolId);

    if (!metrics || metrics.totalCalls < this.config.minCallsForHistory) {
      return 1.0; // Not enough data
    }

    const successRate = metrics.successfulCalls / metrics.totalCalls;

    // Convert success rate to boost (0.5 success = 1.0, higher = boost, lower = penalty)
    const boost = 0.5 + successRate * this.config.historyBoostWeight * 2;

    return boost;
  }

  /**
   * Calculate boost based on current context
   */
  private async calculateContextBoost(
    context: RoutingContext,
    toolId: string
  ): Promise<number> {
    const tracker = getToolSuccessTracker();
    const contextualRate = await tracker.getContextualSuccessRate(
      context.userId,
      toolId,
      {
        topic: context.topic,
        emotion: context.emotion,
        personaId: context.personaId,
      }
    );

    // Convert contextual rate to boost
    const boost = 0.5 + contextualRate * this.config.contextBoostWeight * 2;

    return boost;
  }

  /**
   * Calculate penalty for recently used tools
   */
  private calculateRecencyPenalty(
    context: RoutingContext,
    toolId: string
  ): number {
    // Check if tool was used recently in this session
    const recentTools = context.recentToolIds || [];

    if (!recentTools.includes(toolId)) {
      return 1.0; // No penalty
    }

    // More recent = higher penalty
    const recency = recentTools.indexOf(toolId);
    const penalty =
      1 - this.config.recencyPenaltyWeight * (1 - recency / recentTools.length);

    return penalty;
  }

  /**
   * Calculate boost based on emotional fit
   */
  private calculateEmotionalBoost(
    context: RoutingContext,
    toolId: string
  ): number {
    if (!context.emotion) return 1.0;

    const emotionLower = context.emotion.toLowerCase();

    // Tools that are good for certain emotions
    const emotionToolFit: Record<string, string[]> = {
      anxious: ['breathingExercise', 'groundingTechnique', 'journalPrompt'],
      sad: ['emotionalSupport', 'journalPrompt', 'celebrateMilestone'],
      overwhelmed: ['taskBreakdown', 'prioritize', 'breathingExercise'],
      happy: ['celebrateMilestone', 'setGoal', 'shareAchievement'],
      frustrated: ['perspective', 'problemSolve', 'ventSession'],
      tired: ['selfCare', 'energyBoost', 'restReminder'],
    };

    const goodTools = emotionToolFit[emotionLower] || [];

    if (goodTools.includes(toolId)) {
      return 1 + this.config.contextBoostWeight; // Boost
    }

    return 1.0;
  }

  // ==========================================================================
  // INTEGRATION HELPERS
  // ==========================================================================

  /**
   * Record tool usage (call this after tool execution)
   */
  async recordToolUsage(
    context: RoutingContext,
    toolId: string,
    success: boolean,
    latency: number
  ): Promise<void> {
    const tracker = getToolSuccessTracker();
    const contextCarrier = getContextCarrier();

    // Record in tracker
    await tracker.recordCall({
      toolId,
      userId: context.userId,
      timestamp: new Date(),
      success,
      latency,
      context: {
        topic: context.topic,
        emotion: context.emotion,
        personaId: context.personaId,
        sessionId: context.sessionId,
      },
    });

    // Record in context carrier
    contextCarrier.recordToolUsage(
      context.sessionId,
      toolId,
      success ? 'success' : 'failure',
      { duration: latency }
    );

    log.debug(
      { toolId, userId: context.userId, success, latency },
      'Tool usage recorded for routing'
    );
  }

  /**
   * Get the user's most successful tools for suggestions
   */
  async getUserPreferredTools(
    userId: string,
    count: number = 5
  ): Promise<string[]> {
    const tracker = getToolSuccessTracker();
    const topTools = await tracker.getTopTools(userId, count);
    return topTools.map((t) => t.toolId);
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let memoryAwareRouterInstance: MemoryAwareRouter | null = null;

export function getMemoryAwareRouter(): MemoryAwareRouter {
  if (!memoryAwareRouterInstance) {
    memoryAwareRouterInstance = new MemoryAwareRouter();
  }
  return memoryAwareRouterInstance;
}

export function resetMemoryAwareRouter(): void {
  memoryAwareRouterInstance = null;
}

export default {
  MemoryAwareRouter,
  getMemoryAwareRouter,
  resetMemoryAwareRouter,
};

/**
 * Tool Success Tracker
 *
 * Learns which tools work best for which users and contexts.
 * This enables personalized tool selection and routing.
 *
 * Tracks:
 * - Per-user tool success rates
 * - Success by topic/context
 * - Success by emotional state
 * - Success by time of day
 * - Tool latency patterns
 *
 * @module tools/tool-success-tracker
 */

import { getFirestoreDb } from '../services/superhuman/firestore-utils.js';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'ToolSuccessTracker' });

// ============================================================================
// TYPES
// ============================================================================

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

export interface ToolCall {
  toolId: string;
  userId: string;
  timestamp: Date;
  success: boolean;
  latency: number; // ms
  context?: {
    topic?: string;
    emotion?: string;
    personaId?: string;
    sessionId?: string;
  };
}

export interface ToolMetrics {
  toolId: string;
  userId: string;

  // Overall stats
  totalCalls: number;
  successfulCalls: number;
  averageLatency: number;

  // By context
  successByTopic: Record<string, { success: number; total: number }>;
  successByEmotion: Record<string, { success: number; total: number }>;
  successByPersona: Record<string, { success: number; total: number }>;
  successByTimeOfDay: Record<TimeOfDay, { success: number; total: number }>;

  // Trends
  recentSuccessRate: number; // Last 20 calls
  trend: 'improving' | 'stable' | 'declining';

  // Last updated
  updatedAt: Date;
}

export interface ToolRecommendation {
  toolId: string;
  confidence: number;
  reason: string;
  expectedSuccessRate: number;
}

// ============================================================================
// TOOL SUCCESS TRACKER
// ============================================================================

export class ToolSuccessTracker {
  private db: FirebaseFirestore.Firestore | null;
  private metricsCache: Map<string, ToolMetrics> = new Map();
  private recentCalls: Map<string, ToolCall[]> = new Map();
  private cacheTTL = 5 * 60 * 1000; // 5 minutes
  private cacheExpiry: Map<string, number> = new Map();

  constructor() {
    this.db = getFirestoreDb();
  }

  // ==========================================================================
  // RECORDING
  // ==========================================================================

  /**
   * Record a tool call
   */
  async recordCall(call: ToolCall): Promise<void> {
    const key = `${call.userId}:${call.toolId}`;

    // Add to recent calls (in-memory)
    const recent = this.recentCalls.get(key) || [];
    recent.push(call);
    // Keep last 100 calls
    if (recent.length > 100) {
      recent.shift();
    }
    this.recentCalls.set(key, recent);

    // Update metrics
    await this.updateMetrics(call);

    log.debug(
      {
        toolId: call.toolId,
        userId: call.userId,
        success: call.success,
        latency: call.latency,
      },
      'Tool call recorded'
    );
  }

  /**
   * Update metrics for a tool call
   */
  private async updateMetrics(call: ToolCall): Promise<void> {
    const key = `${call.userId}:${call.toolId}`;
    let metrics = await this.getMetrics(call.userId, call.toolId);

    if (!metrics) {
      metrics = this.createEmptyMetrics(call.userId, call.toolId);
    }

    // Update overall stats
    metrics.totalCalls++;
    if (call.success) metrics.successfulCalls++;
    metrics.averageLatency =
      (metrics.averageLatency * (metrics.totalCalls - 1) + call.latency) /
      metrics.totalCalls;

    // Update by topic
    if (call.context?.topic) {
      const topic = call.context.topic;
      if (!metrics.successByTopic[topic]) {
        metrics.successByTopic[topic] = { success: 0, total: 0 };
      }
      metrics.successByTopic[topic].total++;
      if (call.success) metrics.successByTopic[topic].success++;
    }

    // Update by emotion
    if (call.context?.emotion) {
      const emotion = call.context.emotion;
      if (!metrics.successByEmotion[emotion]) {
        metrics.successByEmotion[emotion] = { success: 0, total: 0 };
      }
      metrics.successByEmotion[emotion].total++;
      if (call.success) metrics.successByEmotion[emotion].success++;
    }

    // Update by persona
    if (call.context?.personaId) {
      const persona = call.context.personaId;
      if (!metrics.successByPersona[persona]) {
        metrics.successByPersona[persona] = { success: 0, total: 0 };
      }
      metrics.successByPersona[persona].total++;
      if (call.success) metrics.successByPersona[persona].success++;
    }

    // Update by time of day
    const timeOfDay = this.getTimeOfDay(call.timestamp);
    if (!metrics.successByTimeOfDay[timeOfDay]) {
      metrics.successByTimeOfDay[timeOfDay] = { success: 0, total: 0 };
    }
    metrics.successByTimeOfDay[timeOfDay].total++;
    if (call.success) metrics.successByTimeOfDay[timeOfDay].success++;

    // Calculate recent success rate
    const recentCalls = this.recentCalls.get(key)?.slice(-20) || [];
    const recentSuccesses = recentCalls.filter((c) => c.success).length;
    metrics.recentSuccessRate =
      recentCalls.length > 0 ? recentSuccesses / recentCalls.length : 0;

    // Calculate trend
    metrics.trend = this.calculateTrend(key);

    metrics.updatedAt = new Date();

    // Update cache
    this.metricsCache.set(key, metrics);
    this.cacheExpiry.set(key, Date.now() + this.cacheTTL);

    // Persist to Firestore
    await this.persistMetrics(metrics);
  }

  // ==========================================================================
  // QUERYING
  // ==========================================================================

  /**
   * Get metrics for a user's tool usage
   */
  async getMetrics(userId: string, toolId: string): Promise<ToolMetrics | null> {
    const key = `${userId}:${toolId}`;

    // Check cache
    const expiry = this.cacheExpiry.get(key);
    if (expiry && expiry > Date.now()) {
      return this.metricsCache.get(key) || null;
    }

    // Load from Firestore
    if (this.db) {
      try {
        const doc = await this.db
          .collection('bogle_users')
          .doc(userId)
          .collection('tool_metrics')
          .doc(toolId)
          .get();

        if (doc.exists) {
          const data = doc.data()!;
          const metrics: ToolMetrics = {
            toolId,
            userId,
            totalCalls: data.totalCalls || 0,
            successfulCalls: data.successfulCalls || 0,
            averageLatency: data.averageLatency || 0,
            successByTopic: data.successByTopic || {},
            successByEmotion: data.successByEmotion || {},
            successByPersona: data.successByPersona || {},
            successByTimeOfDay: data.successByTimeOfDay || {},
            recentSuccessRate: data.recentSuccessRate || 0,
            trend: data.trend || 'stable',
            updatedAt: data.updatedAt?.toDate() || new Date(),
          };

          this.metricsCache.set(key, metrics);
          this.cacheExpiry.set(key, Date.now() + this.cacheTTL);
          return metrics;
        }
      } catch (error) {
        log.warn({ error: String(error), userId, toolId }, 'Failed to load tool metrics');
      }
    }

    return null;
  }

  /**
   * Get success rate for a tool in a specific context
   */
  async getContextualSuccessRate(
    userId: string,
    toolId: string,
    context: { topic?: string; emotion?: string; personaId?: string }
  ): Promise<number> {
    const metrics = await this.getMetrics(userId, toolId);
    if (!metrics || metrics.totalCalls < 5) {
      return 0.5; // Default to 50% if not enough data
    }

    let weightedSum = 0;
    let weightCount = 0;

    // Overall rate (weight: 1)
    const overallRate = metrics.successfulCalls / metrics.totalCalls;
    weightedSum += overallRate;
    weightCount += 1;

    // Topic rate (weight: 2)
    if (context.topic && metrics.successByTopic[context.topic]) {
      const { success, total } = metrics.successByTopic[context.topic];
      if (total >= 3) {
        weightedSum += (success / total) * 2;
        weightCount += 2;
      }
    }

    // Emotion rate (weight: 1.5)
    if (context.emotion && metrics.successByEmotion[context.emotion]) {
      const { success, total } = metrics.successByEmotion[context.emotion];
      if (total >= 3) {
        weightedSum += (success / total) * 1.5;
        weightCount += 1.5;
      }
    }

    // Persona rate (weight: 1.5)
    if (context.personaId && metrics.successByPersona[context.personaId]) {
      const { success, total } = metrics.successByPersona[context.personaId];
      if (total >= 3) {
        weightedSum += (success / total) * 1.5;
        weightCount += 1.5;
      }
    }

    // Time of day (weight: 0.5)
    const timeOfDay = this.getTimeOfDay(new Date());
    if (metrics.successByTimeOfDay[timeOfDay]) {
      const { success, total } = metrics.successByTimeOfDay[timeOfDay];
      if (total >= 3) {
        weightedSum += (success / total) * 0.5;
        weightCount += 0.5;
      }
    }

    return weightedSum / weightCount;
  }

  /**
   * Get tool recommendations for a user in context
   */
  async getRecommendations(
    userId: string,
    availableTools: string[],
    context: { topic?: string; emotion?: string; personaId?: string },
    maxResults: number = 5
  ): Promise<ToolRecommendation[]> {
    const recommendations: ToolRecommendation[] = [];

    for (const toolId of availableTools) {
      const successRate = await this.getContextualSuccessRate(
        userId,
        toolId,
        context
      );
      const metrics = await this.getMetrics(userId, toolId);

      // Generate reason
      let reason = '';
      if (!metrics || metrics.totalCalls < 5) {
        reason = 'Limited usage data';
      } else if (metrics.trend === 'improving') {
        reason = 'Success rate improving';
      } else if (successRate > 0.8) {
        reason = 'High success rate';
      } else if (context.topic && metrics.successByTopic[context.topic]) {
        reason = `Works well for ${context.topic}`;
      } else {
        reason = 'Based on overall usage';
      }

      // Calculate confidence based on data quantity
      const dataConfidence = Math.min(1, (metrics?.totalCalls || 0) / 20);
      const confidence = successRate * dataConfidence;

      recommendations.push({
        toolId,
        confidence,
        reason,
        expectedSuccessRate: successRate,
      });
    }

    // Sort by confidence and return top N
    return recommendations
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxResults);
  }

  /**
   * Get user's most successful tools
   */
  async getTopTools(
    userId: string,
    count: number = 5
  ): Promise<Array<{ toolId: string; successRate: number }>> {
    const toolMetrics: Array<{ toolId: string; successRate: number }> = [];

    // Load all metrics for user
    if (this.db) {
      const snapshot = await this.db
        .collection('bogle_users')
        .doc(userId)
        .collection('tool_metrics')
        .get();

      for (const doc of snapshot.docs) {
        const data = doc.data();
        if (data.totalCalls >= 5) {
          toolMetrics.push({
            toolId: doc.id,
            successRate: data.successfulCalls / data.totalCalls,
          });
        }
      }
    }

    return toolMetrics
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, count);
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private createEmptyMetrics(userId: string, toolId: string): ToolMetrics {
    return {
      toolId,
      userId,
      totalCalls: 0,
      successfulCalls: 0,
      averageLatency: 0,
      successByTopic: {},
      successByEmotion: {},
      successByPersona: {},
      successByTimeOfDay: {
        morning: { success: 0, total: 0 },
        afternoon: { success: 0, total: 0 },
        evening: { success: 0, total: 0 },
        night: { success: 0, total: 0 },
      },
      recentSuccessRate: 0,
      trend: 'stable',
      updatedAt: new Date(),
    };
  }

  private getTimeOfDay(date: Date): TimeOfDay {
    const hour = date.getHours();
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }

  private calculateTrend(key: string): 'improving' | 'stable' | 'declining' {
    const calls = this.recentCalls.get(key) || [];
    if (calls.length < 10) return 'stable';

    const firstHalf = calls.slice(0, Math.floor(calls.length / 2));
    const secondHalf = calls.slice(Math.floor(calls.length / 2));

    const firstRate =
      firstHalf.filter((c) => c.success).length / firstHalf.length;
    const secondRate =
      secondHalf.filter((c) => c.success).length / secondHalf.length;

    const diff = secondRate - firstRate;
    if (diff > 0.1) return 'improving';
    if (diff < -0.1) return 'declining';
    return 'stable';
  }

  private async persistMetrics(metrics: ToolMetrics): Promise<void> {
    if (!this.db) return;

    try {
      await this.db
        .collection('bogle_users')
        .doc(metrics.userId)
        .collection('tool_metrics')
        .doc(metrics.toolId)
        .set({
          ...metrics,
          updatedAt: metrics.updatedAt,
        });
    } catch (error) {
      log.warn(
        { error: String(error), toolId: metrics.toolId, userId: metrics.userId },
        'Failed to persist tool metrics'
      );
    }
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let toolSuccessTrackerInstance: ToolSuccessTracker | null = null;

export function getToolSuccessTracker(): ToolSuccessTracker {
  if (!toolSuccessTrackerInstance) {
    toolSuccessTrackerInstance = new ToolSuccessTracker();
  }
  return toolSuccessTrackerInstance;
}

export function resetToolSuccessTracker(): void {
  toolSuccessTrackerInstance = null;
}

export default {
  ToolSuccessTracker,
  getToolSuccessTracker,
  resetToolSuccessTracker,
};

/**
 * Humanization Analytics
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Track and analyze humanization feature performance:
 * - Which features are applied most/least
 * - User response to humanization (engagement metrics)
 * - A/B testing for fine-tuning
 * - Quality metrics for each feature
 *
 * @module @ferni/humanization/analytics
 */

import { createLogger } from '../../utils/safe-logger.js';

const logger = createLogger({ module: 'HumanizationAnalytics' });

// ============================================================================
// TYPES
// ============================================================================

export interface HumanizationEvent {
  type: HumanizationEventType;
  feature: HumanizationFeature;
  sessionId: string;
  userId?: string;
  timestamp: Date;

  // Feature-specific data
  data?: Record<string, unknown>;

  // Context
  turnCount?: number;
  comfortLevel?: number;
  emotionalContext?: string;
}

export type HumanizationEventType =
  | 'applied' // Feature was applied
  | 'skipped' // Feature was skipped (threshold not met)
  | 'triggered' // Feature triggered (for detection features)
  | 'acknowledged'; // User acknowledged/responded

export type HumanizationFeature =
  | 'voice_print_detection'
  | 'cross_session_acknowledgment'
  | 'breathing_sync'
  | 'emotional_leading'
  | 'ambient_acknowledgment'
  | 'self_correction'
  | 'disfluency'
  | 'filler_words'
  | 'hedging'
  | 'catching_yourself'
  | 'phonetic_mirroring'
  | 'vocal_fatigue'
  | 'comfort_progression';

export interface FeatureStats {
  feature: HumanizationFeature;

  // Counts
  totalApplied: number;
  totalSkipped: number;
  totalTriggered: number;
  totalAcknowledged: number;

  // Rates
  applicationRate: number; // applied / (applied + skipped)
  acknowledgmentRate: number; // acknowledged / triggered

  // Timing
  avgTimeBetweenApplications: number; // ms
  lastApplied: Date | null;

  // Context breakdown
  byEmotionalContext: Record<string, number>;
  byComfortLevel: Record<string, number>; // 'low' | 'medium' | 'high'
}

export interface SessionAnalytics {
  sessionId: string;
  userId?: string;
  startTime: Date;
  endTime?: Date;

  // Overall metrics
  totalHumanizations: number;
  uniqueFeaturesUsed: number;
  avgHumanizationsPerTurn: number;

  // Feature breakdown
  featureStats: Map<HumanizationFeature, FeatureStats>;

  // User engagement indicators
  userEngagementScore: number; // 0-1
  conversationLengthFactor: number; // vs average

  // Breathing sync specific
  breathingSyncQuality: number[]; // Quality scores over session
  avgBreathingSyncQuality: number;

  // Voice print specific
  voicePrintCalibrated: boolean;
  voiceStateInsightsGiven: number;
  crossSessionAcknowledgmentsGiven: number;
}

export interface GlobalAnalytics {
  // Aggregate across all sessions
  totalSessions: number;
  totalHumanizations: number;

  // Feature usage
  featureUsage: Map<HumanizationFeature, number>;
  topFeatures: HumanizationFeature[];
  underutilizedFeatures: HumanizationFeature[];

  // Quality metrics
  avgEngagementScore: number;
  avgBreathingSyncQuality: number;
  voicePrintCalibrationRate: number;

  // Time-based
  humanizationsPerHour: number;
  peakHours: number[];
}

// ============================================================================
// ANALYTICS ENGINE
// ============================================================================

class HumanizationAnalyticsEngine {
  private events: HumanizationEvent[] = [];
  private sessionStats = new Map<string, SessionAnalytics>();
  private maxEventsInMemory = 10000;

  constructor() {
    logger.debug('HumanizationAnalyticsEngine initialized');
  }

  // ==========================================================================
  // EVENT TRACKING
  // ==========================================================================

  /**
   * Record a humanization event
   */
  recordEvent(event: Omit<HumanizationEvent, 'timestamp'>): void {
    const fullEvent: HumanizationEvent = {
      ...event,
      timestamp: new Date(),
    };

    this.events.push(fullEvent);

    // Update session stats
    this.updateSessionStats(fullEvent);

    // Trim events if too many
    if (this.events.length > this.maxEventsInMemory) {
      this.events = this.events.slice(-this.maxEventsInMemory / 2);
    }

    logger.debug(
      {
        type: event.type,
        feature: event.feature,
        sessionId: event.sessionId,
      },
      '📊 Humanization event recorded'
    );
  }

  /**
   * Record that a feature was applied
   */
  recordApplied(
    sessionId: string,
    feature: HumanizationFeature,
    data?: Record<string, unknown>,
    context?: { turnCount?: number; comfortLevel?: number; emotionalContext?: string }
  ): void {
    this.recordEvent({
      type: 'applied',
      feature,
      sessionId,
      data,
      ...context,
    });
  }

  /**
   * Record that a feature was skipped
   */
  recordSkipped(sessionId: string, feature: HumanizationFeature, reason?: string): void {
    this.recordEvent({
      type: 'skipped',
      feature,
      sessionId,
      data: { reason },
    });
  }

  /**
   * Record that a feature was triggered (for detection features)
   */
  recordTriggered(
    sessionId: string,
    feature: HumanizationFeature,
    data?: Record<string, unknown>
  ): void {
    this.recordEvent({
      type: 'triggered',
      feature,
      sessionId,
      data,
    });
  }

  /**
   * Record that user acknowledged a humanization
   */
  recordAcknowledged(
    sessionId: string,
    feature: HumanizationFeature,
    data?: Record<string, unknown>
  ): void {
    this.recordEvent({
      type: 'acknowledged',
      feature,
      sessionId,
      data,
    });
  }

  // ==========================================================================
  // SESSION MANAGEMENT
  // ==========================================================================

  /**
   * Start tracking a new session
   */
  startSession(sessionId: string, userId?: string): void {
    const stats: SessionAnalytics = {
      sessionId,
      userId,
      startTime: new Date(),
      totalHumanizations: 0,
      uniqueFeaturesUsed: 0,
      avgHumanizationsPerTurn: 0,
      featureStats: new Map(),
      userEngagementScore: 0,
      conversationLengthFactor: 1,
      breathingSyncQuality: [],
      avgBreathingSyncQuality: 0,
      voicePrintCalibrated: false,
      voiceStateInsightsGiven: 0,
      crossSessionAcknowledgmentsGiven: 0,
    };

    this.sessionStats.set(sessionId, stats);
    logger.debug({ sessionId }, '📊 Analytics session started');
  }

  /**
   * End session tracking and get final stats
   */
  endSession(sessionId: string): SessionAnalytics | null {
    const stats = this.sessionStats.get(sessionId);
    if (!stats) return null;

    stats.endTime = new Date();

    // Calculate final metrics
    if (stats.breathingSyncQuality.length > 0) {
      stats.avgBreathingSyncQuality =
        stats.breathingSyncQuality.reduce((a, b) => a + b, 0) / stats.breathingSyncQuality.length;
    }

    stats.uniqueFeaturesUsed = stats.featureStats.size;

    logger.info(
      {
        sessionId,
        totalHumanizations: stats.totalHumanizations,
        uniqueFeatures: stats.uniqueFeaturesUsed,
        avgBreathingSync: stats.avgBreathingSyncQuality.toFixed(2),
      },
      '📊 Analytics session ended'
    );

    return stats;
  }

  // ==========================================================================
  // QUERIES
  // ==========================================================================

  /**
   * Get stats for a specific session
   */
  getSessionStats(sessionId: string): SessionAnalytics | null {
    return this.sessionStats.get(sessionId) || null;
  }

  /**
   * Get feature stats across all sessions
   */
  getFeatureStats(feature: HumanizationFeature): FeatureStats {
    const events = this.events.filter((e) => e.feature === feature);

    const applied = events.filter((e) => e.type === 'applied').length;
    const skipped = events.filter((e) => e.type === 'skipped').length;
    const triggered = events.filter((e) => e.type === 'triggered').length;
    const acknowledged = events.filter((e) => e.type === 'acknowledged').length;

    const appliedEvents = events.filter((e) => e.type === 'applied');
    let avgTimeBetween = 0;
    if (appliedEvents.length > 1) {
      const sorted = appliedEvents.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      let totalTime = 0;
      for (let i = 1; i < sorted.length; i++) {
        totalTime += sorted[i].timestamp.getTime() - sorted[i - 1].timestamp.getTime();
      }
      avgTimeBetween = totalTime / (sorted.length - 1);
    }

    // Context breakdown
    const byEmotionalContext: Record<string, number> = {};
    const byComfortLevel: Record<string, number> = {};

    for (const event of appliedEvents) {
      if (event.emotionalContext) {
        byEmotionalContext[event.emotionalContext] =
          (byEmotionalContext[event.emotionalContext] || 0) + 1;
      }
      if (event.comfortLevel !== undefined) {
        const level =
          event.comfortLevel < 0.35 ? 'low' : event.comfortLevel < 0.65 ? 'medium' : 'high';
        byComfortLevel[level] = (byComfortLevel[level] || 0) + 1;
      }
    }

    return {
      feature,
      totalApplied: applied,
      totalSkipped: skipped,
      totalTriggered: triggered,
      totalAcknowledged: acknowledged,
      applicationRate: applied + skipped > 0 ? applied / (applied + skipped) : 0,
      acknowledgmentRate: triggered > 0 ? acknowledged / triggered : 0,
      avgTimeBetweenApplications: avgTimeBetween,
      lastApplied:
        appliedEvents.length > 0 ? appliedEvents[appliedEvents.length - 1].timestamp : null,
      byEmotionalContext,
      byComfortLevel,
    };
  }

  /**
   * Get global analytics summary
   */
  getGlobalAnalytics(): GlobalAnalytics {
    const featureUsage = new Map<HumanizationFeature, number>();
    const allFeatures: HumanizationFeature[] = [
      'voice_print_detection',
      'cross_session_acknowledgment',
      'breathing_sync',
      'emotional_leading',
      'ambient_acknowledgment',
      'self_correction',
      'disfluency',
      'filler_words',
      'hedging',
      'catching_yourself',
      'phonetic_mirroring',
      'vocal_fatigue',
      'comfort_progression',
    ];

    for (const feature of allFeatures) {
      const count = this.events.filter((e) => e.feature === feature && e.type === 'applied').length;
      featureUsage.set(feature, count);
    }

    // Sort features by usage
    const sortedFeatures = [...featureUsage.entries()].sort((a, b) => b[1] - a[1]);
    const topFeatures = sortedFeatures.slice(0, 5).map(([f]) => f);
    const underutilizedFeatures = sortedFeatures.filter(([, count]) => count < 10).map(([f]) => f);

    // Calculate averages
    const sessions = [...this.sessionStats.values()];
    const avgEngagement =
      sessions.length > 0
        ? sessions.reduce((sum, s) => sum + s.userEngagementScore, 0) / sessions.length
        : 0;
    const avgBreathingSync =
      sessions.length > 0
        ? sessions.reduce((sum, s) => sum + s.avgBreathingSyncQuality, 0) / sessions.length
        : 0;
    const voicePrintCalibrationRate =
      sessions.length > 0
        ? sessions.filter((s) => s.voicePrintCalibrated).length / sessions.length
        : 0;

    // Time-based
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const recentEvents = this.events.filter((e) => e.timestamp.getTime() > oneHourAgo);
    const humanizationsPerHour = recentEvents.filter((e) => e.type === 'applied').length;

    // Peak hours (simplified)
    const hourCounts: Record<number, number> = {};
    for (const event of this.events) {
      const hour = event.timestamp.getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    }
    const peakHours = Object.entries(hourCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([h]) => parseInt(h, 10));

    return {
      totalSessions: sessions.length,
      totalHumanizations: this.events.filter((e) => e.type === 'applied').length,
      featureUsage,
      topFeatures,
      underutilizedFeatures,
      avgEngagementScore: avgEngagement,
      avgBreathingSyncQuality: avgBreathingSync,
      voicePrintCalibrationRate,
      humanizationsPerHour,
      peakHours,
    };
  }

  /**
   * Get recent events for debugging
   */
  getRecentEvents(count = 50): HumanizationEvent[] {
    return this.events.slice(-count);
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private updateSessionStats(event: HumanizationEvent): void {
    let stats = this.sessionStats.get(event.sessionId);
    if (!stats) {
      // Auto-create session if needed
      this.startSession(event.sessionId);
      stats = this.sessionStats.get(event.sessionId)!;
    }

    if (event.type === 'applied') {
      stats.totalHumanizations++;

      // Update feature stats
      let featureStats = stats.featureStats.get(event.feature);
      if (!featureStats) {
        featureStats = this.createEmptyFeatureStats(event.feature);
        stats.featureStats.set(event.feature, featureStats);
      }
      featureStats.totalApplied++;
      featureStats.lastApplied = event.timestamp;

      // Update context breakdowns
      if (event.emotionalContext) {
        featureStats.byEmotionalContext[event.emotionalContext] =
          (featureStats.byEmotionalContext[event.emotionalContext] || 0) + 1;
      }
      if (event.comfortLevel !== undefined) {
        const level =
          event.comfortLevel < 0.35 ? 'low' : event.comfortLevel < 0.65 ? 'medium' : 'high';
        featureStats.byComfortLevel[level] = (featureStats.byComfortLevel[level] || 0) + 1;
      }

      // Special tracking
      if (event.feature === 'breathing_sync' && event.data?.syncQuality) {
        stats.breathingSyncQuality.push(event.data.syncQuality as number);
      }
      if (event.feature === 'voice_print_detection') {
        stats.voiceStateInsightsGiven++;
      }
      if (event.feature === 'cross_session_acknowledgment') {
        stats.crossSessionAcknowledgmentsGiven++;
      }
    }
  }

  private createEmptyFeatureStats(feature: HumanizationFeature): FeatureStats {
    return {
      feature,
      totalApplied: 0,
      totalSkipped: 0,
      totalTriggered: 0,
      totalAcknowledged: 0,
      applicationRate: 0,
      acknowledgmentRate: 0,
      avgTimeBetweenApplications: 0,
      lastApplied: null,
      byEmotionalContext: {},
      byComfortLevel: {},
    };
  }

  /**
   * Mark voice print as calibrated for session
   */
  markVoicePrintCalibrated(sessionId: string): void {
    const stats = this.sessionStats.get(sessionId);
    if (stats) {
      stats.voicePrintCalibrated = true;
    }
  }

  /**
   * Update engagement score for session
   */
  updateEngagementScore(sessionId: string, score: number): void {
    const stats = this.sessionStats.get(sessionId);
    if (stats) {
      stats.userEngagementScore = score;
    }
  }

  /**
   * Reset all analytics (for testing)
   */
  reset(): void {
    this.events = [];
    this.sessionStats.clear();
    logger.debug('HumanizationAnalyticsEngine reset');
  }
}

// ============================================================================
// SINGLETON & EXPORTS
// ============================================================================

let analyticsInstance: HumanizationAnalyticsEngine | null = null;

export function getHumanizationAnalytics(): HumanizationAnalyticsEngine {
  if (!analyticsInstance) {
    analyticsInstance = new HumanizationAnalyticsEngine();
  }
  return analyticsInstance;
}

export function resetHumanizationAnalytics(): void {
  if (analyticsInstance) {
    analyticsInstance.reset();
  }
  analyticsInstance = null;
}

// Convenience exports
export const humanizationAnalytics = {
  recordApplied: (
    sessionId: string,
    feature: HumanizationFeature,
    data?: Record<string, unknown>,
    context?: { turnCount?: number; comfortLevel?: number; emotionalContext?: string }
  ) => getHumanizationAnalytics().recordApplied(sessionId, feature, data, context),

  recordSkipped: (sessionId: string, feature: HumanizationFeature, reason?: string) =>
    getHumanizationAnalytics().recordSkipped(sessionId, feature, reason),

  recordTriggered: (
    sessionId: string,
    feature: HumanizationFeature,
    data?: Record<string, unknown>
  ) => getHumanizationAnalytics().recordTriggered(sessionId, feature, data),

  recordAcknowledged: (
    sessionId: string,
    feature: HumanizationFeature,
    data?: Record<string, unknown>
  ) => getHumanizationAnalytics().recordAcknowledged(sessionId, feature, data),

  startSession: (sessionId: string, userId?: string) =>
    getHumanizationAnalytics().startSession(sessionId, userId),

  endSession: (sessionId: string) => getHumanizationAnalytics().endSession(sessionId),

  getStats: () => getHumanizationAnalytics().getGlobalAnalytics(),
};

export type { HumanizationAnalyticsEngine };

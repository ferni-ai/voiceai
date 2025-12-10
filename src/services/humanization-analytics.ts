/**
 * Humanization Analytics Service
 *
 * Tracks the effectiveness of humanization features:
 * - Which features are applied and how often
 * - Correlation with engagement metrics
 * - Per-persona performance data
 * - Learning signals for parameter tuning
 *
 * This data feeds into the agent evolution system to
 * automatically improve humanization over time.
 *
 * PERSISTENCE: Aggregated metrics are persisted to Firestore.
 */

import * as admin from 'firebase-admin';
import { getLogger } from '../utils/safe-logger.js';

// ============================================================================
// FIRESTORE SETUP
// ============================================================================

const METRICS_COLLECTION = 'humanization_metrics';
const SESSION_ANALYTICS_COLLECTION = 'humanization_session_analytics';

function getFirestore(): admin.firestore.Firestore | null {
  try {
    return admin.firestore();
  } catch {
    return null;
  }
}

// ============================================================================
// TYPES
// ============================================================================

export interface HumanizationEvent {
  timestamp: number;
  sessionId: string;
  personaId: string;
  turnNumber: number;
  featureType: HumanizationFeatureType;
  featureDetails: Record<string, unknown>;
}

export type HumanizationFeatureType =
  | 'disfluency'
  | 'hedging'
  | 'backchannel'
  | 'memory_callback'
  | 'emotional_echo'
  | 'vocabulary_mirror'
  | 'question_injection'
  | 'silence_handling'
  | 'thinking_phrase'
  | 'self_correction';

export interface EngagementSignal {
  timestamp: number;
  sessionId: string;
  personaId: string;
  turnNumber: number;
  signalType: EngagementSignalType;
  value: number | string;
}

export type EngagementSignalType =
  | 'response_length' // User's response length (longer = more engaged)
  | 'response_time' // How quickly user responded
  | 'sentiment_shift' // Change in user sentiment
  | 'follow_up_question' // User asked a follow-up
  | 'personal_sharing' // User shared something personal
  | 'explicit_positive' // "That's great", "Thank you"
  | 'explicit_negative' // "I don't like that", "Stop"
  | 'topic_depth' // How deep into a topic conversation went
  | 'session_duration' // Total session length
  | 'return_rate'; // Did user return for another session?

export interface HumanizationMetrics {
  personaId: string;
  totalSessions: number;
  totalTurns: number;
  featureUsage: Record<HumanizationFeatureType, number>;
  engagementCorrelations: FeatureEngagementCorrelation[];
  lastUpdated: number;
}

export interface FeatureEngagementCorrelation {
  featureType: HumanizationFeatureType;
  engagementSignal: EngagementSignalType;
  correlationScore: number; // -1 to 1 (negative = bad, positive = good)
  sampleSize: number;
  confidence: number; // 0 to 1
}

export interface SessionAnalytics {
  sessionId: string;
  personaId: string;
  startTime: number;
  endTime?: number;
  events: HumanizationEvent[];
  signals: EngagementSignal[];
  summary?: SessionSummary;
}

export interface SessionSummary {
  totalTurns: number;
  averageResponseLength: number;
  sentimentTrend: 'improving' | 'stable' | 'declining' | 'volatile';
  mostEffectiveFeature?: HumanizationFeatureType;
  leastEffectiveFeature?: HumanizationFeatureType;
  overallEngagement: 'high' | 'medium' | 'low';
}

// ============================================================================
// ANALYTICS SERVICE
// ============================================================================

class HumanizationAnalyticsService {
  private sessions = new Map<string, SessionAnalytics>();
  private aggregatedMetrics = new Map<string, HumanizationMetrics>();
  private initialized = false;
  private loadedPersonas = new Set<string>();

  /**
   * Initialize the analytics service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.initialized = true;
    getLogger().info('📊 Humanization analytics service initialized');
  }

  /**
   * Load metrics for a persona from Firestore
   */
  private async loadMetrics(personaId: string): Promise<HumanizationMetrics | null> {
    if (this.loadedPersonas.has(personaId)) {
      return this.aggregatedMetrics.get(personaId) || null;
    }

    const db = getFirestore();
    if (!db) {
      this.loadedPersonas.add(personaId);
      return null;
    }

    try {
      const doc = await db.collection(METRICS_COLLECTION).doc(personaId).get();
      if (doc.exists) {
        const data = doc.data() as HumanizationMetrics;
        this.aggregatedMetrics.set(personaId, data);
        this.loadedPersonas.add(personaId);
        return data;
      }
    } catch (error) {
      getLogger().error({ error, personaId }, 'Failed to load humanization metrics');
    }

    this.loadedPersonas.add(personaId);
    return null;
  }

  /**
   * Save metrics for a persona to Firestore
   */
  private async saveMetrics(personaId: string, metrics: HumanizationMetrics): Promise<void> {
    const db = getFirestore();
    if (!db) return;

    try {
      await db.collection(METRICS_COLLECTION).doc(personaId).set(metrics);
    } catch (error) {
      getLogger().error({ error, personaId }, 'Failed to save humanization metrics');
    }
  }

  /**
   * Save session analytics to Firestore
   */
  private async saveSessionAnalytics(session: SessionAnalytics): Promise<void> {
    const db = getFirestore();
    if (!db) return;

    try {
      await db
        .collection(SESSION_ANALYTICS_COLLECTION)
        .doc(session.sessionId)
        .set({
          ...session,
          // Only save summary and key stats, not raw events (too much data)
          events: session.events.slice(-50), // Keep last 50 events
          signals: session.signals.slice(-50),
        });
    } catch (error) {
      getLogger().error(
        { error, sessionId: session.sessionId },
        'Failed to save session analytics'
      );
    }
  }

  /**
   * Start tracking a new session
   */
  startSession(sessionId: string, personaId: string): void {
    this.sessions.set(sessionId, {
      sessionId,
      personaId,
      startTime: Date.now(),
      events: [],
      signals: [],
    });

    getLogger().debug({ sessionId, personaId }, 'Started humanization tracking for session');
  }

  /**
   * Record a humanization feature being applied
   */
  recordFeatureUsage(
    sessionId: string,
    personaId: string,
    turnNumber: number,
    featureType: HumanizationFeatureType,
    details: Record<string, unknown> = {}
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      // Session not tracked, create ad-hoc entry
      this.startSession(sessionId, personaId);
    }

    const event: HumanizationEvent = {
      timestamp: Date.now(),
      sessionId,
      personaId,
      turnNumber,
      featureType,
      featureDetails: details,
    };

    this.sessions.get(sessionId)?.events.push(event);

    getLogger().debug(
      { sessionId, featureType, turnNumber },
      'Recorded humanization feature usage'
    );
  }

  /**
   * Record an engagement signal from the user
   */
  recordEngagementSignal(
    sessionId: string,
    personaId: string,
    turnNumber: number,
    signalType: EngagementSignalType,
    value: number | string
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.startSession(sessionId, personaId);
    }

    const signal: EngagementSignal = {
      timestamp: Date.now(),
      sessionId,
      personaId,
      turnNumber,
      signalType,
      value,
    };

    this.sessions.get(sessionId)?.signals.push(signal);
  }

  /**
   * End session and compute summary
   */
  endSession(sessionId: string): SessionSummary | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    session.endTime = Date.now();
    session.summary = this.computeSessionSummary(session);

    // Update aggregated metrics
    this.updateAggregatedMetrics(session);

    // Persist session analytics to Firestore
    void this.saveSessionAnalytics(session);

    getLogger().info(
      {
        sessionId,
        personaId: session.personaId,
        turns: session.summary.totalTurns,
        engagement: session.summary.overallEngagement,
        effectiveFeature: session.summary.mostEffectiveFeature,
      },
      'Humanization session completed'
    );

    return session.summary;
  }

  /**
   * Compute session summary from events and signals
   */
  private computeSessionSummary(session: SessionAnalytics): SessionSummary {
    const { events, signals } = session;

    // Calculate total turns
    const turnNumbers = new Set([
      ...events.map((e) => e.turnNumber),
      ...signals.map((s) => s.turnNumber),
    ]);
    const totalTurns = turnNumbers.size;

    // Calculate average response length
    const responseLengths = signals
      .filter((s) => s.signalType === 'response_length')
      .map((s) => s.value as number);
    const averageResponseLength =
      responseLengths.length > 0
        ? responseLengths.reduce((a, b) => a + b, 0) / responseLengths.length
        : 0;

    // Calculate sentiment trend
    const sentimentShifts = signals
      .filter((s) => s.signalType === 'sentiment_shift')
      .map((s) => s.value as number);
    const sentimentTrend = this.calculateSentimentTrend(sentimentShifts);

    // Calculate feature effectiveness
    const featureEffectiveness = this.calculateFeatureEffectiveness(events, signals);
    const sortedFeatures = Object.entries(featureEffectiveness).sort(([, a], [, b]) => b - a);

    const mostEffectiveFeature =
      sortedFeatures.length > 0 ? (sortedFeatures[0][0] as HumanizationFeatureType) : undefined;

    const leastEffectiveFeature =
      sortedFeatures.length > 1
        ? (sortedFeatures[sortedFeatures.length - 1][0] as HumanizationFeatureType)
        : undefined;

    // Calculate overall engagement
    const overallEngagement = this.calculateOverallEngagement(signals, totalTurns);

    return {
      totalTurns,
      averageResponseLength,
      sentimentTrend,
      mostEffectiveFeature,
      leastEffectiveFeature,
      overallEngagement,
    };
  }

  /**
   * Calculate sentiment trend from shift values
   */
  private calculateSentimentTrend(
    shifts: number[]
  ): 'improving' | 'stable' | 'declining' | 'volatile' {
    if (shifts.length === 0) return 'stable';

    const avgShift = shifts.reduce((a, b) => a + b, 0) / shifts.length;
    const variance =
      shifts.reduce((sum, val) => sum + Math.pow(val - avgShift, 2), 0) / shifts.length;

    if (variance > 0.5) return 'volatile';
    if (avgShift > 0.1) return 'improving';
    if (avgShift < -0.1) return 'declining';
    return 'stable';
  }

  /**
   * Calculate feature effectiveness based on engagement correlation
   */
  private calculateFeatureEffectiveness(
    events: HumanizationEvent[],
    signals: EngagementSignal[]
  ): Record<HumanizationFeatureType, number> {
    const effectiveness: Partial<Record<HumanizationFeatureType, number>> = {};

    // Group events by feature type
    const featureEvents = events.reduce(
      (acc, event) => {
        if (!acc[event.featureType]) {
          acc[event.featureType] = [];
        }
        acc[event.featureType].push(event);
        return acc;
      },
      {} as Record<HumanizationFeatureType, HumanizationEvent[]>
    );

    // For each feature type, calculate correlation with positive engagement
    for (const [featureType, featureEvts] of Object.entries(featureEvents)) {
      const turnNumbers = featureEvts.map((e) => e.turnNumber);

      // Get engagement signals that occurred around these turns
      const relevantSignals = signals.filter((s) =>
        turnNumbers.some((t) => Math.abs(s.turnNumber - t) <= 1)
      );

      // Calculate effectiveness score
      let score = 0;
      for (const signal of relevantSignals) {
        if (signal.signalType === 'explicit_positive') score += 1;
        if (signal.signalType === 'explicit_negative') score -= 1;
        if (signal.signalType === 'follow_up_question') score += 0.5;
        if (signal.signalType === 'personal_sharing') score += 0.5;
        if (signal.signalType === 'response_length') {
          const length = signal.value as number;
          score += length > 100 ? 0.3 : length > 50 ? 0.1 : 0;
        }
      }

      effectiveness[featureType as HumanizationFeatureType] =
        featureEvts.length > 0 ? score / featureEvts.length : 0;
    }

    return effectiveness as Record<HumanizationFeatureType, number>;
  }

  /**
   * Calculate overall engagement level
   */
  private calculateOverallEngagement(
    signals: EngagementSignal[],
    totalTurns: number
  ): 'high' | 'medium' | 'low' {
    if (totalTurns === 0) return 'low';

    let engagementScore = 0;

    for (const signal of signals) {
      switch (signal.signalType) {
        case 'explicit_positive':
          engagementScore += 2;
          break;
        case 'follow_up_question':
          engagementScore += 1.5;
          break;
        case 'personal_sharing':
          engagementScore += 1.5;
          break;
        case 'response_length':
          engagementScore += (signal.value as number) > 100 ? 1 : 0.5;
          break;
        case 'explicit_negative':
          engagementScore -= 2;
          break;
      }
    }

    const normalizedScore = engagementScore / totalTurns;

    if (normalizedScore >= 1) return 'high';
    if (normalizedScore >= 0.3) return 'medium';
    return 'low';
  }

  /**
   * Update aggregated metrics for a persona
   */
  private updateAggregatedMetrics(session: SessionAnalytics): void {
    let metrics = this.aggregatedMetrics.get(session.personaId);

    if (!metrics) {
      metrics = {
        personaId: session.personaId,
        totalSessions: 0,
        totalTurns: 0,
        featureUsage: {} as Record<HumanizationFeatureType, number>,
        engagementCorrelations: [],
        lastUpdated: Date.now(),
      };
    }

    // Update counts
    metrics.totalSessions++;
    metrics.totalTurns += session.summary?.totalTurns || 0;

    // Update feature usage
    for (const event of session.events) {
      metrics.featureUsage[event.featureType] = (metrics.featureUsage[event.featureType] || 0) + 1;
    }

    metrics.lastUpdated = Date.now();
    this.aggregatedMetrics.set(session.personaId, metrics);

    // Persist to Firestore
    void this.saveMetrics(session.personaId, metrics);
  }

  /**
   * Get metrics for a specific persona (sync - from cache)
   */
  getPersonaMetrics(personaId: string): HumanizationMetrics | undefined {
    // Fire-and-forget load if not already loaded
    if (!this.loadedPersonas.has(personaId)) {
      void this.loadMetrics(personaId);
    }
    return this.aggregatedMetrics.get(personaId);
  }

  /**
   * Get metrics for a specific persona (async - loads from Firestore)
   */
  async getPersonaMetricsAsync(personaId: string): Promise<HumanizationMetrics | null> {
    const cached = this.aggregatedMetrics.get(personaId);
    if (cached) return cached;

    return this.loadMetrics(personaId);
  }

  /**
   * Get recommendations for parameter tuning based on analytics
   */
  getParameterRecommendations(personaId: string): ParameterRecommendation[] {
    const metrics = this.aggregatedMetrics.get(personaId);
    if (!metrics || metrics.totalSessions < 5) {
      return []; // Not enough data
    }

    const recommendations: ParameterRecommendation[] = [];

    // Analyze feature usage vs engagement correlations
    for (const correlation of metrics.engagementCorrelations) {
      if (correlation.confidence < 0.6) continue;

      if (correlation.correlationScore < -0.3) {
        // Feature is hurting engagement
        recommendations.push({
          featureType: correlation.featureType,
          recommendation: 'decrease',
          currentUsage: metrics.featureUsage[correlation.featureType] || 0,
          suggestedChange: -0.1,
          reason: `${correlation.featureType} correlates negatively with ${correlation.engagementSignal}`,
          confidence: correlation.confidence,
        });
      } else if (correlation.correlationScore > 0.3) {
        // Feature is helping engagement
        recommendations.push({
          featureType: correlation.featureType,
          recommendation: 'increase',
          currentUsage: metrics.featureUsage[correlation.featureType] || 0,
          suggestedChange: 0.1,
          reason: `${correlation.featureType} correlates positively with ${correlation.engagementSignal}`,
          confidence: correlation.confidence,
        });
      }
    }

    return recommendations;
  }

  /**
   * Export analytics data for the evolution system
   */
  exportForEvolution(personaId: string): EvolutionLearningSignal | null {
    const metrics = this.aggregatedMetrics.get(personaId);
    if (!metrics) return null;

    return {
      personaId,
      signalType: 'humanization_analytics',
      timestamp: Date.now(),
      data: {
        totalSessions: metrics.totalSessions,
        totalTurns: metrics.totalTurns,
        featureUsage: metrics.featureUsage,
        recommendations: this.getParameterRecommendations(personaId),
      },
    };
  }

  /**
   * Reset analytics (for testing)
   */
  reset(): void {
    this.sessions.clear();
    this.aggregatedMetrics.clear();
    getLogger().debug('Humanization analytics reset');
  }
}

// ============================================================================
// ADDITIONAL TYPES
// ============================================================================

export interface ParameterRecommendation {
  featureType: HumanizationFeatureType;
  recommendation: 'increase' | 'decrease' | 'maintain';
  currentUsage: number;
  suggestedChange: number;
  reason: string;
  confidence: number;
}

export interface EvolutionLearningSignal {
  personaId: string;
  signalType: string;
  timestamp: number;
  data: {
    totalSessions: number;
    totalTurns: number;
    featureUsage: Record<HumanizationFeatureType, number>;
    recommendations: ParameterRecommendation[];
  };
}

// ============================================================================
// SINGLETON
// ============================================================================

let analyticsInstance: HumanizationAnalyticsService | null = null;

export function getHumanizationAnalytics(): HumanizationAnalyticsService {
  if (!analyticsInstance) {
    analyticsInstance = new HumanizationAnalyticsService();
  }
  return analyticsInstance;
}

export async function initializeHumanizationAnalytics(): Promise<HumanizationAnalyticsService> {
  const analytics = getHumanizationAnalytics();
  await analytics.initialize();
  return analytics;
}

export function resetHumanizationAnalytics(): void {
  if (analyticsInstance) {
    analyticsInstance.reset();
  }
}

export default {
  getHumanizationAnalytics,
  initializeHumanizationAnalytics,
  resetHumanizationAnalytics,
};

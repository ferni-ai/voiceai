/**
 * Predictive Intelligence V4.0
 *
 * Implements "Better than Human" predictive capabilities:
 * - Behavioral Forecasting (anticipate user needs)
 * - Crisis Detection (early warning for emotional distress)
 * - Growth Pattern Recognition (track progress toward goals)
 *
 * Architecture:
 * ```
 * ┌────────────────────────────────────────────────────────────┐
 * │                 Predictive Intelligence V4.0               │
 * │                                                            │
 * │  ┌──────────────────┐  ┌──────────────────────────────┐  │
 * │  │    Behavioral    │  │      Crisis Detection        │  │
 * │  │   Forecasting    │  │   (Early Warning System)     │  │
 * │  │                  │  │                              │  │
 * │  │  - Habit timing  │  │  - Emotional trajectory      │  │
 * │  │  - Need patterns │  │  - Isolation detection       │  │
 * │  │  - Topic cycles  │  │  - Stress accumulation       │  │
 * │  └──────────────────┘  └──────────────────────────────┘  │
 * │                                                            │
 * │  ┌──────────────────────────────────────────────────────┐ │
 * │  │              Growth Pattern Recognition               │ │
 * │  │                                                       │ │
 * │  │  - Goal progress tracking  - Breakthrough detection   │ │
 * │  │  - Plateau identification  - Momentum analysis        │ │
 * │  └──────────────────────────────────────────────────────┘ │
 * └────────────────────────────────────────────────────────────┘
 * ```
 *
 * @module intelligence/predictive/predictive-intelligence
 */

import { createLogger } from '../../utils/safe-logger.js';
import { Firestore, FieldValue } from '@google-cloud/firestore';

const log = createLogger({ module: 'PredictiveIntelligence' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Prediction types
 */
export type PredictionType =
  | 'need_anticipation'
  | 'habit_reminder'
  | 'topic_surfacing'
  | 'crisis_warning'
  | 'growth_milestone'
  | 'plateau_alert'
  | 'breakthrough_detected';

/**
 * Prediction confidence levels
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

/**
 * A prediction from the system
 */
export interface Prediction {
  id: string;
  userId: string;
  type: PredictionType;
  /** Human-readable prediction */
  prediction: string;
  /** Confidence level */
  confidence: ConfidenceLevel;
  /** Confidence score (0-1) */
  confidenceScore: number;
  /** Predicted timing (when this should happen) */
  predictedTiming?: Date;
  /** Related entities */
  relatedEntities?: string[];
  /** Supporting evidence */
  evidence: string[];
  /** Recommended actions */
  recommendedActions?: string[];
  /** Priority (1-10, 10 = highest) */
  priority: number;
  /** When this prediction was made */
  createdAt: Date;
  /** When to expire this prediction */
  expiresAt?: Date;
  /** Has this been acted upon */
  actedUpon: boolean;
  /** Outcome tracking */
  outcome?: {
    accurate: boolean;
    notes?: string;
    recordedAt: Date;
  };
}

/**
 * Behavioral pattern detected over time
 */
export interface BehavioralPattern {
  patternId: string;
  userId: string;
  type: 'temporal' | 'topical' | 'emotional' | 'social';
  /** Pattern description */
  description: string;
  /** Frequency (e.g., daily, weekly, monthly) */
  frequency: 'daily' | 'weekly' | 'monthly' | 'seasonal' | 'irregular';
  /** Typical timing (hour of day, day of week, etc.) */
  typicalTiming?: {
    hourOfDay?: number;
    dayOfWeek?: number;
    dayOfMonth?: number;
    weekOfYear?: number;
  };
  /** Confidence in this pattern */
  confidence: number;
  /** Number of observations supporting this pattern */
  observationCount: number;
  /** Last observed */
  lastObserved: Date;
  /** First observed */
  firstObserved: Date;
}

/**
 * Crisis indicators
 */
export interface CrisisIndicators {
  userId: string;
  /** Overall risk level */
  riskLevel: 'low' | 'elevated' | 'high' | 'critical';
  /** Risk score (0-1) */
  riskScore: number;
  /** Individual indicators */
  indicators: {
    emotionalTrajectory: number; // -1 to 1 (negative = declining)
    isolationScore: number; // 0-1 (higher = more isolated)
    stressAccumulation: number; // 0-1 (higher = more stress)
    sleepDisruption: number; // 0-1 (higher = worse sleep)
    engagementDrop: number; // 0-1 (higher = less engagement)
    negativeLanguage: number; // 0-1 (higher = more negative)
  };
  /** Warning signs detected */
  warningSigns: string[];
  /** Recommended interventions */
  recommendedInterventions: string[];
  /** Last updated */
  updatedAt: Date;
}

/**
 * Growth tracking for goals
 */
export interface GrowthTracking {
  userId: string;
  goalId: string;
  goalDescription: string;
  /** Progress percentage (0-100) */
  progressPercent: number;
  /** Progress velocity (change per week) */
  velocity: number;
  /** Current momentum */
  momentum: 'accelerating' | 'steady' | 'decelerating' | 'stalled';
  /** Plateau detection */
  isPlateaued: boolean;
  plateauDurationDays?: number;
  /** Breakthrough detection */
  recentBreakthrough: boolean;
  breakthroughDescription?: string;
  /** Key milestones */
  milestones: Array<{
    description: string;
    achievedAt: Date;
    significance: number;
  }>;
  /** Updated at */
  updatedAt: Date;
}

// ============================================================================
// PREDICTIVE INTELLIGENCE SERVICE
// ============================================================================

/**
 * Main predictive intelligence service
 */
export class PredictiveIntelligenceService {
  private firestore: Firestore;

  constructor(firestore?: Firestore) {
    this.firestore = firestore || new Firestore();
  }

  // ==========================================================================
  // BEHAVIORAL FORECASTING
  // ==========================================================================

  /**
   * Analyze user behavior to detect patterns
   */
  async analyzeBehavioralPatterns(userId: string): Promise<BehavioralPattern[]> {
    const patterns: BehavioralPattern[] = [];

    try {
      // Get recent interactions
      const conversationsRef = this.firestore
        .collection('users')
        .doc(userId)
        .collection('conversations');

      const conversations = await conversationsRef
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get();

      if (conversations.empty) return patterns;

      // Analyze temporal patterns
      const temporalPatterns = this.extractTemporalPatterns(
        userId,
        conversations.docs.map((d) => ({
          createdAt: d.data().createdAt?.toDate?.() || new Date(),
          topics: d.data().topics || [],
          mood: d.data().mood,
        }))
      );
      patterns.push(...temporalPatterns);

      // Analyze topical patterns
      const topicalPatterns = this.extractTopicalPatterns(
        userId,
        conversations.docs.map((d) => ({
          createdAt: d.data().createdAt?.toDate?.() || new Date(),
          topics: d.data().topics || [],
        }))
      );
      patterns.push(...topicalPatterns);

    } catch (error) {
      log.warn({ userId, error: String(error) }, 'Error analyzing behavioral patterns');
    }

    return patterns;
  }

  /**
   * Extract temporal patterns from conversations
   */
  private extractTemporalPatterns(
    userId: string,
    conversations: Array<{ createdAt: Date; topics: string[]; mood?: string }>
  ): BehavioralPattern[] {
    const patterns: BehavioralPattern[] = [];

    // Analyze time of day patterns
    const hourCounts = new Map<number, number>();
    for (const conv of conversations) {
      const hour = conv.createdAt.getHours();
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
    }

    // Find peak hours
    let maxHour = 0;
    let maxCount = 0;
    const hourCountsArray = Array.from(hourCounts.entries());
    for (const [hour, count] of hourCountsArray) {
      if (count > maxCount) {
        maxCount = count;
        maxHour = hour;
      }
    }

    if (maxCount >= 10) {
      patterns.push({
        patternId: `temporal_peak_${userId}`,
        userId,
        type: 'temporal',
        description: `User typically engages around ${maxHour}:00`,
        frequency: 'daily',
        typicalTiming: { hourOfDay: maxHour },
        confidence: Math.min(maxCount / conversations.length, 0.9),
        observationCount: maxCount,
        lastObserved: conversations[0]?.createdAt || new Date(),
        firstObserved: conversations[conversations.length - 1]?.createdAt || new Date(),
      });
    }

    // Analyze day of week patterns
    const dayOfWeekCounts = new Map<number, number>();
    for (const conv of conversations) {
      const day = conv.createdAt.getDay();
      dayOfWeekCounts.set(day, (dayOfWeekCounts.get(day) || 0) + 1);
    }

    const dayOfWeekCountsArray = Array.from(dayOfWeekCounts.entries());
    for (const [day, count] of dayOfWeekCountsArray) {
      if (count >= 15 && count / conversations.length > 0.2) {
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        patterns.push({
          patternId: `weekly_pattern_${day}_${userId}`,
          userId,
          type: 'temporal',
          description: `User frequently engages on ${dayNames[day]}s`,
          frequency: 'weekly',
          typicalTiming: { dayOfWeek: day },
          confidence: count / conversations.length,
          observationCount: count,
          lastObserved: conversations[0]?.createdAt || new Date(),
          firstObserved: conversations[conversations.length - 1]?.createdAt || new Date(),
        });
      }
    }

    return patterns;
  }

  /**
   * Extract topical patterns
   */
  private extractTopicalPatterns(
    userId: string,
    conversations: Array<{ createdAt: Date; topics: string[] }>
  ): BehavioralPattern[] {
    const patterns: BehavioralPattern[] = [];

    // Count topic frequency
    const topicCounts = new Map<string, number>();
    for (const conv of conversations) {
      for (const topic of conv.topics) {
        topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
      }
    }

    // Find recurring topics
    const topicCountsArray = Array.from(topicCounts.entries());
    for (const [topic, count] of topicCountsArray) {
      if (count >= 5 && count / conversations.length > 0.1) {
        patterns.push({
          patternId: `topic_${topic.toLowerCase().replace(/\s+/g, '_')}_${userId}`,
          userId,
          type: 'topical',
          description: `User frequently discusses "${topic}"`,
          frequency: 'irregular',
          confidence: Math.min(count / conversations.length, 0.8),
          observationCount: count,
          lastObserved: conversations[0]?.createdAt || new Date(),
          firstObserved: conversations[conversations.length - 1]?.createdAt || new Date(),
        });
      }
    }

    return patterns;
  }

  /**
   * Generate predictions based on behavioral patterns
   */
  async generatePredictions(userId: string): Promise<Prediction[]> {
    const predictions: Prediction[] = [];
    const now = new Date();

    try {
      // Get behavioral patterns
      const patterns = await this.analyzeBehavioralPatterns(userId);

      // Generate need anticipation predictions
      for (const pattern of patterns) {
        if (pattern.type === 'temporal' && pattern.typicalTiming?.hourOfDay !== undefined) {
          const predictedTime = new Date(now);
          predictedTime.setHours(pattern.typicalTiming.hourOfDay, 0, 0, 0);
          if (predictedTime <= now) {
            predictedTime.setDate(predictedTime.getDate() + 1);
          }

          predictions.push({
            id: `prediction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            userId,
            type: 'need_anticipation',
            prediction: `User typically engages around ${pattern.typicalTiming.hourOfDay}:00. Consider proactive outreach.`,
            confidence: pattern.confidence > 0.7 ? 'high' : pattern.confidence > 0.4 ? 'medium' : 'low',
            confidenceScore: pattern.confidence,
            predictedTiming: predictedTime,
            evidence: [pattern.description],
            priority: Math.round(pattern.confidence * 7),
            createdAt: now,
            expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
            actedUpon: false,
          });
        }

        if (pattern.type === 'topical') {
          predictions.push({
            id: `prediction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            userId,
            type: 'topic_surfacing',
            prediction: pattern.description,
            confidence: pattern.confidence > 0.6 ? 'high' : pattern.confidence > 0.3 ? 'medium' : 'low',
            confidenceScore: pattern.confidence,
            evidence: [`Observed ${pattern.observationCount} times`],
            priority: Math.round(pattern.confidence * 5),
            createdAt: now,
            actedUpon: false,
          });
        }
      }

    } catch (error) {
      log.warn({ userId, error: String(error) }, 'Error generating predictions');
    }

    return predictions;
  }

  // ==========================================================================
  // CRISIS DETECTION
  // ==========================================================================

  /**
   * Analyze user for crisis indicators
   */
  async analyzeCrisisIndicators(userId: string): Promise<CrisisIndicators> {
    const indicators: CrisisIndicators = {
      userId,
      riskLevel: 'low',
      riskScore: 0,
      indicators: {
        emotionalTrajectory: 0,
        isolationScore: 0,
        stressAccumulation: 0,
        sleepDisruption: 0,
        engagementDrop: 0,
        negativeLanguage: 0,
      },
      warningSigns: [],
      recommendedInterventions: [],
      updatedAt: new Date(),
    };

    try {
      // Get recent conversations
      const conversationsRef = this.firestore
        .collection('users')
        .doc(userId)
        .collection('conversations');

      const recentConversations = await conversationsRef
        .orderBy('createdAt', 'desc')
        .limit(30)
        .get();

      if (recentConversations.empty) return indicators;

      const conversations = recentConversations.docs.map((d) => d.data());

      // Analyze emotional trajectory
      const emotions = conversations
        .filter((c) => c.emotionalState || c.mood)
        .map((c) => this.emotionToScore(c.emotionalState || c.mood));

      if (emotions.length >= 5) {
        const recentEmotions = emotions.slice(0, 10);
        const olderEmotions = emotions.slice(10);
        const recentAvg = recentEmotions.reduce((a, b) => a + b, 0) / recentEmotions.length;
        const olderAvg =
          olderEmotions.length > 0
            ? olderEmotions.reduce((a, b) => a + b, 0) / olderEmotions.length
            : recentAvg;

        indicators.indicators.emotionalTrajectory = recentAvg - olderAvg;

        if (indicators.indicators.emotionalTrajectory < -0.3) {
          indicators.warningSigns.push('Declining emotional state detected');
        }
      }

      // Analyze engagement patterns
      const now = Date.now();
      const recentCount = conversations.filter(
        (c) =>
          c.createdAt?.toDate?.() &&
          now - c.createdAt.toDate().getTime() < 7 * 24 * 60 * 60 * 1000
      ).length;

      const olderCount = conversations.filter(
        (c) =>
          c.createdAt?.toDate?.() &&
          now - c.createdAt.toDate().getTime() >= 7 * 24 * 60 * 60 * 1000
      ).length;

      if (olderCount > 0 && recentCount < olderCount * 0.5) {
        indicators.indicators.engagementDrop = 1 - recentCount / olderCount;
        indicators.warningSigns.push('Significant drop in engagement');
      }

      // Analyze negative language
      const negativeKeywords = ['sad', 'hopeless', 'alone', 'worthless', 'tired', 'exhausted', 'anxious', 'scared'];
      let negativeCount = 0;
      let totalWords = 0;

      for (const conv of conversations.slice(0, 10)) {
        const text = (conv.summary || conv.transcript || '').toLowerCase();
        totalWords += text.split(/\s+/).length;
        for (const keyword of negativeKeywords) {
          if (text.includes(keyword)) negativeCount++;
        }
      }

      if (totalWords > 100) {
        indicators.indicators.negativeLanguage = Math.min(negativeCount / 10, 1);
        if (indicators.indicators.negativeLanguage > 0.5) {
          indicators.warningSigns.push('Elevated negative language detected');
        }
      }

      // Calculate overall risk score
      const weightedScore =
        Math.abs(indicators.indicators.emotionalTrajectory) * 0.3 +
        indicators.indicators.isolationScore * 0.2 +
        indicators.indicators.stressAccumulation * 0.15 +
        indicators.indicators.sleepDisruption * 0.1 +
        indicators.indicators.engagementDrop * 0.15 +
        indicators.indicators.negativeLanguage * 0.1;

      indicators.riskScore = Math.min(weightedScore, 1);

      // Determine risk level
      if (indicators.riskScore >= 0.7) {
        indicators.riskLevel = 'critical';
        indicators.recommendedInterventions.push(
          'Consider direct outreach',
          'Suggest professional support resources'
        );
      } else if (indicators.riskScore >= 0.5) {
        indicators.riskLevel = 'high';
        indicators.recommendedInterventions.push(
          'Increase check-in frequency',
          'Surface positive memories'
        );
      } else if (indicators.riskScore >= 0.3) {
        indicators.riskLevel = 'elevated';
        indicators.recommendedInterventions.push('Monitor closely');
      }

    } catch (error) {
      log.warn({ userId, error: String(error) }, 'Error analyzing crisis indicators');
    }

    return indicators;
  }

  /**
   * Convert emotion string to numeric score
   */
  private emotionToScore(emotion: string): number {
    const emotionScores: Record<string, number> = {
      // Positive
      happy: 0.8,
      excited: 0.9,
      content: 0.6,
      grateful: 0.7,
      hopeful: 0.7,
      peaceful: 0.5,
      // Neutral
      neutral: 0,
      calm: 0.2,
      thoughtful: 0.1,
      // Negative
      sad: -0.6,
      anxious: -0.5,
      frustrated: -0.4,
      angry: -0.6,
      scared: -0.7,
      hopeless: -0.9,
      exhausted: -0.5,
    };

    return emotionScores[emotion.toLowerCase()] ?? 0;
  }

  // ==========================================================================
  // GROWTH PATTERN RECOGNITION
  // ==========================================================================

  /**
   * Track growth toward a goal
   */
  async trackGrowth(userId: string, goalId: string): Promise<GrowthTracking | null> {
    try {
      // Get goal data
      const goalRef = this.firestore
        .collection('users')
        .doc(userId)
        .collection('goals')
        .doc(goalId);

      const goalDoc = await goalRef.get();
      if (!goalDoc.exists) return null;

      const goal = goalDoc.data()!;

      // Get related progress entries
      const progressRef = this.firestore
        .collection('users')
        .doc(userId)
        .collection('goal_progress')
        .where('goalId', '==', goalId)
        .orderBy('recordedAt', 'desc')
        .limit(30);

      const progressDocs = await progressRef.get();
      const progressEntries = progressDocs.docs.map((d) => d.data());

      // Calculate current progress
      const currentProgress = progressEntries[0]?.progressPercent || 0;

      // Calculate velocity (progress per week)
      let velocity = 0;
      if (progressEntries.length >= 2) {
        const recentProgress = progressEntries[0]?.progressPercent || 0;
        const olderProgress = progressEntries[progressEntries.length - 1]?.progressPercent || 0;
        const daysBetween =
          progressEntries.length > 1 && progressEntries[0].recordedAt && progressEntries[progressEntries.length - 1].recordedAt
            ? (progressEntries[0].recordedAt.toDate().getTime() -
                progressEntries[progressEntries.length - 1].recordedAt.toDate().getTime()) /
              (24 * 60 * 60 * 1000)
            : 7;
        velocity = ((recentProgress - olderProgress) / Math.max(daysBetween, 1)) * 7;
      }

      // Determine momentum
      let momentum: GrowthTracking['momentum'] = 'steady';
      if (velocity > 5) momentum = 'accelerating';
      else if (velocity < -2) momentum = 'decelerating';
      else if (velocity < 0.5 && progressEntries.length > 5) momentum = 'stalled';

      // Detect plateau
      const isPlateaued =
        progressEntries.length >= 5 &&
        progressEntries.slice(0, 5).every((p) => Math.abs((p.progressPercent || 0) - currentProgress) < 2);

      let plateauDurationDays: number | undefined;
      if (isPlateaued && progressEntries[4]?.recordedAt) {
        plateauDurationDays = Math.floor(
          (Date.now() - progressEntries[4].recordedAt.toDate().getTime()) / (24 * 60 * 60 * 1000)
        );
      }

      // Detect breakthrough
      const recentBreakthrough =
        progressEntries.length >= 2 &&
        (progressEntries[0]?.progressPercent || 0) - (progressEntries[1]?.progressPercent || 0) > 10;

      // Get milestones
      const milestones = (goal.milestones || [])
        .filter((m: { achieved: boolean }) => m.achieved)
        .map((m: { description: string; achievedAt: { toDate: () => Date }; significance: number }) => ({
          description: m.description,
          achievedAt: m.achievedAt?.toDate?.() || new Date(),
          significance: m.significance || 0.5,
        }));

      return {
        userId,
        goalId,
        goalDescription: goal.description || goal.title || '',
        progressPercent: currentProgress,
        velocity,
        momentum,
        isPlateaued,
        plateauDurationDays,
        recentBreakthrough,
        breakthroughDescription: recentBreakthrough ? progressEntries[0]?.notes : undefined,
        milestones,
        updatedAt: new Date(),
      };
    } catch (error) {
      log.warn({ userId, goalId, error: String(error) }, 'Error tracking growth');
      return null;
    }
  }

  /**
   * Detect growth patterns across all goals
   */
  async detectGrowthPatterns(userId: string): Promise<Prediction[]> {
    const predictions: Prediction[] = [];
    const now = new Date();

    try {
      // Get all active goals
      const goalsRef = this.firestore
        .collection('users')
        .doc(userId)
        .collection('goals')
        .where('status', '==', 'active')
        .limit(20);

      const goalsDocs = await goalsRef.get();

      for (const goalDoc of goalsDocs.docs) {
        const tracking = await this.trackGrowth(userId, goalDoc.id);
        if (!tracking) continue;

        // Plateau alert
        if (tracking.isPlateaued && tracking.plateauDurationDays && tracking.plateauDurationDays > 7) {
          predictions.push({
            id: `growth_plateau_${goalDoc.id}_${Date.now()}`,
            userId,
            type: 'plateau_alert',
            prediction: `Progress on "${tracking.goalDescription}" has plateaued for ${tracking.plateauDurationDays} days`,
            confidence: 'high',
            confidenceScore: 0.85,
            relatedEntities: [goalDoc.id],
            evidence: [
              `Current progress: ${tracking.progressPercent}%`,
              `No significant change in ${tracking.plateauDurationDays} days`,
            ],
            recommendedActions: [
              'Discuss potential blockers',
              'Consider adjusting approach',
              'Celebrate small wins',
            ],
            priority: 6,
            createdAt: now,
            actedUpon: false,
          });
        }

        // Breakthrough celebration
        if (tracking.recentBreakthrough) {
          predictions.push({
            id: `growth_breakthrough_${goalDoc.id}_${Date.now()}`,
            userId,
            type: 'breakthrough_detected',
            prediction: `Major progress on "${tracking.goalDescription}"!`,
            confidence: 'high',
            confidenceScore: 0.9,
            relatedEntities: [goalDoc.id],
            evidence: [
              tracking.breakthroughDescription || 'Significant progress jump detected',
              `New progress: ${tracking.progressPercent}%`,
            ],
            recommendedActions: ['Celebrate this achievement', 'Discuss what led to breakthrough'],
            priority: 7,
            createdAt: now,
            actedUpon: false,
          });
        }

        // Milestone approaching
        if (tracking.progressPercent >= 90 && tracking.progressPercent < 100) {
          predictions.push({
            id: `growth_milestone_${goalDoc.id}_${Date.now()}`,
            userId,
            type: 'growth_milestone',
            prediction: `Close to completing "${tracking.goalDescription}" (${tracking.progressPercent}%)`,
            confidence: 'high',
            confidenceScore: 0.9,
            relatedEntities: [goalDoc.id],
            evidence: [`${100 - tracking.progressPercent}% remaining`],
            recommendedActions: ['Provide encouragement', 'Discuss final steps'],
            priority: 8,
            createdAt: now,
            actedUpon: false,
          });
        }
      }
    } catch (error) {
      log.warn({ userId, error: String(error) }, 'Error detecting growth patterns');
    }

    return predictions;
  }

  // ==========================================================================
  // PERSISTENCE
  // ==========================================================================

  /**
   * Save prediction to Firestore
   */
  async savePrediction(prediction: Prediction): Promise<void> {
    await this.firestore
      .collection('users')
      .doc(prediction.userId)
      .collection('predictions')
      .doc(prediction.id)
      .set({
        ...prediction,
        createdAt: FieldValue.serverTimestamp(),
      });
  }

  /**
   * Get active predictions for a user
   */
  async getActivePredictions(userId: string): Promise<Prediction[]> {
    const snapshot = await this.firestore
      .collection('users')
      .doc(userId)
      .collection('predictions')
      .where('actedUpon', '==', false)
      .orderBy('priority', 'desc')
      .limit(20)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        createdAt: data.createdAt?.toDate?.() || new Date(),
        predictedTiming: data.predictedTiming?.toDate?.(),
        expiresAt: data.expiresAt?.toDate?.(),
      } as Prediction;
    });
  }

  /**
   * Record prediction outcome
   */
  async recordOutcome(
    userId: string,
    predictionId: string,
    accurate: boolean,
    notes?: string
  ): Promise<void> {
    await this.firestore
      .collection('users')
      .doc(userId)
      .collection('predictions')
      .doc(predictionId)
      .update({
        actedUpon: true,
        outcome: {
          accurate,
          notes,
          recordedAt: FieldValue.serverTimestamp(),
        },
      });
  }
}

// ============================================================================
// SINGLETON & EXPORTS
// ============================================================================

let serviceInstance: PredictiveIntelligenceService | null = null;

/**
 * Get or create the predictive intelligence service singleton
 */
export function getPredictiveIntelligenceService(): PredictiveIntelligenceService {
  if (!serviceInstance) {
    serviceInstance = new PredictiveIntelligenceService();
  }
  return serviceInstance;
}

/**
 * Convenience function to analyze user patterns
 */
export async function analyzeUserPatterns(userId: string): Promise<{
  patterns: BehavioralPattern[];
  predictions: Prediction[];
  crisisIndicators: CrisisIndicators;
}> {
  const service = getPredictiveIntelligenceService();

  const [patterns, predictions, crisisIndicators] = await Promise.all([
    service.analyzeBehavioralPatterns(userId),
    service.generatePredictions(userId),
    service.analyzeCrisisIndicators(userId),
  ]);

  // Add growth predictions
  const growthPredictions = await service.detectGrowthPatterns(userId);
  predictions.push(...growthPredictions);

  return { patterns, predictions, crisisIndicators };
}

/**
 * Check for crisis indicators
 */
export async function checkCrisisIndicators(userId: string): Promise<CrisisIndicators> {
  const service = getPredictiveIntelligenceService();
  return service.analyzeCrisisIndicators(userId);
}

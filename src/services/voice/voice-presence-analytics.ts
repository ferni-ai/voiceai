/**
 * Voice Presence Analytics Service
 *
 * Collects metrics and feedback for voice presence features to enable:
 * 1. Real-time monitoring via dashboard
 * 2. AI-powered auto-tuning
 * 3. A/B testing of different configurations
 *
 * Features tracked:
 * - Adaptive Endpointing
 * - Live Backchanneling
 * - TTS Context (Prosody Continuity)
 * - Pronunciation Memory
 * - Turn Prediction
 * - Alive Intros
 *
 * @see docs/features/VOICE-PRESENCE-ROADMAP.md
 */

import { getLogger } from '../../utils/safe-logger.js';

// ============================================================================
// TYPES
// ============================================================================

export type VoicePresenceFeature =
  | 'adaptive_endpointing'
  | 'live_backchanneling'
  | 'tts_context'
  | 'pronunciation_memory'
  | 'turn_prediction'
  | 'alive_intros';

export interface FeatureEvent {
  feature: VoicePresenceFeature;
  timestamp: Date;
  sessionId: string;
  personaId: string;

  /** What happened */
  action: string;

  /** Was this a success? */
  success: boolean;

  /** Any relevant metrics */
  metrics?: Record<string, number>;

  /** User feedback signal (if any) */
  userFeedback?: 'positive' | 'negative' | 'neutral';

  /** Details for debugging */
  details?: Record<string, unknown>;
}

export interface FeatureMetrics {
  feature: VoicePresenceFeature;
  period: 'hour' | 'day' | 'week';

  /** Total events */
  totalEvents: number;

  /** Success rate (0-1) */
  successRate: number;

  /** Average latency if applicable (ms) */
  avgLatencyMs?: number;

  /** User satisfaction signals */
  positiveSignals: number;
  negativeSignals: number;

  /** Feature-specific metrics */
  custom: Record<string, number>;
}

export interface EndpointingMetrics {
  /** Average delay used (ms) */
  avgMinDelay: number;
  avgMaxDelay: number;

  /** How often was user cut off (interruption after short pause) */
  cutOffRate: number;

  /** How often did we wait too long (awkward silence) */
  overWaitRate: number;

  /** Sentence completion accuracy */
  completenessAccuracy: number;
}

export interface BackchannelMetrics {
  /** How many backchannels fired */
  totalFired: number;

  /** User continued talking after (positive) */
  positiveReactions: number;

  /** User went silent after (negative) */
  negativeReactions: number;

  /** Reaction rate */
  positiveRate: number;

  /** Average time into turn when fired (ms) */
  avgTriggerTime: number;
}

export interface TurnPredictionMetrics {
  /** Total predictions made */
  totalPredictions: number;

  /** How often we predicted correctly */
  accuracy: number;

  /** How much latency was saved (ms) */
  avgLatencySaved: number;

  /** False positives (started too early) */
  falsePositiveRate: number;
}

export interface PronunciationMetrics {
  /** Names learned */
  namesLearned: number;

  /** Corrections received */
  correctionsReceived: number;

  /** Times pronunciation was applied */
  applicationsCount: number;
}

export interface TuningRecommendation {
  feature: VoicePresenceFeature;
  parameter: string;
  currentValue: number;
  recommendedValue: number;
  confidence: number;
  reason: string;
  impact: 'high' | 'medium' | 'low';
}

// ============================================================================
// CONFIGURATION INTERFACE
// ============================================================================

export interface VoicePresenceConfig {
  adaptiveEndpointing: {
    baseMinDelay: number;
    baseMaxDelay: number;
    heavyTopicMultiplier: number;
    emotionalMultiplier: number;
    slowSpeakerThreshold: number;
  };
  liveBackchanneling: {
    minSpeakingDuration: number;
    minInterval: number;
    baseProbability: number;
    emotionalProbability: number;
    softVolumeRatio: number;
  };
  ttsContext: {
    openingPauseAfterEmotion: number;
    openingPauseAfterInterruption: number;
    warmthThreshold: number;
  };
  turnPrediction: {
    completionConfidenceThreshold: number;
    preemptiveGenerationThreshold: number;
  };
}

const DEFAULT_CONFIG: VoicePresenceConfig = {
  adaptiveEndpointing: {
    baseMinDelay: 400,
    baseMaxDelay: 1200,
    heavyTopicMultiplier: 1.3,
    emotionalMultiplier: 1.5,
    slowSpeakerThreshold: 100,
  },
  liveBackchanneling: {
    minSpeakingDuration: 4000,
    minInterval: 8000,
    baseProbability: 0.25,
    emotionalProbability: 0.4,
    softVolumeRatio: 0.3,
  },
  ttsContext: {
    openingPauseAfterEmotion: 200,
    openingPauseAfterInterruption: 150,
    warmthThreshold: 0.7,
  },
  turnPrediction: {
    completionConfidenceThreshold: 0.6,
    preemptiveGenerationThreshold: 0.65,
  },
};

// ============================================================================
// VOICE PRESENCE ANALYTICS SERVICE
// ============================================================================

export class VoicePresenceAnalytics {
  private events: FeatureEvent[] = [];
  private config: VoicePresenceConfig;
  private maxEvents = 10000; // Rolling window

  // Aggregated metrics by feature
  private endpointingMetrics: EndpointingMetrics = {
    avgMinDelay: 400,
    avgMaxDelay: 1200,
    cutOffRate: 0,
    overWaitRate: 0,
    completenessAccuracy: 0.7,
  };

  private backchannelMetrics: BackchannelMetrics = {
    totalFired: 0,
    positiveReactions: 0,
    negativeReactions: 0,
    positiveRate: 0.5,
    avgTriggerTime: 4000,
  };

  private turnPredictionMetrics: TurnPredictionMetrics = {
    totalPredictions: 0,
    accuracy: 0.7,
    avgLatencySaved: 200,
    falsePositiveRate: 0.1,
  };

  private pronunciationMetrics: PronunciationMetrics = {
    namesLearned: 0,
    correctionsReceived: 0,
    applicationsCount: 0,
  };

  constructor(config: Partial<VoicePresenceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    getLogger().info('🎤 Voice presence analytics initialized');
  }

  // ==========================================================================
  // EVENT RECORDING
  // ==========================================================================

  /**
   * Record a feature event
   */
  recordEvent(event: Omit<FeatureEvent, 'timestamp'>): void {
    const fullEvent: FeatureEvent = {
      ...event,
      timestamp: new Date(),
    };

    this.events.push(fullEvent);

    // Maintain rolling window
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // Update aggregated metrics
    this.updateAggregates(fullEvent);

    getLogger().debug(
      {
        feature: event.feature,
        action: event.action,
        success: event.success,
      },
      '📊 Voice presence event recorded'
    );
  }

  /**
   * Record an endpointing event
   */
  recordEndpointing(
    sessionId: string,
    personaId: string,
    data: {
      minDelay: number;
      maxDelay: number;
      actualPause: number;
      wasCutOff: boolean;
      wasOverWait: boolean;
      sentenceCompleteness: number;
      topicWeight: string;
    }
  ): void {
    this.recordEvent({
      feature: 'adaptive_endpointing',
      sessionId,
      personaId,
      action: 'endpointing_applied',
      success: !data.wasCutOff && !data.wasOverWait,
      metrics: {
        minDelay: data.minDelay,
        maxDelay: data.maxDelay,
        actualPause: data.actualPause,
        sentenceCompleteness: data.sentenceCompleteness,
      },
      userFeedback: data.wasCutOff ? 'negative' : data.wasOverWait ? 'negative' : 'neutral',
      details: { topicWeight: data.topicWeight },
    });

    // Update specific metrics
    this.endpointingMetrics.avgMinDelay = (this.endpointingMetrics.avgMinDelay + data.minDelay) / 2;
    this.endpointingMetrics.avgMaxDelay = (this.endpointingMetrics.avgMaxDelay + data.maxDelay) / 2;
    this.endpointingMetrics.completenessAccuracy =
      (this.endpointingMetrics.completenessAccuracy + data.sentenceCompleteness) / 2;
  }

  /**
   * Record a backchannel event
   */
  recordBackchannel(
    sessionId: string,
    personaId: string,
    data: {
      type: 'live' | 'standard';
      phrase: string;
      triggerTime: number;
      userReaction: 'continued' | 'stopped' | 'unknown';
    }
  ): void {
    const success = data.userReaction === 'continued';

    this.recordEvent({
      feature: 'live_backchanneling',
      sessionId,
      personaId,
      action: `backchannel_${data.type}`,
      success,
      metrics: {
        triggerTime: data.triggerTime,
      },
      userFeedback: success ? 'positive' : data.userReaction === 'stopped' ? 'negative' : 'neutral',
      details: { phrase: data.phrase },
    });

    // Update specific metrics
    this.backchannelMetrics.totalFired++;
    if (data.userReaction === 'continued') {
      this.backchannelMetrics.positiveReactions++;
    } else if (data.userReaction === 'stopped') {
      this.backchannelMetrics.negativeReactions++;
    }
    this.backchannelMetrics.positiveRate =
      this.backchannelMetrics.positiveReactions / this.backchannelMetrics.totalFired;
    this.backchannelMetrics.avgTriggerTime =
      (this.backchannelMetrics.avgTriggerTime + data.triggerTime) / 2;
  }

  /**
   * Record a turn prediction event
   */
  recordTurnPrediction(
    sessionId: string,
    personaId: string,
    data: {
      predictedComplete: boolean;
      actuallyComplete: boolean;
      confidence: number;
      latencySaved: number;
    }
  ): void {
    const correct = data.predictedComplete === data.actuallyComplete;
    const falsePositive = data.predictedComplete && !data.actuallyComplete;

    this.recordEvent({
      feature: 'turn_prediction',
      sessionId,
      personaId,
      action: 'prediction_made',
      success: correct,
      metrics: {
        confidence: data.confidence,
        latencySaved: data.latencySaved,
      },
      userFeedback: falsePositive ? 'negative' : correct ? 'positive' : 'neutral',
    });

    // Update specific metrics
    this.turnPredictionMetrics.totalPredictions++;
    const total = this.turnPredictionMetrics.totalPredictions;
    this.turnPredictionMetrics.accuracy =
      (this.turnPredictionMetrics.accuracy * (total - 1) + (correct ? 1 : 0)) / total;
    this.turnPredictionMetrics.avgLatencySaved =
      (this.turnPredictionMetrics.avgLatencySaved + data.latencySaved) / 2;
  }

  /**
   * Record a pronunciation event
   */
  recordPronunciation(
    sessionId: string,
    personaId: string,
    data: {
      action: 'learned' | 'corrected' | 'applied';
      name: string;
      phonetic?: string;
    }
  ): void {
    this.recordEvent({
      feature: 'pronunciation_memory',
      sessionId,
      personaId,
      action: `pronunciation_${data.action}`,
      success: true,
      details: { name: data.name, phonetic: data.phonetic },
    });

    // Update specific metrics
    if (data.action === 'learned') {
      this.pronunciationMetrics.namesLearned++;
    } else if (data.action === 'corrected') {
      this.pronunciationMetrics.correctionsReceived++;
    } else if (data.action === 'applied') {
      this.pronunciationMetrics.applicationsCount++;
    }
  }

  // ==========================================================================
  // METRICS AGGREGATION
  // ==========================================================================

  private updateAggregates(event: FeatureEvent): void {
    // Feature-specific aggregation is done in the individual record methods
    // This method handles general aggregation
  }

  /**
   * Get metrics for a specific feature
   */
  getFeatureMetrics(feature: VoicePresenceFeature): FeatureMetrics {
    const featureEvents = this.events.filter((e) => e.feature === feature);
    const successEvents = featureEvents.filter((e) => e.success);
    const positiveEvents = featureEvents.filter((e) => e.userFeedback === 'positive');
    const negativeEvents = featureEvents.filter((e) => e.userFeedback === 'negative');

    return {
      feature,
      period: 'day',
      totalEvents: featureEvents.length,
      successRate: featureEvents.length > 0 ? successEvents.length / featureEvents.length : 0,
      positiveSignals: positiveEvents.length,
      negativeSignals: negativeEvents.length,
      custom: this.getFeatureSpecificMetrics(feature),
    };
  }

  private getFeatureSpecificMetrics(feature: VoicePresenceFeature): Record<string, number> {
    switch (feature) {
      case 'adaptive_endpointing':
        return {
          avgMinDelay: this.endpointingMetrics.avgMinDelay,
          avgMaxDelay: this.endpointingMetrics.avgMaxDelay,
          cutOffRate: this.endpointingMetrics.cutOffRate,
          overWaitRate: this.endpointingMetrics.overWaitRate,
          completenessAccuracy: this.endpointingMetrics.completenessAccuracy,
        };
      case 'live_backchanneling':
        return {
          totalFired: this.backchannelMetrics.totalFired,
          positiveRate: this.backchannelMetrics.positiveRate,
          avgTriggerTime: this.backchannelMetrics.avgTriggerTime,
        };
      case 'turn_prediction':
        return {
          totalPredictions: this.turnPredictionMetrics.totalPredictions,
          accuracy: this.turnPredictionMetrics.accuracy,
          avgLatencySaved: this.turnPredictionMetrics.avgLatencySaved,
          falsePositiveRate: this.turnPredictionMetrics.falsePositiveRate,
        };
      case 'pronunciation_memory':
        return {
          namesLearned: this.pronunciationMetrics.namesLearned,
          correctionsReceived: this.pronunciationMetrics.correctionsReceived,
          applicationsCount: this.pronunciationMetrics.applicationsCount,
        };
      default:
        return {};
    }
  }

  /**
   * Get all feature metrics
   */
  getAllMetrics(): Record<VoicePresenceFeature, FeatureMetrics> {
    const features: VoicePresenceFeature[] = [
      'adaptive_endpointing',
      'live_backchanneling',
      'tts_context',
      'pronunciation_memory',
      'turn_prediction',
      'alive_intros',
    ];

    const result: Record<VoicePresenceFeature, FeatureMetrics> = {} as Record<
      VoicePresenceFeature,
      FeatureMetrics
    >;
    for (const feature of features) {
      result[feature] = this.getFeatureMetrics(feature);
    }
    return result;
  }

  // ==========================================================================
  // AUTO-TUNING RECOMMENDATIONS
  // ==========================================================================

  /**
   * Generate tuning recommendations based on collected data
   */
  generateRecommendations(): TuningRecommendation[] {
    const recommendations: TuningRecommendation[] = [];

    // Check endpointing metrics
    if (this.endpointingMetrics.cutOffRate > 0.15) {
      recommendations.push({
        feature: 'adaptive_endpointing',
        parameter: 'baseMinDelay',
        currentValue: this.config.adaptiveEndpointing.baseMinDelay,
        recommendedValue: Math.min(800, this.config.adaptiveEndpointing.baseMinDelay + 100),
        confidence: 0.7 + this.endpointingMetrics.cutOffRate,
        reason: `High cut-off rate (${(this.endpointingMetrics.cutOffRate * 100).toFixed(1)}%) suggests we're not waiting long enough`,
        impact: 'high',
      });
    }

    if (this.endpointingMetrics.overWaitRate > 0.2) {
      recommendations.push({
        feature: 'adaptive_endpointing',
        parameter: 'baseMaxDelay',
        currentValue: this.config.adaptiveEndpointing.baseMaxDelay,
        recommendedValue: Math.max(800, this.config.adaptiveEndpointing.baseMaxDelay - 150),
        confidence: 0.6 + this.endpointingMetrics.overWaitRate * 0.5,
        reason: `High over-wait rate (${(this.endpointingMetrics.overWaitRate * 100).toFixed(1)}%) suggests awkward silences`,
        impact: 'medium',
      });
    }

    // Check backchannel metrics
    if (this.backchannelMetrics.positiveRate < 0.4 && this.backchannelMetrics.totalFired > 20) {
      recommendations.push({
        feature: 'live_backchanneling',
        parameter: 'baseProbability',
        currentValue: this.config.liveBackchanneling.baseProbability,
        recommendedValue: Math.max(0.1, this.config.liveBackchanneling.baseProbability - 0.05),
        confidence: 0.6,
        reason: `Low positive reaction rate (${(this.backchannelMetrics.positiveRate * 100).toFixed(1)}%) suggests backchannels may be annoying`,
        impact: 'medium',
      });
    }

    if (this.backchannelMetrics.avgTriggerTime < 3000) {
      recommendations.push({
        feature: 'live_backchanneling',
        parameter: 'minSpeakingDuration',
        currentValue: this.config.liveBackchanneling.minSpeakingDuration,
        recommendedValue: this.config.liveBackchanneling.minSpeakingDuration + 500,
        confidence: 0.5,
        reason: 'Backchannels firing early - may feel interruptive',
        impact: 'low',
      });
    }

    // Check turn prediction metrics
    if (this.turnPredictionMetrics.falsePositiveRate > 0.2) {
      recommendations.push({
        feature: 'turn_prediction',
        parameter: 'completionConfidenceThreshold',
        currentValue: this.config.turnPrediction.completionConfidenceThreshold,
        recommendedValue: Math.min(
          0.85,
          this.config.turnPrediction.completionConfidenceThreshold + 0.1
        ),
        confidence: 0.7,
        reason: `High false positive rate (${(this.turnPredictionMetrics.falsePositiveRate * 100).toFixed(1)}%) - responding too early`,
        impact: 'high',
      });
    }

    getLogger().info(
      { recommendationCount: recommendations.length },
      '🔧 Generated voice presence tuning recommendations'
    );

    return recommendations;
  }

  /**
   * Apply a recommendation
   */
  applyRecommendation(recommendation: TuningRecommendation): boolean {
    try {
      switch (recommendation.feature) {
        case 'adaptive_endpointing':
          if (recommendation.parameter === 'baseMinDelay') {
            this.config.adaptiveEndpointing.baseMinDelay = recommendation.recommendedValue;
          } else if (recommendation.parameter === 'baseMaxDelay') {
            this.config.adaptiveEndpointing.baseMaxDelay = recommendation.recommendedValue;
          }
          break;

        case 'live_backchanneling':
          if (recommendation.parameter === 'baseProbability') {
            this.config.liveBackchanneling.baseProbability = recommendation.recommendedValue;
          } else if (recommendation.parameter === 'minSpeakingDuration') {
            this.config.liveBackchanneling.minSpeakingDuration = recommendation.recommendedValue;
          }
          break;

        case 'turn_prediction':
          if (recommendation.parameter === 'completionConfidenceThreshold') {
            this.config.turnPrediction.completionConfidenceThreshold =
              recommendation.recommendedValue;
          }
          break;

        default:
          return false;
      }

      getLogger().info(
        {
          feature: recommendation.feature,
          parameter: recommendation.parameter,
          oldValue: recommendation.currentValue,
          newValue: recommendation.recommendedValue,
        },
        '✅ Applied voice presence tuning recommendation'
      );

      return true;
    } catch (error) {
      getLogger().error({ error }, 'Failed to apply recommendation');
      return false;
    }
  }

  // ==========================================================================
  // CONFIG ACCESS
  // ==========================================================================

  /**
   * Get current configuration
   */
  getConfig(): VoicePresenceConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<VoicePresenceConfig>): void {
    this.config = {
      ...this.config,
      ...updates,
      adaptiveEndpointing: {
        ...this.config.adaptiveEndpointing,
        ...updates.adaptiveEndpointing,
      },
      liveBackchanneling: {
        ...this.config.liveBackchanneling,
        ...updates.liveBackchanneling,
      },
      ttsContext: {
        ...this.config.ttsContext,
        ...updates.ttsContext,
      },
      turnPrediction: {
        ...this.config.turnPrediction,
        ...updates.turnPrediction,
      },
    };

    getLogger().info({ updates }, '🔧 Voice presence config updated');
  }

  // ==========================================================================
  // DASHBOARD DATA
  // ==========================================================================

  /**
   * Get data for the dashboard
   */
  getDashboardData(): {
    config: VoicePresenceConfig;
    metrics: Record<VoicePresenceFeature, FeatureMetrics>;
    recommendations: TuningRecommendation[];
    recentEvents: FeatureEvent[];
  } {
    return {
      config: this.getConfig(),
      metrics: this.getAllMetrics(),
      recommendations: this.generateRecommendations(),
      recentEvents: this.events.slice(-50),
    };
  }

  /**
   * Reset all metrics (for testing)
   */
  reset(): void {
    this.events = [];
    this.endpointingMetrics = {
      avgMinDelay: 400,
      avgMaxDelay: 1200,
      cutOffRate: 0,
      overWaitRate: 0,
      completenessAccuracy: 0.7,
    };
    this.backchannelMetrics = {
      totalFired: 0,
      positiveReactions: 0,
      negativeReactions: 0,
      positiveRate: 0.5,
      avgTriggerTime: 4000,
    };
    this.turnPredictionMetrics = {
      totalPredictions: 0,
      accuracy: 0.7,
      avgLatencySaved: 200,
      falsePositiveRate: 0.1,
    };
    this.pronunciationMetrics = {
      namesLearned: 0,
      correctionsReceived: 0,
      applicationsCount: 0,
    };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let analyticsInstance: VoicePresenceAnalytics | null = null;

export function getVoicePresenceAnalytics(): VoicePresenceAnalytics {
  if (!analyticsInstance) {
    analyticsInstance = new VoicePresenceAnalytics();
  }
  return analyticsInstance;
}

export function resetVoicePresenceAnalytics(): void {
  analyticsInstance?.reset();
  analyticsInstance = null;
}

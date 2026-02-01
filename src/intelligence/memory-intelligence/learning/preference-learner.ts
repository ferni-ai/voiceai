/**
 * Preference Learner
 *
 * Learns user preferences for memory surfacing over time.
 * Uses the response tracker and profile builder to make predictions.
 *
 * @module intelligence/memory-intelligence/learning/preference-learner
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { UserMemoryProfile, TrustLevel, PhrasingStyle, UserState, EmotionalState } from '../types.js';
import type { StoredMemory } from '../../../memory/unified-store/types.js';
import { getResponseTracker, type ResponseTracker } from './response-tracker.js';
import { getProfileBuilder, type ProfileBuilder } from './profile-builder.js';

const log = createLogger({ module: 'PreferenceLearner' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Prediction for a memory surfacing
 */
export interface SurfacingPrediction {
  /** Should we surface this memory? */
  recommended: boolean;

  /** Confidence in recommendation (0-1) */
  confidence: number;

  /** Predicted user response */
  predictedResponse: 'engage' | 'acknowledge' | 'deflect' | 'ignore';

  /** Predicted response probability (0-1) */
  responseProbability: number;

  /** Reasoning */
  reasoning: string[];

  /** Suggested adjustments */
  suggestions: {
    /** Better time of day? */
    betterTime?: number;
    /** Better conversation depth? */
    betterDepth?: string;
    /** Better phrasing style? */
    betterStyle?: PhrasingStyle;
  };
}

/**
 * Learning configuration
 */
export interface PreferenceLearnerConfig {
  /** Minimum profile confidence to use predictions */
  minProfileConfidence: number;

  /** How much to weight historical patterns */
  historyWeight: number;

  /** How much to weight current context */
  contextWeight: number;
}

const DEFAULT_CONFIG: PreferenceLearnerConfig = {
  minProfileConfidence: 0.4,
  historyWeight: 0.6,
  contextWeight: 0.4,
};

// ============================================================================
// PREFERENCE LEARNER
// ============================================================================

/**
 * Preference Learner
 *
 * Learns and predicts user preferences for memory surfacing.
 */
export class PreferenceLearner {
  private config: PreferenceLearnerConfig;
  private responseTracker: ResponseTracker;
  private profileBuilder: ProfileBuilder;
  private initialized = false;

  constructor(config: Partial<PreferenceLearnerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.responseTracker = getResponseTracker();
    this.profileBuilder = getProfileBuilder();
  }

  async initialize(): Promise<void> {
    await this.responseTracker.initialize();
    await this.profileBuilder.initialize();
    this.initialized = true;
    log.debug('PreferenceLearner initialized');
  }

  /**
   * Predict user's likely response to surfacing a memory
   */
  async predictResponse(
    memory: StoredMemory,
    userProfile: UserMemoryProfile | null,
    context: {
      userState: UserState;
      emotionalState: EmotionalState;
      turnCount: number;
      topics: string[];
    }
  ): Promise<SurfacingPrediction> {
    const reasoning: string[] = [];

    // If no profile, use defaults
    if (!userProfile) {
      reasoning.push('No user profile available - using defaults');
      return {
        recommended: true,
        confidence: 0.4,
        predictedResponse: 'acknowledge',
        responseProbability: 0.5,
        reasoning,
        suggestions: {},
      };
    }

    // Check topic history
    const memoryTopics = memory.topics;
    const hasDeflectedTopic = memoryTopics.some((t) =>
      userProfile.responsePatterns.topicsDeflected.includes(t)
    );
    const hasWelcomedTopic = memoryTopics.some((t) =>
      userProfile.responsePatterns.topicsWelcomed.includes(t)
    );
    const hasSensitiveTopic = memoryTopics.some((t) =>
      userProfile.sensitiveTopics.has(t)
    );

    if (hasDeflectedTopic) {
      reasoning.push(`User has deflected from topics: ${memoryTopics.filter((t) => userProfile.responsePatterns.topicsDeflected.includes(t)).join(', ')}`);
    }
    if (hasWelcomedTopic) {
      reasoning.push(`User has engaged with topics: ${memoryTopics.filter((t) => userProfile.responsePatterns.topicsWelcomed.includes(t)).join(', ')}`);
    }
    if (hasSensitiveTopic) {
      reasoning.push(`Contains sensitive topics`);
    }

    // Check time of day receptivity
    const currentHour = new Date().getHours();
    const timeReceptivity = userProfile.receptivityPatterns.byTimeOfDay.get(currentHour) || 0.5;
    reasoning.push(`Time receptivity (${currentHour}h): ${(timeReceptivity * 100).toFixed(0)}%`);

    // Check conversation depth receptivity
    const depthBucket = this.getDepthBucket(context.turnCount);
    const depthReceptivity = userProfile.receptivityPatterns.byConversationDepth.get(depthBucket) || 0.5;
    reasoning.push(`Depth receptivity (${depthBucket}): ${(depthReceptivity * 100).toFixed(0)}%`);

    // Check emotional state receptivity
    const emotionKey = context.emotionalState.valence > 0 ? 'positive' : context.emotionalState.valence < 0 ? 'negative' : 'neutral';
    const emotionReceptivity = userProfile.receptivityPatterns.byEmotionalState.get(emotionKey) || 0.5;

    // Calculate overall prediction
    let baseProbability = userProfile.engagementRate;

    // Adjust for topic history
    if (hasDeflectedTopic) baseProbability -= 0.3;
    if (hasWelcomedTopic) baseProbability += 0.2;
    if (hasSensitiveTopic) baseProbability -= 0.2;

    // Adjust for time/depth/emotion
    const contextMultiplier = (timeReceptivity + depthReceptivity + emotionReceptivity) / 3;
    baseProbability *= contextMultiplier;

    // Adjust for user state
    if (context.userState.energy < 0.3) baseProbability -= 0.2;
    if (context.userState.isRushed) baseProbability -= 0.15;
    if (context.emotionalState.intensity > 0.7) baseProbability -= 0.2;

    // Clamp
    baseProbability = Math.max(0, Math.min(1, baseProbability));

    // Determine predicted response
    let predictedResponse: 'engage' | 'acknowledge' | 'deflect' | 'ignore';
    if (baseProbability >= 0.6) {
      predictedResponse = 'engage';
    } else if (baseProbability >= 0.4) {
      predictedResponse = 'acknowledge';
    } else if (hasDeflectedTopic || hasSensitiveTopic) {
      predictedResponse = 'deflect';
    } else {
      predictedResponse = 'ignore';
    }

    // Generate suggestions
    const suggestions = this.generateSuggestions(userProfile, context, currentHour, depthBucket);

    // Determine recommendation
    const recommended = baseProbability >= 0.4 && !hasSensitiveTopic && !hasDeflectedTopic;

    // Calculate confidence
    const profileStats = this.responseTracker.getUserStats(userProfile.userId);
    let confidence = 0.5;
    if (profileStats.totalSurfaced >= 10) confidence += 0.2;
    if (profileStats.totalSurfaced >= 20) confidence += 0.1;

    return {
      recommended,
      confidence,
      predictedResponse,
      responseProbability: baseProbability,
      reasoning,
      suggestions,
    };
  }

  /**
   * Get optimal timing for a user
   */
  async getOptimalTiming(
    userId: string,
    profile: UserMemoryProfile | null
  ): Promise<{
    bestHours: number[];
    bestDepth: string;
    idealFrequency: number;
  }> {
    if (!profile) {
      return {
        bestHours: [10, 14, 19], // Default: mid-morning, early afternoon, evening
        bestDepth: 'middle',
        idealFrequency: 2,
      };
    }

    // Find best hours
    const hourEntries = Array.from(profile.receptivityPatterns.byTimeOfDay.entries());
    const sortedHours = hourEntries.sort((a, b) => b[1] - a[1]);
    const bestHours = sortedHours.slice(0, 3).map(([hour]) => hour);

    // Find best depth
    const depthEntries = Array.from(profile.receptivityPatterns.byConversationDepth.entries());
    const sortedDepths = depthEntries.sort((a, b) => b[1] - a[1]);
    const bestDepth = sortedDepths[0]?.[0] || 'middle';

    return {
      bestHours: bestHours.length > 0 ? bestHours : [10, 14, 19],
      bestDepth,
      idealFrequency: profile.idealRecallFrequency,
    };
  }

  /**
   * Learn from a session's data
   */
  async learnFromSession(userId: string, sessionId: string): Promise<void> {
    const records = await this.responseTracker.endSession(sessionId);

    if (records.length === 0) {
      log.debug({ userId, sessionId }, 'No records to learn from');
      return;
    }

    const existingProfile = await this.profileBuilder.getProfile(userId);

    const result = await this.profileBuilder.buildProfile({
      userId,
      sessionRecords: records,
      existingProfile: existingProfile || undefined,
    });

    log.debug({
      userId,
      recordCount: records.length,
      changes: result.changes.length,
      newTrustLevel: result.profile.trustLevel,
    }, 'Learned from session');
  }

  /**
   * Get depth bucket for turn count
   */
  private getDepthBucket(turnCount: number): string {
    if (turnCount <= 3) return 'shallow';
    if (turnCount <= 7) return 'early';
    if (turnCount <= 15) return 'middle';
    if (turnCount <= 30) return 'deep';
    return 'extended';
  }

  /**
   * Generate suggestions for better timing
   */
  private generateSuggestions(
    profile: UserMemoryProfile,
    context: { turnCount: number },
    currentHour: number,
    currentDepth: string
  ): SurfacingPrediction['suggestions'] {
    const suggestions: SurfacingPrediction['suggestions'] = {};

    // Find better time
    const hourEntries = Array.from(profile.receptivityPatterns.byTimeOfDay.entries());
    const bestHour = hourEntries.sort((a, b) => b[1] - a[1])[0];
    if (bestHour && bestHour[0] !== currentHour && bestHour[1] > 0.6) {
      suggestions.betterTime = bestHour[0];
    }

    // Find better depth
    const depthEntries = Array.from(profile.receptivityPatterns.byConversationDepth.entries());
    const bestDepth = depthEntries.sort((a, b) => b[1] - a[1])[0];
    if (bestDepth && bestDepth[0] !== currentDepth && bestDepth[1] > 0.6) {
      suggestions.betterDepth = bestDepth[0];
    }

    // Suggest style based on preferences
    if (profile.responsePatterns.preferredPhrasingStyle !== 'warm_recall') {
      suggestions.betterStyle = profile.responsePatterns.preferredPhrasingStyle;
    }

    return suggestions;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let learnerInstance: PreferenceLearner | null = null;

export function getPreferenceLearner(config?: Partial<PreferenceLearnerConfig>): PreferenceLearner {
  if (!learnerInstance) {
    learnerInstance = new PreferenceLearner(config);
  }
  return learnerInstance;
}

export function resetPreferenceLearner(): void {
  learnerInstance = null;
}

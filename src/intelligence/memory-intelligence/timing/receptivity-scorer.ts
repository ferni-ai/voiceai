/**
 * Receptivity Scorer
 *
 * Scores how receptive a user is to memory callbacks at a given moment.
 * Combines learned patterns with real-time context signals.
 *
 * @module intelligence/memory-intelligence/timing/receptivity-scorer
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { UserState, EmotionalState, ConversationContext, TrustLevel, UserMemoryProfile } from '../types.js';

const log = createLogger({ module: 'ReceptivityScorer' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Input for scoring receptivity
 */
export interface ReceptivityInput {
  /** User's current state */
  userState: UserState;

  /** Current emotional state */
  emotionalState: EmotionalState;

  /** Conversation context */
  conversationContext: ConversationContext;

  /** User's learned profile (if available) */
  userProfile?: UserMemoryProfile;

  /** How relevant is the memory to current topic? (0-1) */
  memoryRelevance: number;

  /** How emotional is the memory? (0-1) */
  memoryEmotionalWeight: number;
}

/**
 * Receptivity score result
 */
export interface ReceptivityScore {
  /** Overall receptivity score (0-1) */
  score: number;

  /** Score breakdown by factor */
  breakdown: {
    /** Base score from user state */
    userState: number;
    /** Adjustment from emotional state */
    emotional: number;
    /** Adjustment from conversation depth */
    conversationDepth: number;
    /** Adjustment from learned patterns */
    learnedPatterns: number;
    /** Adjustment from memory relevance */
    memoryRelevance: number;
    /** Adjustment from trust level */
    trust: number;
  };

  /** Confidence in this score (0-1) */
  confidence: number;

  /** Factors that boosted the score */
  boosters: string[];

  /** Factors that reduced the score */
  reducers: string[];
}

// ============================================================================
// SCORER IMPLEMENTATION
// ============================================================================

/**
 * Receptivity Scorer
 *
 * Scores user's receptivity to memory callbacks based on multiple factors.
 */
export class ReceptivityScorer {
  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
    log.debug('ReceptivityScorer initialized');
  }

  /**
   * Score user's receptivity to a memory callback
   */
  async score(input: ReceptivityInput): Promise<ReceptivityScore> {
    const boosters: string[] = [];
    const reducers: string[] = [];

    // 1. Base score from user state (0.3 - 0.8)
    const userStateScore = this.scoreUserState(input.userState, boosters, reducers);

    // 2. Emotional adjustment (-0.3 to +0.2)
    const emotionalAdjustment = this.scoreEmotional(input.emotionalState, boosters, reducers);

    // 3. Conversation depth adjustment (-0.2 to +0.2)
    const depthAdjustment = this.scoreConversationDepth(input.conversationContext, boosters, reducers);

    // 4. Learned patterns adjustment (-0.2 to +0.2)
    const learnedAdjustment = this.scoreLearnedPatterns(input.userProfile, input.userState, boosters, reducers);

    // 5. Memory relevance adjustment (-0.1 to +0.2)
    const relevanceAdjustment = this.scoreMemoryRelevance(input.memoryRelevance, boosters, reducers);

    // 6. Trust adjustment (0 to +0.2)
    const trustAdjustment = this.scoreTrust(input.conversationContext.trustLevel, boosters, reducers);

    // Combine scores
    const rawScore =
      userStateScore +
      emotionalAdjustment +
      depthAdjustment +
      learnedAdjustment +
      relevanceAdjustment +
      trustAdjustment;

    // Clamp to 0-1
    const score = Math.max(0, Math.min(1, rawScore));

    // Calculate confidence based on available data
    const confidence = this.calculateConfidence(input);

    return {
      score,
      breakdown: {
        userState: userStateScore,
        emotional: emotionalAdjustment,
        conversationDepth: depthAdjustment,
        learnedPatterns: learnedAdjustment,
        memoryRelevance: relevanceAdjustment,
        trust: trustAdjustment,
      },
      confidence,
      boosters,
      reducers,
    };
  }

  /**
   * Score based on user's current state
   */
  private scoreUserState(state: UserState, boosters: string[], reducers: string[]): number {
    let score = 0.5; // Base

    // Energy level (major factor)
    if (state.energy >= 0.7) {
      score += 0.15;
      boosters.push('High energy');
    } else if (state.energy < 0.3) {
      score -= 0.2;
      reducers.push('Low energy');
    }

    // Cognitive load
    if (state.cognitiveLoad < 0.3) {
      score += 0.1;
      boosters.push('Low cognitive load');
    } else if (state.cognitiveLoad > 0.7) {
      score -= 0.15;
      reducers.push('High cognitive load');
    }

    // Time of day
    if (state.timeOfDay === 'morning' || state.timeOfDay === 'afternoon') {
      score += 0.05;
    } else if (state.timeOfDay === 'late_night') {
      score -= 0.1;
      reducers.push('Late night');
    }

    // Rushed
    if (state.isRushed) {
      score -= 0.15;
      reducers.push('User is rushed');
    }

    // Mood
    if (state.mood === 'positive') {
      score += 0.1;
      boosters.push('Positive mood');
    } else if (state.mood === 'negative') {
      score -= 0.1;
      reducers.push('Negative mood');
    }

    return Math.max(0.3, Math.min(0.8, score));
  }

  /**
   * Score based on emotional state
   */
  private scoreEmotional(state: EmotionalState, boosters: string[], reducers: string[]): number {
    let adjustment = 0;

    // High intensity emotions are bad for memory callbacks
    if (state.intensity > 0.8) {
      adjustment -= 0.3;
      reducers.push('Intense emotions');
    } else if (state.intensity > 0.6) {
      adjustment -= 0.1;
    } else if (state.intensity < 0.3) {
      adjustment += 0.1;
      boosters.push('Calm emotional state');
    }

    // Vulnerability requires care
    if (state.isVulnerable) {
      adjustment -= 0.1;
      reducers.push('User is vulnerable');
    }

    // Positive trajectory is good
    if (state.trajectory === 'improving') {
      adjustment += 0.1;
      boosters.push('Emotional trajectory improving');
    } else if (state.trajectory === 'declining') {
      adjustment -= 0.1;
      reducers.push('Emotional trajectory declining');
    }

    // Positive valence is slightly better
    if (state.valence > 0.3) {
      adjustment += 0.05;
    }

    return adjustment;
  }

  /**
   * Score based on conversation depth
   */
  private scoreConversationDepth(context: ConversationContext, boosters: string[], reducers: string[]): number {
    let adjustment = 0;

    // Very early in conversation - bad
    if (context.recentMessages.length < 3) {
      adjustment -= 0.2;
      reducers.push('Conversation too shallow');
    }
    // Sweet spot (5-15 turns)
    else if (context.recentMessages.length >= 5 && context.recentMessages.length <= 15) {
      adjustment += 0.15;
      boosters.push('Good conversation depth');
    }
    // Very long conversation - slightly reduced (fatigue)
    else if (context.recentMessages.length > 30) {
      adjustment -= 0.05;
    }

    // Recent memory surfacing
    if (context.turnsSinceLastMemory < 5) {
      adjustment -= 0.15;
      reducers.push('Recent memory surfacing');
    } else if (context.turnsSinceLastMemory > 10) {
      adjustment += 0.1;
      boosters.push('Time since last memory');
    }

    return adjustment;
  }

  /**
   * Score based on learned patterns
   */
  private scoreLearnedPatterns(
    profile: UserMemoryProfile | undefined,
    state: UserState,
    boosters: string[],
    reducers: string[]
  ): number {
    if (!profile) {
      return 0; // No learned data
    }

    let adjustment = 0;

    // Check time of day pattern
    const hour = new Date().getHours();
    const timeReceptivity = profile.receptivityPatterns.byTimeOfDay.get(hour);
    if (timeReceptivity !== undefined) {
      if (timeReceptivity > 0.6) {
        adjustment += 0.1;
        boosters.push('Good time based on history');
      } else if (timeReceptivity < 0.4) {
        adjustment -= 0.1;
        reducers.push('Poor time based on history');
      }
    }

    // Check emotional state pattern
    const emotionReceptivity = profile.receptivityPatterns.byEmotionalState.get(state.mood);
    if (emotionReceptivity !== undefined) {
      if (emotionReceptivity > 0.6) {
        adjustment += 0.1;
        boosters.push('Good emotional state based on history');
      } else if (emotionReceptivity < 0.4) {
        adjustment -= 0.1;
        reducers.push('Poor emotional state based on history');
      }
    }

    // Overall engagement rate influences confidence
    if (profile.engagementRate > 0.7) {
      adjustment += 0.05;
    } else if (profile.engagementRate < 0.3) {
      adjustment -= 0.1;
      reducers.push('Low historical engagement');
    }

    return adjustment;
  }

  /**
   * Score based on memory relevance
   */
  private scoreMemoryRelevance(relevance: number, boosters: string[], reducers: string[]): number {
    if (relevance > 0.8) {
      boosters.push('Highly relevant memory');
      return 0.2;
    } else if (relevance > 0.6) {
      boosters.push('Relevant memory');
      return 0.1;
    } else if (relevance < 0.3) {
      reducers.push('Low relevance memory');
      return -0.1;
    }
    return 0;
  }

  /**
   * Score based on trust level
   */
  private scoreTrust(trustLevel: TrustLevel, boosters: string[], reducers: string[]): number {
    switch (trustLevel) {
      case 'deep':
        boosters.push('Deep trust');
        return 0.2;
      case 'established':
        boosters.push('Established trust');
        return 0.1;
      case 'developing':
        return 0.05;
      case 'new':
        return 0;
      default:
        return 0;
    }
  }

  /**
   * Calculate confidence in the score
   */
  private calculateConfidence(input: ReceptivityInput): number {
    let confidence = 0.6; // Base confidence

    // Higher confidence with user profile
    if (input.userProfile) {
      confidence += 0.2;

      // Even higher with good data
      if (input.userProfile.totalMemoriesSurfaced > 10) {
        confidence += 0.1;
      }
    }

    // Reduce confidence if emotional state is extreme
    if (input.emotionalState.intensity > 0.8) {
      confidence -= 0.1;
    }

    return Math.max(0.3, Math.min(1.0, confidence));
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let scorerInstance: ReceptivityScorer | null = null;

export function getReceptivityScorer(): ReceptivityScorer {
  if (!scorerInstance) {
    scorerInstance = new ReceptivityScorer();
  }
  return scorerInstance;
}

export function resetReceptivityScorer(): void {
  scorerInstance = null;
}

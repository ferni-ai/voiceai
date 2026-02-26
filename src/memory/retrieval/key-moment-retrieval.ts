/**
 * Key Moment Retrieval - GAP 2.2
 *
 * Surfaces relevant key moments from past conversations
 * to create emotional continuity and build relationship depth.
 *
 * Now integrates with UserLearningEngine to include current session moments.
 */

import type { UserProfile, KeyMoment } from '../../types/user-profile.js';
import type { EmotionResult } from '../../types/emotion-types.js';
import { getLogger } from '../../utils/safe-logger.js';

// Optional integration with learning engine for current session
let currentSessionMomentsGetter: (() => KeyMoment[]) | null = null;

/**
 * Set the function to get current session moments from learning engine
 * Called by services/index.ts during session setup
 */
export function setCurrentSessionMomentsGetter(getter: () => KeyMoment[]): void {
  currentSessionMomentsGetter = getter;
}

/**
 * Clear the getter (on session end)
 */
export function clearCurrentSessionMomentsGetter(): void {
  currentSessionMomentsGetter = null;
}

// ============================================================================
// TYPES
// ============================================================================

export interface KeyMomentMatch {
  moment: KeyMoment;
  relevanceScore: number;
  reason: string;
}

// ============================================================================
// KEY MOMENT RETRIEVAL
// ============================================================================

export class KeyMomentRetrieval {
  /**
   * Find relevant key moments based on current context
   * Now includes current session moments from learning engine
   */
  async findRelevantMoments(
    profile: UserProfile,
    context: {
      currentTopic?: string;
      currentEmotion: EmotionResult;
      turnCount: number;
    }
  ): Promise<KeyMomentMatch | null> {
    // Combine profile moments with current session moments
    const profileMoments = profile.keyMoments || [];
    const sessionMoments = currentSessionMomentsGetter ? currentSessionMomentsGetter() : [];
    const allMoments = [...profileMoments, ...sessionMoments];

    if (allMoments.length === 0) {
      return null;
    }

    const matches: KeyMomentMatch[] = [];

    for (const moment of allMoments) {
      const score = this.calculateRelevance(moment, context);
      if (score > 0.3) {
        matches.push({
          moment,
          relevanceScore: score,
          reason: this.explainMatch(moment, context),
        });
      }
    }

    if (matches.length === 0) return null;

    // Sort by relevance and return top match
    matches.sort((a, b) => b.relevanceScore - a.relevanceScore);
    const topMatch = matches[0];

    getLogger().info('Found relevant key moment', {
      type: topMatch.moment.type,
      score: topMatch.relevanceScore,
      reason: topMatch.reason,
      source: sessionMoments.includes(topMatch.moment) ? 'current_session' : 'profile',
    });

    return topMatch;
  }

  /**
   * Calculate relevance score for a key moment
   */
  private calculateRelevance(
    moment: KeyMoment,
    context: {
      currentTopic?: string;
      currentEmotion: EmotionResult;
      turnCount: number;
    }
  ): number {
    let score = 0;

    // Topic match (high value)
    if (context.currentTopic && moment.topics.includes(context.currentTopic)) {
      score += 0.5;
    }

    // Emotional similarity (medium value)
    const emotionMatch = this.matchEmotionToMomentType(context.currentEmotion.primary, moment.type);
    score += emotionMatch * 0.3;

    // Recency bonus (newer moments are more relevant)
    const daysSince = Math.floor(
      (Date.now() - new Date(moment.timestamp).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSince < 7) {
      score += 0.2;
    } else if (daysSince < 30) {
      score += 0.1;
    }

    // Emotional weight matching
    if (moment.emotionalWeight === 'heavy' && context.currentEmotion.distressLevel > 0.5) {
      score += 0.2;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Match current emotion to moment type
   */
  private matchEmotionToMomentType(emotion: string, momentType: KeyMoment['type']): number {
    const emotionMomentMap: Record<string, Array<KeyMoment['type']>> = {
      fear: ['concern', 'shared_vulnerability'],
      sadness: ['shared_vulnerability', 'concern'],
      anxiety: ['concern', 'shared_vulnerability'],
      joy: ['celebration', 'breakthrough'],
      gratitude: ['celebration', 'breakthrough'],
      confidence: ['breakthrough', 'decision'],
      determination: ['decision', 'breakthrough'],
    };

    const matchingTypes = emotionMomentMap[emotion] || [];
    return matchingTypes.includes(momentType) ? 1.0 : 0.0;
  }

  /**
   * Explain why a moment matched
   */
  private explainMatch(
    moment: KeyMoment,
    context: {
      currentTopic?: string;
      currentEmotion: EmotionResult;
    }
  ): string {
    const reasons: string[] = [];

    if (context.currentTopic && moment.topics.includes(context.currentTopic)) {
      reasons.push(`Same topic: ${context.currentTopic}`);
    }

    const emotionMatch = this.matchEmotionToMomentType(context.currentEmotion.primary, moment.type);
    if (emotionMatch > 0) {
      reasons.push(`Similar emotion: ${context.currentEmotion.primary} → ${moment.type}`);
    }

    if (reasons.length === 0) {
      reasons.push('General context match');
    }

    return reasons.join('; ');
  }

  /**
   * Generate a natural reference to a key moment
   */
  generateMomentReference(match: KeyMomentMatch, userName?: string): string {
    const { moment } = match;
    const timeAgo = this.getTimeAgoString(moment.timestamp);

    // Reference the moment by summary
    const references = [
      `${userName ? `${userName}, ` : ''}${timeAgo} we talked about ${moment.summary}. How's that been going?`,
      `I've been thinking about what you shared ${timeAgo}—${moment.summary}. Tell me more.`,
      `${timeAgo}, ${moment.summary}. I wanted to circle back to that.`,
      `Do you remember ${timeAgo} when ${moment.summary}? I've been reflecting on that.`,
    ];

    return references[Math.floor(Math.random() * references.length)];
  }

  /**
   * Convert timestamp to natural time ago string
   */
  private getTimeAgoString(timestamp: Date | string): string {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    const diffMs = Date.now() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);

    if (diffDays < 1) {
      return 'earlier today';
    } else if (diffDays === 1) {
      return 'yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else if (diffWeeks === 1) {
      return 'last week';
    } else if (diffWeeks < 4) {
      return `${diffWeeks} weeks ago`;
    } else if (diffMonths === 1) {
      return 'last month';
    } else if (diffMonths < 12) {
      return `${diffMonths} months ago`;
    } else {
      return 'last year';
    }
  }

  /**
   * Should we reference a key moment? (Timing logic)
   */
  shouldReferenceKeyMoment(turnCount: number): boolean {
    // Don't reference in first few turns (let conversation warm up)
    if (turnCount < 3) return false;

    // Every 8-12 turns, consider referencing
    if (turnCount % 10 === 0) return true;

    // 10% chance on any turn after warmup
    return Math.random() < 0.1;
  }
}

// Singleton instance
let retrieval: KeyMomentRetrieval | null = null;

/**
 * Get singleton key moment retrieval
 */
export function getKeyMomentRetrieval(): KeyMomentRetrieval {
  if (!retrieval) {
    retrieval = new KeyMomentRetrieval();
  }
  return retrieval;
}

/**
 * Reset for testing
 */
export function resetKeyMomentRetrieval(): void {
  retrieval = null;
}

export default KeyMomentRetrieval;

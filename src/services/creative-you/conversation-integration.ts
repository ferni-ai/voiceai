/**
 * 🔗 Creative You - Conversation Integration
 *
 * Connects Ferni's conversation analysis to Creative You content recommendations.
 * This is the "magic" that makes content feel truly personalized based on
 * what you talk about with Ferni.
 *
 * ✨ "MORE THAN HUMAN" FEATURES:
 * - Surfaces content related to recent conversations
 * - Detects optimal moments to suggest content
 * - Remembers topics across conversations
 * - Creates natural bridges between talk and learn
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { ConversationState } from '../../intelligence/conversation-state.js';
import type { TopicExtractionResult } from '../../intelligence/topic-tracker.js';
import { createIntelligentCurator, type IntelligentRecommendation } from './intelligent-curator.js';
import { getCreativeDNA, updateCreativeDNA } from './creative-dna.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface ConversationContentContext {
  userId: string;
  sessionId: string;
  topicsDiscussed: string[];
  currentTopic?: string;
  emotionalState?: string;
  distressLevel?: number;
  turnCount: number;
}

export interface ContentSuggestion {
  shouldSuggest: boolean;
  suggestion?: IntelligentRecommendation;
  reason?: string;
  timing: 'immediate' | 'end_of_conversation' | 'next_session';
  transitionPhrase?: string;
}

// ============================================================================
// USER TOPIC HISTORY
// ============================================================================

// Store topic history per user for cross-conversation recommendations
const userTopicHistory = new Map<
  string,
  {
    topics: Array<{ topic: string; timestamp: Date; count: number }>;
    lastUpdated: Date;
  }
>();

/**
 * Record topics from a conversation
 */
export function recordConversationTopics(
  userId: string,
  topics: string[],
  sessionId: string
): void {
  const existing = userTopicHistory.get(userId) || {
    topics: [],
    lastUpdated: new Date(),
  };

  for (const topic of topics) {
    const existingTopic = existing.topics.find(
      (t) => t.topic.toLowerCase() === topic.toLowerCase()
    );
    if (existingTopic) {
      existingTopic.count++;
      existingTopic.timestamp = new Date();
    } else {
      existing.topics.push({
        topic,
        timestamp: new Date(),
        count: 1,
      });
    }
  }

  // Sort by recency and frequency
  existing.topics.sort((a, b) => {
    // Weight by both recency and frequency
    const aScore = a.count * 0.3 + (Date.now() - a.timestamp.getTime()) / -100000000;
    const bScore = b.count * 0.3 + (Date.now() - b.timestamp.getTime()) / -100000000;
    return bScore - aScore;
  });

  // Keep top 50 topics
  existing.topics = existing.topics.slice(0, 50);
  existing.lastUpdated = new Date();

  userTopicHistory.set(userId, existing);

  log.debug(
    {
      userId,
      sessionId,
      newTopics: topics,
      totalTopics: existing.topics.length,
    },
    '📚 Recorded conversation topics'
  );
}

/**
 * Get user's top topics for content recommendations
 */
export function getUserTopTopics(userId: string, count: number = 10): string[] {
  const history = userTopicHistory.get(userId);
  if (!history) return [];

  return history.topics.slice(0, count).map((t) => t.topic);
}

/**
 * Get topic frequency for a user
 */
export function getTopicFrequency(userId: string, topic: string): number {
  const history = userTopicHistory.get(userId);
  if (!history) return 0;

  const found = history.topics.find((t) => t.topic.toLowerCase() === topic.toLowerCase());
  return found?.count || 0;
}

// ============================================================================
// CONTENT SUGGESTION LOGIC
// ============================================================================

/**
 * Determine if we should suggest content based on conversation context
 */
export async function shouldSuggestContent(
  context: ConversationContentContext
): Promise<ContentSuggestion> {
  const { userId, topicsDiscussed, currentTopic, emotionalState, distressLevel, turnCount } =
    context;

  // 1. Never suggest during distress
  if (distressLevel && distressLevel > 0.5) {
    return {
      shouldSuggest: false,
      timing: 'next_session',
      reason: 'User is in distress - focus on support',
    };
  }

  // 2. Don't suggest too early in conversation
  if (turnCount < 5) {
    return {
      shouldSuggest: false,
      timing: 'end_of_conversation',
      reason: 'Too early in conversation',
    };
  }

  // 3. Check if current topic has good content available
  if (currentTopic) {
    const curator = createIntelligentCurator(userId, {
      recentTopics: [currentTopic, ...topicsDiscussed.slice(0, 3)],
    });

    const recommendations = await curator.getRecommendations({ count: 1 });

    if (recommendations.length > 0 && recommendations[0].relevanceScore > 0.7) {
      const rec = recommendations[0];
      return {
        shouldSuggest: true,
        suggestion: rec,
        timing: 'end_of_conversation',
        reason: `Found relevant content for ${currentTopic}`,
        transitionPhrase: generateTransitionPhrase(currentTopic, rec),
      };
    }
  }

  // 4. Check if we have accumulated enough topics for a suggestion
  if (topicsDiscussed.length >= 3) {
    const userTopics = getUserTopTopics(userId, 5);
    const curator = createIntelligentCurator(userId, {
      recentTopics: [...topicsDiscussed, ...userTopics],
    });

    const recommendations = await curator.getRecommendations({ count: 1 });

    if (recommendations.length > 0) {
      return {
        shouldSuggest: true,
        suggestion: recommendations[0],
        timing: 'end_of_conversation',
        reason: 'Accumulated enough topics for recommendation',
        transitionPhrase: "By the way, I found something you might enjoy...",
      };
    }
  }

  return {
    shouldSuggest: false,
    timing: 'next_session',
    reason: 'No relevant content found',
  };
}

/**
 * Generate a natural transition phrase to suggest content
 */
function generateTransitionPhrase(topic: string, recommendation: IntelligentRecommendation): string {
  const contentType = recommendation.contentType === 'video' ? 'video' : 'podcast episode';
  const title =
    recommendation.contentType === 'video'
      ? (recommendation.content as any).video?.title
      : (recommendation.content as any).episode?.title;

  const phrases = [
    `Speaking of ${topic}, I know a great ${contentType} you might enjoy: "${title}"`,
    `That reminds me - there's a ${contentType} that connects to what we're discussing...`,
    `You know, our conversation about ${topic} made me think of something you might like...`,
    `When you have a moment, I found a ${contentType} related to ${topic} that I think you'd appreciate.`,
    `This ties into what we've been talking about - want me to save "${title}" for later?`,
  ];

  return phrases[Math.floor(Math.random() * phrases.length)];
}

// ============================================================================
// CONVERSATION HOOKS
// ============================================================================

/**
 * Hook to call at end of conversation to get content suggestion
 */
export async function getEndOfConversationSuggestion(
  userId: string,
  sessionId: string,
  conversationState: ConversationState,
  topicResult: TopicExtractionResult
): Promise<ContentSuggestion> {
  // Record topics for future recommendations
  if (topicResult.detected.length > 0) {
    recordConversationTopics(userId, topicResult.detected, sessionId);
  }

  const context: ConversationContentContext = {
    userId,
    sessionId,
    topicsDiscussed: conversationState.topicsDiscussed,
    currentTopic: conversationState.currentTopic || undefined,
    distressLevel: conversationState.distressLevel,
    turnCount: conversationState.turnCount,
  };

  return shouldSuggestContent(context);
}

/**
 * Get personalized content for "Creative You" menu based on conversation history
 */
export async function getPersonalizedCreativeYouContent(
  userId: string
): Promise<{
  recommendations: IntelligentRecommendation[];
  personalizedTrackAvailable: boolean;
  topTopics: string[];
}> {
  const topTopics = getUserTopTopics(userId, 5);
  const dna = getCreativeDNA(userId);

  const curator = createIntelligentCurator(userId, {
    recentTopics: topTopics,
  });

  const recommendations = await curator.getRecommendations({ count: 6 });

  // Check if we have enough data for a personalized track
  const personalizedTrackAvailable =
    topTopics.length >= 2 && (dna.totalVideosWatched + dna.totalPodcastsListened >= 3);

  return {
    recommendations,
    personalizedTrackAvailable,
    topTopics,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  userTopicHistory, // For testing
};


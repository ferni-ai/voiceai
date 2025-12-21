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
import { getCreativeDNA } from './creative-dna.js';
import { getCreativeYouPersistence } from './persistence.js';

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

// In-memory cache for topic history (syncs to Firestore)
const userTopicCache = new Map<
  string,
  {
    topics: Array<{ topic: string; timestamp: Date; count: number }>;
    lastUpdated: Date;
    pendingSync: boolean;
  }
>();

/**
 * Record topics from a conversation (persists to Firestore)
 */
export function recordConversationTopics(
  userId: string,
  topics: string[],
  sessionId: string
): void {
  // Update in-memory cache immediately (for fast access)
  const cached = userTopicCache.get(userId) || {
    topics: [],
    lastUpdated: new Date(),
    pendingSync: false,
  };

  for (const topic of topics) {
    const existingTopic = cached.topics.find((t) => t.topic.toLowerCase() === topic.toLowerCase());
    if (existingTopic) {
      existingTopic.count++;
      existingTopic.timestamp = new Date();
    } else {
      cached.topics.push({
        topic,
        timestamp: new Date(),
        count: 1,
      });
    }
  }

  // Sort by recency and frequency
  cached.topics.sort((a, b) => {
    const aScore = a.count * 0.3 + (Date.now() - a.timestamp.getTime()) / -100000000;
    const bScore = b.count * 0.3 + (Date.now() - b.timestamp.getTime()) / -100000000;
    return bScore - aScore;
  });

  // Keep top 50 topics
  cached.topics = cached.topics.slice(0, 50);
  cached.lastUpdated = new Date();

  userTopicCache.set(userId, cached);

  log.debug(
    {
      userId,
      sessionId,
      newTopics: topics,
      totalTopics: cached.topics.length,
    },
    '📚 Recorded conversation topics'
  );

  // Fire-and-forget Firestore persistence
  void (async () => {
    try {
      const persistence = getCreativeYouPersistence();
      await persistence.saveTopicHistory(userId, topics, sessionId);
    } catch (error) {
      log.warn({ error: String(error) }, 'Topic history persistence failed (non-critical)');
    }
  })();
}

/**
 * Get user's top topics for content recommendations
 * Uses cache first, then Firestore
 */
export async function getUserTopTopics(userId: string, count: number = 10): Promise<string[]> {
  // Check cache first
  const cached = userTopicCache.get(userId);
  if (cached && cached.topics.length > 0) {
    return cached.topics.slice(0, count).map((t) => t.topic);
  }

  // Load from Firestore
  try {
    const persistence = getCreativeYouPersistence();
    return await persistence.getTopTopics(userId, count);
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to load topics from Firestore');
    return [];
  }
}

/**
 * Get user's top topics synchronously (cache only - for fast access)
 */
export function getUserTopTopicsSync(userId: string, count: number = 10): string[] {
  const cached = userTopicCache.get(userId);
  if (!cached) return [];
  return cached.topics.slice(0, count).map((t) => t.topic);
}

/**
 * Get topic frequency for a user
 */
export function getTopicFrequency(userId: string, topic: string): number {
  const cached = userTopicCache.get(userId);
  if (!cached) return 0;

  const found = cached.topics.find((t) => t.topic.toLowerCase() === topic.toLowerCase());
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
    const userTopics = getUserTopTopicsSync(userId, 5);
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
        transitionPhrase: "Before you go - there's something I want to show you.",
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
 * Brand voice: Friend sharing something, not algorithm recommending
 */
function generateTransitionPhrase(
  topic: string,
  recommendation: IntelligentRecommendation
): string {
  const title =
    recommendation.contentType === 'video'
      ? (recommendation.content as unknown as { video?: { title: string } }).video?.title
      : (recommendation.content as unknown as { episode?: { title: string } }).episode?.title;

  // Natural, friend-like transitions (not "I found a video you might enjoy")
  const phrases = [
    `Oh - this made me think of something. Have you seen "${title}"?`,
    `Wait, that reminds me. There's this thing about ${topic} you need to see.`,
    `Before I forget - I keep wanting to share "${title}" with you.`,
    `You know what? Our ${topic} conversation made me think of this. Check it out later?`,
    `Okay, random - but "${title}" feels like it was made for what we're talking about.`,
    `I've been wanting to show you something. It connects to what you said about ${topic}.`,
    `Oh, this is perfect timing. Remember ${topic}? Watch this.`,
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
export async function getPersonalizedCreativeYouContent(userId: string): Promise<{
  recommendations: IntelligentRecommendation[];
  personalizedTrackAvailable: boolean;
  topTopics: string[];
}> {
  const topTopics = await getUserTopTopics(userId, 5);
  const dna = getCreativeDNA(userId);

  const curator = createIntelligentCurator(userId, {
    recentTopics: topTopics,
  });

  const recommendations = await curator.getRecommendations({ count: 6 });

  // Check if we have enough data for a personalized track
  const personalizedTrackAvailable =
    topTopics.length >= 2 && dna.totalVideosWatched + dna.totalPodcastsListened >= 3;

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
  userTopicCache as userTopicHistory, // For testing (renamed for backward compat)
};

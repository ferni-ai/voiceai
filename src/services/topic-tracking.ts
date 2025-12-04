/**
 * Topic Tracking Service
 * 
 * Tracks topics discussed with each persona for memory callbacks
 * and proactive memory surfacing.
 */

import { getLogger } from '../utils/logger.js';

const logger = getLogger().child({ service: 'TopicTracking' });

// ============================================================================
// Types
// ============================================================================

export interface TrackedTopic {
  topic: string;
  discussedAt: Date;
  emotionalContext?: string;
  significance: 'casual' | 'important' | 'breakthrough';
  resolved?: boolean;
}

export interface TopicTrackingContext {
  userId: string;
  personaId: string;
}

// ============================================================================
// Storage
// ============================================================================

// In-memory storage (would persist to UserProfile in production)
const topicHistory = new Map<string, TrackedTopic[]>(); // userId:personaId -> topics

function getKey(userId: string, personaId: string): string {
  return `${userId}:${personaId}`;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Track a topic discussed in conversation
 */
export function trackTopic(
  userId: string,
  personaId: string,
  topic: string,
  options?: {
    emotionalContext?: string;
    significance?: 'casual' | 'important' | 'breakthrough';
    resolved?: boolean;
  }
): void {
  const key = getKey(userId, personaId);
  let topics = topicHistory.get(key);
  
  if (!topics) {
    topics = [];
    topicHistory.set(key, topics);
  }
  
  // Check if topic already exists
  const existing = topics.find(t => 
    t.topic.toLowerCase() === topic.toLowerCase()
  );
  
  if (existing) {
    // Update existing topic
    existing.discussedAt = new Date();
    if (options?.emotionalContext) existing.emotionalContext = options.emotionalContext;
    if (options?.significance) existing.significance = options.significance;
    if (options?.resolved !== undefined) existing.resolved = options.resolved;
  } else {
    // Add new topic
    topics.push({
      topic,
      discussedAt: new Date(),
      emotionalContext: options?.emotionalContext,
      significance: options?.significance || 'casual',
      resolved: options?.resolved
    });
  }
  
  // Keep only last 50 topics per persona
  if (topics.length > 50) {
    topics.splice(0, topics.length - 50);
  }
  
  logger.debug({ userId, personaId, topic }, 'Tracked topic');
}

/**
 * Get recent topics for a user-persona pair
 */
export function getRecentTopics(
  userId: string,
  personaId: string,
  limit: number = 10
): TrackedTopic[] {
  const key = getKey(userId, personaId);
  const topics = topicHistory.get(key) || [];
  
  // Sort by date descending and return limit
  return [...topics]
    .sort((a, b) => b.discussedAt.getTime() - a.discussedAt.getTime())
    .slice(0, limit);
}

/**
 * Get the last topic discussed
 */
export function getLastTopic(
  userId: string,
  personaId: string
): TrackedTopic | null {
  const recent = getRecentTopics(userId, personaId, 1);
  return recent[0] || null;
}

/**
 * Get unresolved/open topics
 */
export function getOpenTopics(
  userId: string,
  personaId: string
): TrackedTopic[] {
  const key = getKey(userId, personaId);
  const topics = topicHistory.get(key) || [];
  
  return topics.filter(t => t.resolved === false);
}

/**
 * Get important topics (for memory callbacks)
 */
export function getImportantTopics(
  userId: string,
  personaId: string
): TrackedTopic[] {
  const key = getKey(userId, personaId);
  const topics = topicHistory.get(key) || [];
  
  return topics.filter(t => 
    t.significance === 'important' || t.significance === 'breakthrough'
  );
}

/**
 * Find topics by keyword
 */
export function findTopicsByKeyword(
  userId: string,
  personaId: string,
  keyword: string
): TrackedTopic[] {
  const key = getKey(userId, personaId);
  const topics = topicHistory.get(key) || [];
  
  const lowerKeyword = keyword.toLowerCase();
  return topics.filter(t => 
    t.topic.toLowerCase().includes(lowerKeyword)
  );
}

/**
 * Mark a topic as resolved
 */
export function markTopicResolved(
  userId: string,
  personaId: string,
  topic: string
): void {
  const key = getKey(userId, personaId);
  const topics = topicHistory.get(key) || [];
  
  const existing = topics.find(t => 
    t.topic.toLowerCase() === topic.toLowerCase()
  );
  
  if (existing) {
    existing.resolved = true;
    logger.debug({ userId, personaId, topic }, 'Marked topic resolved');
  }
}

/**
 * Get topic for proactive memory surfacing
 * Returns an old topic worth bringing up
 */
export function getTopicForProactiveMemory(
  userId: string,
  personaId: string
): TrackedTopic | null {
  const key = getKey(userId, personaId);
  const topics = topicHistory.get(key) || [];
  
  // Look for important unresolved topics from > 1 week ago
  const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  
  const candidates = topics.filter(t => {
    if (t.resolved) return false;
    if (t.significance === 'casual') return false;
    if (t.discussedAt.getTime() > oneWeekAgo) return false;
    return true;
  });
  
  if (candidates.length === 0) {
    // Fall back to any important topic from > 3 days ago
    const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000);
    const fallback = topics.find(t => 
      (t.significance === 'important' || t.significance === 'breakthrough') &&
      t.discussedAt.getTime() < threeDaysAgo
    );
    return fallback || null;
  }
  
  // Return random candidate
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * Load topics from user profile (for initialization)
 */
export function loadTopicsFromProfile(
  userId: string,
  personaId: string,
  topics: TrackedTopic[]
): void {
  const key = getKey(userId, personaId);
  topicHistory.set(key, topics.map(t => ({
    ...t,
    discussedAt: new Date(t.discussedAt) // Ensure Date objects
  })));
}

/**
 * Get all topics for saving to profile
 */
export function getTopicsForSaving(
  userId: string,
  personaId: string
): TrackedTopic[] {
  const key = getKey(userId, personaId);
  return topicHistory.get(key) || [];
}

/**
 * Clear topic history
 */
export function clearTopicHistory(
  userId: string,
  personaId?: string
): void {
  if (personaId) {
    const key = getKey(userId, personaId);
    topicHistory.delete(key);
  } else {
    // Clear all for user
    for (const key of topicHistory.keys()) {
      if (key.startsWith(`${userId}:`)) {
        topicHistory.delete(key);
      }
    }
  }
}

// Export as service object
export const TopicTrackingService = {
  track: trackTopic,
  getRecent: getRecentTopics,
  getLast: getLastTopic,
  getOpen: getOpenTopics,
  getImportant: getImportantTopics,
  findByKeyword: findTopicsByKeyword,
  markResolved: markTopicResolved,
  getProactiveMemory: getTopicForProactiveMemory,
  loadFromProfile: loadTopicsFromProfile,
  getForSaving: getTopicsForSaving,
  clear: clearTopicHistory,
};

export default TopicTrackingService;


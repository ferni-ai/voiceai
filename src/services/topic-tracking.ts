/**
 * Topic Tracking Service
 *
 * Tracks topics discussed with each persona for memory callbacks
 * and proactive memory surfacing.
 *
 * Persists to user profile for cross-session continuity.
 */

import { getLogger } from '../utils/safe-logger.js';
import { getDefaultStore } from '../memory/index.js';
import type { UserProfile } from '../types/user-profile.js';
import { cleanForFirestore } from '../utils/firestore-utils.js';

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
// Storage (In-memory cache backed by Firestore)
// ============================================================================

// In-memory cache for fast access during session
const topicHistory = new Map<string, TrackedTopic[]>(); // userId:personaId -> topics

// Dirty tracking for batched persistence
const dirtyUsers = new Set<string>();
let persistenceTimer: ReturnType<typeof setTimeout> | null = null;
const PERSISTENCE_DEBOUNCE_MS = 5000; // Batch writes every 5 seconds

function getKey(userId: string, personaId: string): string {
  return `${userId}:${personaId}`;
}

/**
 * Schedule persistence to Firestore (debounced)
 */
function schedulePersistence(userId: string): void {
  dirtyUsers.add(userId);

  if (persistenceTimer) {
    clearTimeout(persistenceTimer);
  }

  persistenceTimer = setTimeout(() => {
    void flushToPersistence();
  }, PERSISTENCE_DEBOUNCE_MS);
}

/**
 * Flush dirty topic data to Firestore
 */
async function flushToPersistence(): Promise<void> {
  if (dirtyUsers.size === 0) return;

  const usersToFlush = Array.from(dirtyUsers);
  dirtyUsers.clear();

  try {
    const store = getDefaultStore();

    for (const userId of usersToFlush) {
      const profile = await store.getProfile(userId);
      if (!profile) continue;

      // Collect topics for all personas for this user
      const perPersonaTopics: Record<string, TrackedTopic[]> = {};

      for (const [key, topics] of topicHistory.entries()) {
        if (key.startsWith(`${userId}:`)) {
          const personaId = key.split(':')[1];
          perPersonaTopics[personaId] = topics;
        }
      }

      // Store in customData.topicHistory
      if (!profile.customData) profile.customData = {};
      profile.customData.topicHistory = perPersonaTopics;

      await store.saveProfile(profile);
      logger.debug(
        { userId, personaCount: Object.keys(perPersonaTopics).length },
        'Persisted topic history'
      );
    }
  } catch (error) {
    logger.warn({ error }, 'Failed to persist topic history');
    // Re-add users to dirty set for retry
    usersToFlush.forEach((u) => dirtyUsers.add(cleanForFirestore(u)));
  }
}

/**
 * Load topic history from user profile
 */
async function loadFromProfile(userId: string): Promise<void> {
  try {
    const store = getDefaultStore();
    const profile = await store.getProfile(userId);

    if (profile?.customData?.topicHistory) {
      const storedTopics = profile.customData.topicHistory as Record<string, TrackedTopic[]>;

      for (const [personaId, topics] of Object.entries(storedTopics)) {
        const key = getKey(userId, personaId);
        topicHistory.set(
          key,
          topics.map((t) => ({
            ...t,
            discussedAt: new Date(t.discussedAt),
          }))
        );
      }

      logger.debug(
        { userId, personaCount: Object.keys(storedTopics).length },
        'Loaded topic history from profile'
      );
    }
  } catch (error) {
    logger.warn({ error, userId }, 'Failed to load topic history from profile');
  }
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Track a topic discussed in conversation
 * Persists to Firestore for cross-session memory
 */
export async function trackTopic(
  userId: string,
  personaId: string,
  topic: string,
  options?: {
    emotionalContext?: string;
    significance?: 'casual' | 'important' | 'breakthrough';
    resolved?: boolean;
  }
): Promise<void> {
  const key = getKey(userId, personaId);
  let topics = topicHistory.get(key);

  // Load from profile if not in cache
  if (!topics) {
    await loadFromProfile(userId);
    topics = topicHistory.get(key);
  }

  if (!topics) {
    topics = [];
    topicHistory.set(key, topics);
  }

  // Check if topic already exists
  const existing = topics.find((t) => t.topic.toLowerCase() === topic.toLowerCase());

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
      resolved: options?.resolved,
    });
  }

  // Keep only last 50 topics per persona
  if (topics.length > 50) {
    topics.splice(0, topics.length - 50);
  }

  // Schedule persistence (debounced)
  schedulePersistence(userId);

  logger.debug({ userId, personaId, topic }, 'Tracked topic');
}

/**
 * Get recent topics for a user-persona pair
 * Loads from profile if not in cache
 */
export async function getRecentTopics(
  userId: string,
  personaId: string,
  limit = 10
): Promise<TrackedTopic[]> {
  const key = getKey(userId, personaId);
  let topics = topicHistory.get(key);

  // Load from profile if not in cache
  if (!topics) {
    await loadFromProfile(userId);
    topics = topicHistory.get(key) || [];
  }

  // Sort by date descending and return limit
  return [...topics]
    .sort((a, b) => b.discussedAt.getTime() - a.discussedAt.getTime())
    .slice(0, limit);
}

/**
 * Get the last topic discussed
 */
export async function getLastTopic(
  userId: string,
  personaId: string
): Promise<TrackedTopic | null> {
  const recent = await getRecentTopics(userId, personaId, 1);
  return recent[0] || null;
}

/**
 * Get unresolved/open topics
 */
export async function getOpenTopics(userId: string, personaId: string): Promise<TrackedTopic[]> {
  const key = getKey(userId, personaId);
  let topics = topicHistory.get(key);

  if (!topics) {
    await loadFromProfile(userId);
    topics = topicHistory.get(key) || [];
  }

  return topics.filter((t) => t.resolved === false);
}

/**
 * Get important topics (for memory callbacks)
 */
export async function getImportantTopics(
  userId: string,
  personaId: string
): Promise<TrackedTopic[]> {
  const key = getKey(userId, personaId);
  let topics = topicHistory.get(key);

  if (!topics) {
    await loadFromProfile(userId);
    topics = topicHistory.get(key) || [];
  }

  return topics.filter((t) => t.significance === 'important' || t.significance === 'breakthrough');
}

/**
 * Find topics by keyword
 */
export async function findTopicsByKeyword(
  userId: string,
  personaId: string,
  keyword: string
): Promise<TrackedTopic[]> {
  const key = getKey(userId, personaId);
  let topics = topicHistory.get(key);

  if (!topics) {
    await loadFromProfile(userId);
    topics = topicHistory.get(key) || [];
  }

  const lowerKeyword = keyword.toLowerCase();
  return topics.filter((t) => t.topic.toLowerCase().includes(lowerKeyword));
}

/**
 * Mark a topic as resolved
 */
export async function markTopicResolved(
  userId: string,
  personaId: string,
  topic: string
): Promise<void> {
  const key = getKey(userId, personaId);
  let topics = topicHistory.get(key);

  if (!topics) {
    await loadFromProfile(userId);
    topics = topicHistory.get(key) || [];
  }

  const existing = topics.find((t) => t.topic.toLowerCase() === topic.toLowerCase());

  if (existing) {
    existing.resolved = true;
    schedulePersistence(userId);
    logger.debug({ userId, personaId, topic }, 'Marked topic resolved');
  }
}

/**
 * Get topic for proactive memory surfacing
 * Returns an old topic worth bringing up
 */
export async function getTopicForProactiveMemory(
  userId: string,
  personaId: string
): Promise<TrackedTopic | null> {
  const key = getKey(userId, personaId);
  let topics = topicHistory.get(key);

  if (!topics) {
    await loadFromProfile(userId);
    topics = topicHistory.get(key) || [];
  }

  // Look for important unresolved topics from > 1 week ago
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const candidates = topics.filter((t) => {
    if (t.resolved) return false;
    if (t.significance === 'casual') return false;
    if (t.discussedAt.getTime() > oneWeekAgo) return false;
    return true;
  });

  if (candidates.length === 0) {
    // Fall back to any important topic from > 3 days ago
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const fallback = topics.find(
      (t) =>
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
  topicHistory.set(
    key,
    topics.map((t) => ({
      ...t,
      discussedAt: new Date(t.discussedAt), // Ensure Date objects
    }))
  );
}

/**
 * Get all topics for saving to profile
 */
export function getTopicsForSaving(userId: string, personaId: string): TrackedTopic[] {
  const key = getKey(userId, personaId);
  return topicHistory.get(key) || [];
}

/**
 * Clear topic history
 */
export async function clearTopicHistory(userId: string, personaId?: string): Promise<void> {
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

  // Persist the cleared state
  schedulePersistence(userId);
}

/**
 * Force immediate persistence (for graceful shutdown)
 */
export async function flushTopicPersistence(): Promise<void> {
  if (persistenceTimer) {
    clearTimeout(persistenceTimer);
    persistenceTimer = null;
  }
  await flushToPersistence();
}

/**
 * Get cache statistics for monitoring.
 */
export function getTopicTrackingStats(): { users: number; entries: number } {
  const users = new Set<string>();
  let entries = 0;
  for (const [key, topics] of topicHistory) {
    const userId = key.split(':')[0];
    users.add(userId);
    entries += topics.length;
  }
  return { users: users.size, entries };
}

/**
 * Clear ALL cached data (for shutdown).
 */
export function clearAllTopicHistory(): void {
  topicHistory.clear();
  dirtyUsers.clear();
  if (persistenceTimer) {
    clearTimeout(persistenceTimer);
    persistenceTimer = null;
  }
  logger.info('🧹 TopicTracking all caches cleared');
}

/**
 * Register with SessionDataManager (call during initialization).
 */
export async function registerTopicTrackingWithSessionManager(): Promise<void> {
  try {
    const { getSessionDataManager } = await import('./session-data-manager.js');
    getSessionDataManager().registerService({
      name: 'TopicTracking',
      clearUserData: async (userId: string) => clearTopicHistory(userId),
      clearAllData: clearAllTopicHistory,
      getStats: getTopicTrackingStats,
    });
  } catch {
    // SessionDataManager may not be initialized yet
    logger.debug('SessionDataManager not available for TopicTracking registration');
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
  flush: flushTopicPersistence,
  getStats: getTopicTrackingStats,
  clearAll: clearAllTopicHistory,
  registerWithSessionManager: registerTopicTrackingWithSessionManager,
};

export default TopicTrackingService;

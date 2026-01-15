/**
 * Memory Lane - Highlight Scorer
 *
 * Scores and ranks memory highlights for surfacing. Uses multiple factors:
 * - Emotional weight (how significant the moment felt)
 * - Uniqueness (how distinctive vs everyday conversation)
 * - Growth indicator (shows personal progress)
 * - Temporal relevance (anniversary boost, recency for new users)
 * - Topic relevance (matches current conversation)
 * - User preferences (previously loved memories get boost)
 *
 * @module services/memory-lane/highlight-scorer
 */

import { createLogger } from '../../utils/safe-logger.js';
import type {
  MemoryHighlight,
  MemoryScoringContext,
  ScoringWeights,
  DEFAULT_SCORING_WEIGHTS,
  MemoryQueryOptions,
  MemoryQueryResult,
} from './types.js';
import { loadMemories } from './memory-collector.js';

const log = createLogger({ module: 'HighlightScorer' });

// ============================================================================
// CONSTANTS
// ============================================================================

// Default weights (can be overridden)
const WEIGHTS: ScoringWeights = {
  emotionalWeight: 0.25,
  uniqueness: 0.15,
  growthIndicator: 0.2,
  recency: 0.1,
  anniversaryBoost: 0.15,
  topicRelevance: 0.1,
  neverSurfaced: 0.05,
  userLoved: 0.1,
};

// Cooldown period before re-surfacing a memory (in days)
const DEFAULT_SURFACING_COOLDOWN_DAYS = 30;

// ============================================================================
// SCORING FUNCTIONS
// ============================================================================

/**
 * Calculate the overall score for a memory highlight
 */
export function scoreMemory(
  memory: MemoryHighlight,
  context: MemoryScoringContext,
  weights: ScoringWeights = WEIGHTS
): number {
  let score = 0;

  // Base scores from memory properties (0-1)
  score += memory.emotionalWeight * weights.emotionalWeight;
  score += memory.uniqueness * weights.uniqueness;
  score += memory.growthIndicator * weights.growthIndicator;

  // Recency factor
  const recencyScore = calculateRecencyScore(memory, context);
  score += recencyScore * weights.recency;

  // Anniversary boost (same day/month from previous year)
  const anniversaryScore = calculateAnniversaryScore(memory, context);
  score += anniversaryScore * weights.anniversaryBoost;

  // Topic relevance (if query context provides current topic)
  if (context.queryContext?.currentTopic) {
    const topicScore = calculateTopicRelevance(memory, context.queryContext.currentTopic);
    score += topicScore * weights.topicRelevance;
  }

  // Never surfaced bonus
  if (memory.timesSurfaced === 0) {
    score += 1.0 * weights.neverSurfaced;
  }

  // User previously loved this memory
  const hasLoved = memory.reactions.some((r) => r.reaction === 'loved');
  if (hasLoved) {
    score += 1.0 * weights.userLoved;
  }

  // Penalty for dismissed memories
  const hasDismissed = memory.reactions.some((r) => r.reaction === 'dismissed');
  if (hasDismissed) {
    score *= 0.5; // 50% penalty
  }

  // Clamp to 0-1
  return Math.max(0, Math.min(1, score));
}

/**
 * Calculate recency score - newer memories score higher for new users,
 * but for established users, older meaningful memories also score well
 */
function calculateRecencyScore(memory: MemoryHighlight, context: MemoryScoringContext): number {
  const memoryAge = context.currentDate.getTime() - new Date(memory.occurredAt).getTime();
  const daysOld = memoryAge / (24 * 60 * 60 * 1000);

  // For new users (< 30 days of memories), prefer recent
  const userAge = context.userFirstMemoryDate
    ? (context.currentDate.getTime() - context.userFirstMemoryDate.getTime()) /
      (24 * 60 * 60 * 1000)
    : 365;

  if (userAge < 30) {
    // New user: exponential decay, recent is better
    return Math.exp(-daysOld / 30);
  }

  // Established user: bell curve - not too recent, not too old
  // Sweet spot around 3-6 months old
  const optimalDays = 120; // 4 months
  const spread = 90; // 3 months spread
  return Math.exp(-Math.pow(daysOld - optimalDays, 2) / (2 * spread * spread));
}

/**
 * Calculate anniversary score - big boost if memory is from same day in previous year(s)
 */
function calculateAnniversaryScore(memory: MemoryHighlight, context: MemoryScoringContext): number {
  const memoryDate = new Date(memory.occurredAt);
  const currentDate = context.currentDate;

  const sameMonth = memoryDate.getMonth() === currentDate.getMonth();
  const sameDay = memoryDate.getDate() === currentDate.getDate();
  const differentYear = memoryDate.getFullYear() < currentDate.getFullYear();

  if (sameMonth && sameDay && differentYear) {
    // Full anniversary bonus
    return 1.0;
  }

  // Within a week of the anniversary date
  const dayOfYear = (d: Date) => {
    const start = new Date(d.getFullYear(), 0, 0);
    const diff = d.getTime() - start.getTime();
    return Math.floor(diff / (24 * 60 * 60 * 1000));
  };

  const memoryDayOfYear = dayOfYear(memoryDate);
  const currentDayOfYear = dayOfYear(currentDate);
  const dayDiff = Math.abs(memoryDayOfYear - currentDayOfYear);

  if (dayDiff <= 7 && differentYear) {
    // Near-anniversary bonus (decays with distance)
    return 0.5 * (1 - dayDiff / 7);
  }

  return 0;
}

/**
 * Calculate topic relevance based on matching tags
 */
function calculateTopicRelevance(memory: MemoryHighlight, currentTopic: string): number {
  if (!memory.topicTags || memory.topicTags.length === 0) {
    return 0;
  }

  const normalizedTopic = currentTopic.toLowerCase();

  // Direct match
  if (memory.topicTags.some((tag) => tag.toLowerCase() === normalizedTopic)) {
    return 1.0;
  }

  // Partial match (topic contains tag or vice versa)
  if (
    memory.topicTags.some(
      (tag) =>
        normalizedTopic.includes(tag.toLowerCase()) || tag.toLowerCase().includes(normalizedTopic)
    )
  ) {
    return 0.5;
  }

  return 0;
}

// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

/**
 * Get scored and ranked memory highlights
 */
export async function getHighlights(
  userId: string,
  options: MemoryQueryOptions = {}
): Promise<MemoryQueryResult> {
  const {
    types,
    emotionalTones,
    personaId,
    topicTags,
    fromDate,
    toDate,
    isOnThisDay,
    excludeRecentlySurfaced = true,
    surfaceCooldownDays = DEFAULT_SURFACING_COOLDOWN_DAYS,
    excludeDismissed = true,
    limit = 20,
    cursor,
    sortBy = 'score',
    sortOrder = 'desc',
  } = options;

  // Load all memories
  let memories = await loadMemories(userId, { types });

  // Apply filters
  memories = filterMemories(memories, {
    emotionalTones,
    personaId,
    topicTags,
    fromDate,
    toDate,
    isOnThisDay,
    excludeRecentlySurfaced,
    surfaceCooldownDays,
    excludeDismissed,
  });

  // Build scoring context
  const scoringContext: MemoryScoringContext = {
    currentDate: new Date(),
    userTotalMemories: memories.length,
    userFirstMemoryDate:
      memories.length > 0
        ? new Date(Math.min(...memories.map((m) => new Date(m.occurredAt).getTime())))
        : undefined,
    queryContext: options.topicTags?.length ? { currentTopic: options.topicTags[0] } : undefined,
  };

  // Score all memories
  const scoredMemories = memories.map((memory) => ({
    ...memory,
    score: scoreMemory(memory, scoringContext),
  }));

  // Sort
  scoredMemories.sort((a, b) => {
    let comparison = 0;
    if (sortBy === 'score') {
      comparison = (b.score ?? 0) - (a.score ?? 0);
    } else if (sortBy === 'date') {
      comparison = new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime();
    } else if (sortBy === 'emotional_weight') {
      comparison = b.emotionalWeight - a.emotionalWeight;
    }
    return sortOrder === 'desc' ? comparison : -comparison;
  });

  // Handle pagination
  let startIndex = 0;
  if (cursor) {
    const cursorIndex = scoredMemories.findIndex((m) => m.id === cursor);
    if (cursorIndex >= 0) {
      startIndex = cursorIndex + 1;
    }
  }

  const paginatedMemories = scoredMemories.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < scoredMemories.length;
  const nextCursor = hasMore ? paginatedMemories[paginatedMemories.length - 1]?.id : undefined;

  return {
    memories: paginatedMemories,
    total: scoredMemories.length,
    hasMore,
    nextCursor,
  };
}

/**
 * Get "On This Day" memories (anniversaries)
 */
export async function getOnThisDayHighlights(
  userId: string,
  options: { limit?: number } = {}
): Promise<MemoryQueryResult> {
  return getHighlights(userId, {
    ...options,
    isOnThisDay: true,
    excludeRecentlySurfaced: false, // Always show anniversaries
    sortBy: 'date',
    sortOrder: 'desc',
  });
}

/**
 * Filter memories based on query options
 */
function filterMemories(
  memories: MemoryHighlight[],
  filters: {
    emotionalTones?: string[];
    personaId?: string;
    topicTags?: string[];
    fromDate?: Date;
    toDate?: Date;
    isOnThisDay?: boolean;
    excludeRecentlySurfaced?: boolean;
    surfaceCooldownDays?: number;
    excludeDismissed?: boolean;
  }
): MemoryHighlight[] {
  const now = new Date();
  const today = { month: now.getMonth(), date: now.getDate() };

  return memories.filter((memory) => {
    // Filter by emotional tones
    if (filters.emotionalTones && filters.emotionalTones.length > 0) {
      if (!filters.emotionalTones.includes(memory.emotionalTone)) {
        return false;
      }
    }

    // Filter by persona
    if (filters.personaId && memory.personaId !== filters.personaId) {
      return false;
    }

    // Filter by topic tags
    if (filters.topicTags && filters.topicTags.length > 0) {
      const hasMatch = filters.topicTags.some((tag) =>
        memory.topicTags.some((mt) => mt.toLowerCase().includes(tag.toLowerCase()))
      );
      if (!hasMatch) return false;
    }

    // Filter by date range
    const memoryDate = new Date(memory.occurredAt);
    if (filters.fromDate && memoryDate < filters.fromDate) {
      return false;
    }
    if (filters.toDate && memoryDate > filters.toDate) {
      return false;
    }

    // Filter for "On This Day" (same month/day, previous years)
    if (filters.isOnThisDay) {
      const sameMonth = memoryDate.getMonth() === today.month;
      const sameDay = memoryDate.getDate() === today.date;
      const previousYear = memoryDate.getFullYear() < now.getFullYear();
      if (!(sameMonth && sameDay && previousYear)) {
        return false;
      }
    }

    // Exclude recently surfaced
    if (filters.excludeRecentlySurfaced && memory.lastSurfacedAt) {
      const daysSinceSurfaced =
        (now.getTime() - new Date(memory.lastSurfacedAt).getTime()) / (24 * 60 * 60 * 1000);
      if (daysSinceSurfaced < (filters.surfaceCooldownDays || 30)) {
        return false;
      }
    }

    // Exclude dismissed
    if (filters.excludeDismissed) {
      const hasDismissed = memory.reactions.some((r) => r.reaction === 'dismissed');
      if (hasDismissed) return false;
    }

    return true;
  });
}

// ============================================================================
// SURFACING STATE MANAGEMENT
// ============================================================================

/**
 * Mark a memory as surfaced
 */
export async function markMemorySurfaced(
  userId: string,
  memoryId: string,
  context?: string
): Promise<boolean> {
  const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
  const db = getFirestoreDb();
  if (!db) return false;

  try {
    const now = new Date();
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('memory_highlights')
      .doc(memoryId)
      .update({
        timesSurfaced: (await import('firebase-admin/firestore')).FieldValue.increment(1),
        lastSurfacedAt: now,
        updatedAt: now,
      });

    log.debug({ userId, memoryId, context }, 'Marked memory as surfaced');
    return true;
  } catch (error) {
    log.warn({ error: String(error), userId, memoryId }, 'Failed to mark memory as surfaced');
    return false;
  }
}

/**
 * Record a user reaction to a memory
 */
export async function recordReaction(
  userId: string,
  memoryId: string,
  reaction: 'loved' | 'dismissed' | 'shared' | 'revisited',
  context?: string
): Promise<boolean> {
  const { getFirestoreDb, cleanForFirestore } = await import('../superhuman/firestore-utils.js');
  const db = getFirestoreDb();
  if (!db) return false;

  try {
    const now = new Date();
    const reactionRecord = {
      reaction,
      reactedAt: now,
      context,
    };

    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('memory_highlights')
      .doc(memoryId)
      .update({
        reactions: (await import('firebase-admin/firestore')).FieldValue.arrayUnion(
          cleanForFirestore(reactionRecord)
        ),
        updatedAt: now,
      });

    log.info({ userId, memoryId, reaction }, 'Recorded memory reaction');
    return true;
  } catch (error) {
    log.warn({ error: String(error), userId, memoryId, reaction }, 'Failed to record reaction');
    return false;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const highlightScorer = {
  scoreMemory,
  getHighlights,
  getOnThisDayHighlights,
  markMemorySurfaced,
  recordReaction,
};

/**
 * Journey Orchestrator
 *
 * The central coordinator for Personal Journey Awareness.
 * Aggregates moments from all sources and decides what/when to share.
 *
 * Responsibilities:
 * 1. Gather moments from all journey services
 * 2. Prioritize based on relevance, timing, and relationship stage
 * 3. Prevent repetition
 * 4. Track delivery for learning
 *
 * Philosophy: Not every moment should be shared. The orchestrator
 * ensures insights feel like gifts, not data dumps.
 *
 * @module services/personal-journey/journey-orchestrator
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { DeliveryRecord, JourneyMoment, JourneyMomentType, JourneySnapshot } from './types.js';

// Import from other journey services
import {
  getChapterGreetingContext,
  getChapterMoments,
  getCurrentChapterSummary,
} from './chapter-detector.js';
import {
  acknowledgeMilestone,
  getRhythm,
  getRhythmGreetingContext,
  getRhythmStats,
  getUnacknowledgedMilestones,
  type RhythmMilestoneType,
} from './rhythm-awareness.js';
import {
  getRelevantTimeMemories,
  getSeasonalGreetingContext,
  markMemoryReferenced,
} from './seasonal-memory.js';

const log = createLogger({ module: 'JourneyOrchestrator' });

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * How recently a moment type can be shared before being suppressed
 */
const MOMENT_COOLDOWNS: Record<JourneyMomentType, number> = {
  rhythm_milestone: 0, // Milestones are one-time
  rhythm_acknowledgment: 7 * 24 * 60 * 60 * 1000, // 7 days
  seasonal_memory: 14 * 24 * 60 * 60 * 1000, // 14 days
  seasonal_pattern: 30 * 24 * 60 * 60 * 1000, // 30 days
  chapter_transition: 7 * 24 * 60 * 60 * 1000, // 7 days
  chapter_reflection: 14 * 24 * 60 * 60 * 1000, // 14 days
  growth_mirror: 21 * 24 * 60 * 60 * 1000, // 21 days
  social_insight: 7 * 24 * 60 * 60 * 1000, // 7 days
  world_awareness: 24 * 60 * 60 * 1000, // 1 day
  community_wisdom: 14 * 24 * 60 * 60 * 1000, // 14 days
};

/**
 * Relationship stage requirements (minimum)
 */
const RELATIONSHIP_STAGES = ['new', 'building', 'established', 'deep'] as const;
type RelationshipStage = (typeof RELATIONSHIP_STAGES)[number];

/**
 * Priority boost based on context
 */
const CONTEXT_BOOSTS = {
  isGreeting: 2, // First turn of conversation
  matchesUserTopic: 3, // User mentioned something related
  isAnniversary: 4, // Milestone anniversary
  isStreak: 2, // Active streak
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

interface UserDeliveryHistory {
  deliveries: DeliveryRecord[];
  lastDeliveryByType: Map<JourneyMomentType, Date>;
}

const deliveryHistoryCache = new Map<string, UserDeliveryHistory>();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get or create delivery history for user
 */
function getDeliveryHistory(userId: string): UserDeliveryHistory {
  let history = deliveryHistoryCache.get(userId);
  if (!history) {
    history = {
      deliveries: [],
      lastDeliveryByType: new Map(),
    };
    deliveryHistoryCache.set(userId, history);
  }
  return history;
}

/**
 * Initialize delivery history from persisted data
 */
export function initializeDeliveryHistory(
  userId: string,
  persistedDeliveries?: DeliveryRecord[]
): void {
  if (persistedDeliveries) {
    const history: UserDeliveryHistory = {
      deliveries: persistedDeliveries,
      lastDeliveryByType: new Map(),
    };

    // Rebuild lastDeliveryByType from deliveries
    for (const delivery of persistedDeliveries) {
      const existing = history.lastDeliveryByType.get(delivery.momentType);
      if (!existing || delivery.deliveredAt > existing) {
        history.lastDeliveryByType.set(delivery.momentType, delivery.deliveredAt);
      }
    }

    deliveryHistoryCache.set(userId, history);
    log.debug('Initialized delivery history', {
      userId,
      totalDeliveries: persistedDeliveries.length,
    });
  }
}

/**
 * Determine user's relationship stage based on rhythm data
 */
function determineRelationshipStage(userId: string): RelationshipStage {
  const stats = getRhythmStats(userId);

  if (stats.totalConversations >= 50 && stats.daysKnown >= 90) {
    return 'deep';
  } else if (stats.totalConversations >= 20 && stats.daysKnown >= 30) {
    return 'established';
  } else if (stats.totalConversations >= 5 && stats.daysKnown >= 7) {
    return 'building';
  }
  return 'new';
}

/**
 * Check if a moment type is in cooldown
 */
function isInCooldown(userId: string, momentType: JourneyMomentType): boolean {
  const history = getDeliveryHistory(userId);
  const lastDelivery = history.lastDeliveryByType.get(momentType);

  if (!lastDelivery) return false;

  const cooldown = MOMENT_COOLDOWNS[momentType];
  const elapsed = Date.now() - lastDelivery.getTime();

  return elapsed < cooldown;
}

/**
 * Check if relationship stage is sufficient
 */
function hasRequiredRelationshipStage(
  currentStage: RelationshipStage,
  requiredStage?: RelationshipStage
): boolean {
  if (!requiredStage) return true;

  const currentIdx = RELATIONSHIP_STAGES.indexOf(currentStage);
  const requiredIdx = RELATIONSHIP_STAGES.indexOf(requiredStage);

  return currentIdx >= requiredIdx;
}

/**
 * Generate a simple hash of content for similarity checking
 */
function simpleHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Gather all available moments from all journey services
 */
export function gatherAllMoments(userId: string): JourneyMoment[] {
  const moments: JourneyMoment[] = [];

  // 1. Rhythm milestones
  try {
    const rhythmMoments = getUnacknowledgedMilestones(userId);
    moments.push(...rhythmMoments);
  } catch (err) {
    log.warn('Failed to gather rhythm moments', { userId, error: String(err) });
  }

  // 2. Seasonal memories
  try {
    const seasonalMoments = getRelevantTimeMemories(userId);
    moments.push(...seasonalMoments);
  } catch (err) {
    log.warn('Failed to gather seasonal moments', { userId, error: String(err) });
  }

  // 3. Chapter insights
  try {
    const chapterMoments = getChapterMoments(userId);
    moments.push(...chapterMoments);
  } catch (err) {
    log.warn('Failed to gather chapter moments', { userId, error: String(err) });
  }

  log.debug('Gathered journey moments', {
    userId,
    total: moments.length,
    byType: moments.reduce(
      (acc, m) => {
        acc[m.type] = (acc[m.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    ),
  });

  return moments;
}

/**
 * Filter moments based on cooldowns and relationship stage
 */
export function filterMoments(userId: string, moments: JourneyMoment[]): JourneyMoment[] {
  const relationshipStage = determineRelationshipStage(userId);
  const history = getDeliveryHistory(userId);

  return moments.filter((moment) => {
    // Check cooldown
    if (isInCooldown(userId, moment.type)) {
      log.debug('Moment filtered: in cooldown', { userId, type: moment.type });
      recordSuppression(userId, 'cooldown');
      return false;
    }

    // Check relationship stage
    if (
      !hasRequiredRelationshipStage(
        relationshipStage,
        moment.requiresRelationshipStage as RelationshipStage
      )
    ) {
      log.debug('Moment filtered: insufficient relationship stage', {
        userId,
        type: moment.type,
        required: moment.requiresRelationshipStage,
        current: relationshipStage,
      });
      recordSuppression(userId, 'relationship_stage');
      return false;
    }

    // Check for similar content recently delivered
    const contentHash = simpleHash(moment.content);
    const recentSimilar = history.deliveries.find(
      (d) =>
        d.contentHash === contentHash &&
        Date.now() - d.deliveredAt.getTime() < 30 * 24 * 60 * 60 * 1000 // 30 days
    );

    if (recentSimilar) {
      log.debug('Moment filtered: similar content recently delivered', {
        userId,
        type: moment.type,
      });
      recordSuppression(userId, 'repetition');
      return false;
    }

    // Check expiration
    if (moment.expiresAt && moment.expiresAt < new Date()) {
      log.debug('Moment filtered: expired', { userId, type: moment.type });
      return false;
    }

    return true;
  });
}

/**
 * Prioritize moments based on context
 */
export function prioritizeMoments(
  moments: JourneyMoment[],
  context: {
    isGreeting?: boolean;
    userText?: string;
    turnCount?: number;
  }
): JourneyMoment[] {
  const scoredMoments = moments.map((moment) => {
    let score = moment.priority;

    // Boost for greeting context
    if (context.isGreeting && context.turnCount === 0) {
      score += CONTEXT_BOOSTS.isGreeting;
    }

    // Boost if user mentioned something related
    if (context.userText) {
      const lower = context.userText.toLowerCase();
      const momentTopics = (moment.context?.keyTopics as string[]) || [];

      for (const topic of momentTopics) {
        if (lower.includes(topic.toLowerCase())) {
          score += CONTEXT_BOOSTS.matchesUserTopic;
          break;
        }
      }
    }

    // Boost for milestones and anniversaries
    if (moment.type === 'rhythm_milestone') {
      const milestoneType = moment.context?.milestoneType as string;
      if (milestoneType?.includes('year') || milestoneType?.includes('100')) {
        score += CONTEXT_BOOSTS.isAnniversary;
      }
    }

    return { moment, score };
  });

  // Sort by score (highest first)
  scoredMoments.sort((a, b) => b.score - a.score);

  return scoredMoments.map((sm) => sm.moment);
}

/**
 * Select the best moment for the current turn
 * Returns null if no moment should be shared
 */
export function selectMomentForTurn(
  userId: string,
  context: {
    isGreeting?: boolean;
    userText?: string;
    turnCount?: number;
  }
): JourneyMoment | null {
  // Gather all available moments
  const allMoments = gatherAllMoments(userId);

  if (allMoments.length === 0) {
    return null;
  }

  // Filter based on cooldowns and relationship
  const filteredMoments = filterMoments(userId, allMoments);

  if (filteredMoments.length === 0) {
    return null;
  }

  // Prioritize based on context
  const prioritizedMoments = prioritizeMoments(filteredMoments, context);

  // Return the top moment
  const selected = prioritizedMoments[0];

  // Only share high priority moments (threshold)
  // Milestones always pass, others need priority >= 5
  if (selected.type !== 'rhythm_milestone' && selected.priority < 5) {
    // Roll the dice - lower priority moments have lower chance
    const chance = selected.priority / 10;
    if (Math.random() > chance) {
      log.debug('Moment suppressed: did not pass probability check', {
        userId,
        type: selected.type,
        priority: selected.priority,
      });
      return null;
    }
  }

  log.info('Selected moment for delivery', {
    userId,
    type: selected.type,
    priority: selected.priority,
    source: selected.source,
  });

  return selected;
}

// ============================================================================
// METRICS TRACKING
// ============================================================================

/** Metrics for monitoring Personal Journey performance */
interface JourneyMetrics {
  totalDeliveries: number;
  deliveriesByType: Record<string, number>;
  suppressions: number;
  suppressionsByReason: Record<string, number>;
  reactionsByType: Record<string, { positive: number; neutral: number; negative: number }>;
}

const metricsStore: JourneyMetrics = {
  totalDeliveries: 0,
  deliveriesByType: {},
  suppressions: 0,
  suppressionsByReason: {},
  reactionsByType: {},
};

/**
 * Get current metrics snapshot for monitoring
 */
export function getJourneyMetrics(): JourneyMetrics {
  return { ...metricsStore };
}

/**
 * Record that a moment was suppressed (for monitoring)
 */
export function recordSuppression(
  userId: string,
  reason: 'cooldown' | 'relationship_stage' | 'repetition' | 'feature_flag' | 'no_moments'
): void {
  metricsStore.suppressions++;
  metricsStore.suppressionsByReason[reason] = (metricsStore.suppressionsByReason[reason] || 0) + 1;

  log.debug('🚫 Journey moment suppressed', {
    userId,
    reason,
    totalSuppressions: metricsStore.suppressions,
  });
}

/**
 * Record that a moment was delivered
 */
export function recordDelivery(
  userId: string,
  moment: JourneyMoment,
  reaction?: 'positive' | 'neutral' | 'negative'
): void {
  const history = getDeliveryHistory(userId);
  const now = new Date();

  const record: DeliveryRecord = {
    momentId: moment.id,
    momentType: moment.type,
    deliveredAt: now,
    reaction,
    contentHash: simpleHash(moment.content),
  };

  history.deliveries.push(record);
  history.lastDeliveryByType.set(moment.type, now);

  // Keep only last 100 deliveries
  if (history.deliveries.length > 100) {
    history.deliveries = history.deliveries.slice(-100);
  }

  deliveryHistoryCache.set(userId, history);

  // Update metrics
  metricsStore.totalDeliveries++;
  metricsStore.deliveriesByType[moment.type] =
    (metricsStore.deliveriesByType[moment.type] || 0) + 1;

  if (reaction) {
    if (!metricsStore.reactionsByType[moment.type]) {
      metricsStore.reactionsByType[moment.type] = { positive: 0, neutral: 0, negative: 0 };
    }
    metricsStore.reactionsByType[moment.type][reaction]++;
  }

  // If this was a rhythm milestone, mark it as acknowledged
  if (moment.type === 'rhythm_milestone') {
    const milestoneType = moment.context?.milestoneType as RhythmMilestoneType;
    if (milestoneType) {
      acknowledgeMilestone(userId, milestoneType);
    }
  }

  // If this was a seasonal memory, mark it as referenced
  if (moment.type === 'seasonal_memory') {
    const memoryId = moment.id.replace('anchor_', '');
    markMemoryReferenced(userId, memoryId);
  }

  // 🌟 MONITORING: Log delivery with full context
  log.info('🌟 Journey moment delivered', {
    userId,
    momentType: moment.type,
    momentSource: moment.source,
    momentPriority: moment.priority,
    reaction,
    totalDeliveries: metricsStore.totalDeliveries,
    typeDeliveries: metricsStore.deliveriesByType[moment.type],
  });
}

// ============================================================================
// GREETING HOOKS
// ============================================================================

/**
 * Get journey-aware greeting context
 * Aggregates from all services and picks the best greeting enhancement
 */
export function getJourneyGreetingContext(userId: string): {
  hasJourneyInsight: boolean;
  insight?: string;
  source?: string;
  priority?: number;
} {
  const candidates: Array<{
    insight: string;
    source: string;
    priority: number;
  }> = [];

  // 1. Check rhythm (milestones, streaks)
  const rhythmContext = getRhythmGreetingContext(userId);
  if (rhythmContext.hasRhythmInsight && rhythmContext.insight) {
    candidates.push({
      insight: rhythmContext.insight,
      source: 'rhythm',
      priority:
        rhythmContext.insightType === 'comeback'
          ? 8
          : rhythmContext.insightType === 'streak'
            ? 7
            : 5,
    });
  }

  // 2. Check unacknowledged milestones (highest priority)
  const milestones = getUnacknowledgedMilestones(userId);
  if (milestones.length > 0) {
    const topMilestone = milestones.sort((a, b) => b.priority - a.priority)[0];
    candidates.push({
      insight: topMilestone.content,
      source: 'milestone',
      priority: topMilestone.priority,
    });
  }

  // 3. Check seasonal
  const seasonalContext = getSeasonalGreetingContext(userId);
  if (seasonalContext.hasSeasonalInsight && seasonalContext.insight) {
    candidates.push({
      insight: seasonalContext.insight,
      source: 'seasonal',
      priority: 6,
    });
  }

  // 4. Check chapter
  const chapterContext = getChapterGreetingContext(userId);
  if (chapterContext.hasChapterInsight && chapterContext.insight) {
    candidates.push({
      insight: chapterContext.insight,
      source: 'chapter',
      priority: chapterContext.insightType === 'transition' ? 7 : 5,
    });
  }

  if (candidates.length === 0) {
    return { hasJourneyInsight: false };
  }

  // Sort by priority and pick top
  candidates.sort((a, b) => b.priority - a.priority);
  const winner = candidates[0];

  // Check cooldown for this type
  const momentType = getMomentTypeFromSource(winner.source);
  if (momentType && isInCooldown(userId, momentType)) {
    // Find next candidate not in cooldown
    for (const candidate of candidates.slice(1)) {
      const type = getMomentTypeFromSource(candidate.source);
      if (!type || !isInCooldown(userId, type)) {
        return {
          hasJourneyInsight: true,
          insight: candidate.insight,
          source: candidate.source,
          priority: candidate.priority,
        };
      }
    }
    return { hasJourneyInsight: false };
  }

  return {
    hasJourneyInsight: true,
    insight: winner.insight,
    source: winner.source,
    priority: winner.priority,
  };
}

/**
 * Map source to moment type for cooldown checking
 */
function getMomentTypeFromSource(source: string): JourneyMomentType | null {
  switch (source) {
    case 'rhythm':
      return 'rhythm_acknowledgment';
    case 'milestone':
      return 'rhythm_milestone';
    case 'seasonal':
      return 'seasonal_memory';
    case 'chapter':
      return 'chapter_reflection';
    default:
      return null;
  }
}

// ============================================================================
// SNAPSHOT / STATE
// ============================================================================

/**
 * Get a snapshot of the user's journey state
 */
export function getJourneySnapshot(userId: string): JourneySnapshot {
  const rhythm = getRhythm(userId);
  const relationshipStage = determineRelationshipStage(userId);
  const chapterSummary = getCurrentChapterSummary(userId);
  const history = getDeliveryHistory(userId);

  const allMoments = gatherAllMoments(userId);
  const availableMoments = filterMoments(userId, allMoments);

  return {
    userId,
    stats: {
      totalConversations: rhythm.sessions.totalCount,
      daysKnown: Math.floor(
        (Date.now() - rhythm.sessions.firstSession.getTime()) / (24 * 60 * 60 * 1000)
      ),
      currentStreak: rhythm.sessions.currentStreak,
      relationshipStage,
    },
    availableMoments,
    recentDeliveries: history.deliveries.slice(-10),
    currentChapter: chapterSummary.theme,
    inTransition: chapterSummary.isInTransition || false,
    capturedAt: new Date(),
  };
}

/**
 * Get delivery history for persistence
 */
export function getDeliveryHistoryForPersistence(userId: string): DeliveryRecord[] {
  const history = getDeliveryHistory(userId);
  return history.deliveries;
}

/**
 * Clear all journey caches for user
 */
export function clearAllJourneyCaches(userId: string): void {
  deliveryHistoryCache.delete(userId);
  log.debug('Cleared journey orchestrator cache', { userId });
}

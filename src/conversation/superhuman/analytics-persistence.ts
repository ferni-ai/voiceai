/**
 * Better Than Human Analytics Persistence
 *
 * Persists analytics data to Firestore for durability across restarts.
 * This ensures we never lose valuable feedback about which superhuman
 * capabilities are actually helping users.
 *
 * Collections:
 * - bth_usage/{eventId} - Capability usage events
 * - bth_effectiveness/{eventId} - User reaction/effectiveness events
 * - bth_aggregates/{capability} - Pre-computed aggregates (updated hourly)
 * - bogle_users/{userId}/bth_feedback/{feedbackId} - User-scoped feedback
 *
 * @module @ferni/conversation/superhuman/analytics-persistence
 */

import { Firestore, FieldValue, Timestamp } from '@google-cloud/firestore';
import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import type {
  SuperhumanCapability,
  CapabilityUsageEvent,
  CapabilityEffectivenessEvent,
  CapabilityStats,
} from './analytics.js';
import { ALL_CAPABILITIES } from './analytics.js';

const log = createLogger({ module: 'bth-analytics-persistence' });

// ============================================================================
// FIRESTORE CLIENT
// ============================================================================

let db: Firestore | null = null;
let initialized = false;

function getDb(): Firestore | null {
  if (initialized) return db;

  try {
    db = new Firestore();
    initialized = true;
    log.debug('BTH Analytics Firestore initialized');
    return db;
  } catch (error) {
    log.warn({ error: String(error) }, 'Firestore not available for BTH analytics');
    initialized = true;
    return null;
  }
}

// Collection names
const COLLECTIONS = {
  USAGE: 'bth_usage',
  EFFECTIVENESS: 'bth_effectiveness',
  AGGREGATES: 'bth_aggregates',
  USER_FEEDBACK: 'bth_feedback', // subcollection under bogle_users/{userId}
} as const;

// ============================================================================
// TYPES
// ============================================================================

export interface UsageDocument {
  capability: SuperhumanCapability;
  actionType: string;
  userId: string;
  sessionId: string;
  personaId: string;
  turnCount: number;
  sessionCount: number;
  priority: number;
  wasApplied: boolean;
  timestamp: Timestamp;
  createdAt: Timestamp;
}

export interface EffectivenessDocument {
  capability: SuperhumanCapability;
  userId: string;
  sessionId: string;
  userReaction: 'positive' | 'neutral' | 'negative';
  engagementIncrease: boolean;
  timestamp: Timestamp;
  createdAt: Timestamp;
  // Optional context
  insight?: string;
  userTranscript?: string;
}

export interface AggregateDocument {
  capability: SuperhumanCapability;
  totalUsage: number;
  appliedCount: number;
  positiveReactions: number;
  neutralReactions: number;
  negativeReactions: number;
  averagePriority: number;
  effectivenessRate: number;
  lastUpdated: Timestamp;
  // Time-series buckets (last 7 days)
  dailyUsage: Record<string, number>;
  dailyPositive: Record<string, number>;
}

export interface UserFeedbackDocument {
  capability: SuperhumanCapability;
  reaction: 'positive' | 'neutral' | 'negative';
  sessionId: string;
  insight?: string;
  timestamp: Timestamp;
}

// ============================================================================
// PERSISTENCE FUNCTIONS
// ============================================================================

/**
 * Persist a capability usage event to Firestore
 */
export async function persistUsageEvent(event: CapabilityUsageEvent): Promise<boolean> {
  const firestore = getDb();
  if (!firestore) {
    log.debug('Firestore unavailable, skipping usage persistence');
    return false;
  }

  try {
    const doc: UsageDocument = cleanForFirestore({
      capability: event.capability,
      actionType: event.actionType,
      userId: event.userId,
      sessionId: event.sessionId,
      personaId: event.personaId,
      turnCount: event.turnCount,
      sessionCount: event.sessionCount,
      priority: event.priority,
      wasApplied: event.wasApplied,
      timestamp: Timestamp.fromDate(event.timestamp),
      createdAt: Timestamp.now(),
    });

    await firestore.collection(COLLECTIONS.USAGE).add(doc);

    log.debug({ capability: event.capability, userId: event.userId }, 'Persisted usage event');
    return true;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to persist usage event');
    return false;
  }
}

/**
 * Persist an effectiveness event to Firestore
 */
export async function persistEffectivenessEvent(
  event: CapabilityEffectivenessEvent,
  context?: { insight?: string; userTranscript?: string }
): Promise<boolean> {
  const firestore = getDb();
  if (!firestore) {
    log.debug('Firestore unavailable, skipping effectiveness persistence');
    return false;
  }

  try {
    const doc: EffectivenessDocument = cleanForFirestore({
      capability: event.capability,
      userId: event.userId,
      sessionId: event.sessionId,
      userReaction: event.userReaction,
      engagementIncrease: event.engagementIncrease,
      timestamp: Timestamp.fromDate(event.timestamp),
      createdAt: Timestamp.now(),
      insight: context?.insight,
      userTranscript: context?.userTranscript,
    });

    // Save to global collection
    await firestore.collection(COLLECTIONS.EFFECTIVENESS).add(doc);

    // Also save to user's feedback subcollection for per-user analysis
    const userFeedback: UserFeedbackDocument = cleanForFirestore({
      capability: event.capability,
      reaction: event.userReaction,
      sessionId: event.sessionId,
      insight: context?.insight,
      timestamp: Timestamp.now(),
    });

    await firestore
      .collection('bogle_users')
      .doc(event.userId)
      .collection(COLLECTIONS.USER_FEEDBACK)
      .add(userFeedback);

    log.debug(
      { capability: event.capability, reaction: event.userReaction },
      'Persisted effectiveness event'
    );
    return true;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to persist effectiveness event');
    return false;
  }
}

/**
 * Get capability stats from Firestore
 * Falls back to in-memory if Firestore unavailable
 */
export async function getPersistedCapabilityStats(
  capability?: SuperhumanCapability
): Promise<CapabilityStats[]> {
  const firestore = getDb();
  if (!firestore) {
    log.debug('Firestore unavailable, returning empty stats');
    return [];
  }

  try {
    const capabilities = capability ? [capability] : ALL_CAPABILITIES;
    const stats: CapabilityStats[] = [];

    for (const cap of capabilities) {
      // Check if we have a cached aggregate
      const aggregateRef = firestore.collection(COLLECTIONS.AGGREGATES).doc(cap);
      const aggregateDoc = await aggregateRef.get();

      if (aggregateDoc.exists) {
        const data = aggregateDoc.data() as AggregateDocument;
        stats.push({
          capability: cap,
          totalUsage: data.totalUsage,
          appliedCount: data.appliedCount,
          positiveReactions: data.positiveReactions,
          neutralReactions: data.neutralReactions,
          negativeReactions: data.negativeReactions,
          averagePriority: data.averagePriority,
        });
      } else {
        // Compute from raw events (slower, but accurate)
        const computed = await computeCapabilityStats(cap);
        stats.push(computed);
      }
    }

    return stats;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get persisted stats');
    return [];
  }
}

/**
 * Compute stats for a capability from raw events
 */
async function computeCapabilityStats(capability: SuperhumanCapability): Promise<CapabilityStats> {
  const firestore = getDb();
  const defaultStats: CapabilityStats = {
    capability,
    totalUsage: 0,
    appliedCount: 0,
    positiveReactions: 0,
    neutralReactions: 0,
    negativeReactions: 0,
    averagePriority: 0,
  };

  if (!firestore) return defaultStats;

  try {
    // Get usage events
    const usageSnapshot = await firestore
      .collection(COLLECTIONS.USAGE)
      .where('capability', '==', capability)
      .get();

    let totalPriority = 0;
    let appliedCount = 0;

    usageSnapshot.forEach((doc) => {
      const data = doc.data() as UsageDocument;
      totalPriority += data.priority;
      if (data.wasApplied) appliedCount++;
    });

    // Get effectiveness events
    const effectivenessSnapshot = await firestore
      .collection(COLLECTIONS.EFFECTIVENESS)
      .where('capability', '==', capability)
      .get();

    let positive = 0;
    let neutral = 0;
    let negative = 0;

    effectivenessSnapshot.forEach((doc) => {
      const data = doc.data() as EffectivenessDocument;
      if (data.userReaction === 'positive') positive++;
      else if (data.userReaction === 'neutral') neutral++;
      else negative++;
    });

    return {
      capability,
      totalUsage: usageSnapshot.size,
      appliedCount,
      positiveReactions: positive,
      neutralReactions: neutral,
      negativeReactions: negative,
      averagePriority: usageSnapshot.size > 0 ? totalPriority / usageSnapshot.size : 0,
    };
  } catch (error) {
    log.error({ error: String(error), capability }, 'Failed to compute stats');
    return defaultStats;
  }
}

/**
 * Update aggregates (run periodically, e.g., hourly)
 */
export async function updateAggregates(): Promise<void> {
  const firestore = getDb();
  if (!firestore) return;

  log.info('Updating BTH analytics aggregates');

  try {
    const today = new Date().toISOString().split('T')[0];

    for (const capability of ALL_CAPABILITIES) {
      const stats = await computeCapabilityStats(capability);
      const totalReactions =
        stats.positiveReactions + stats.neutralReactions + stats.negativeReactions;

      const aggregate: AggregateDocument = {
        capability,
        totalUsage: stats.totalUsage,
        appliedCount: stats.appliedCount,
        positiveReactions: stats.positiveReactions,
        neutralReactions: stats.neutralReactions,
        negativeReactions: stats.negativeReactions,
        averagePriority: stats.averagePriority,
        effectivenessRate: totalReactions > 0 ? stats.positiveReactions / totalReactions : 0,
        lastUpdated: Timestamp.now(),
        dailyUsage: { [today]: stats.totalUsage },
        dailyPositive: { [today]: stats.positiveReactions },
      };

      await firestore
        .collection(COLLECTIONS.AGGREGATES)
        .doc(capability)
        .set(aggregate, { merge: true });
    }

    log.info({ capabilityCount: ALL_CAPABILITIES.length }, 'Aggregates updated');
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to update aggregates');
  }
}

/**
 * Get user-specific feedback history
 */
export async function getUserFeedbackHistory(
  userId: string,
  limit = 50
): Promise<UserFeedbackDocument[]> {
  const firestore = getDb();
  if (!firestore) return [];

  try {
    const snapshot = await firestore
      .collection('bogle_users')
      .doc(userId)
      .collection(COLLECTIONS.USER_FEEDBACK)
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => doc.data() as UserFeedbackDocument);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get user feedback');
    return [];
  }
}

/**
 * Get effectiveness breakdown by time period
 */
export async function getEffectivenessTrend(
  capability: SuperhumanCapability,
  days = 7
): Promise<Array<{ date: string; positive: number; neutral: number; negative: number }>> {
  const firestore = getDb();
  if (!firestore) return [];

  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const snapshot = await firestore
      .collection(COLLECTIONS.EFFECTIVENESS)
      .where('capability', '==', capability)
      .where('timestamp', '>=', Timestamp.fromDate(cutoff))
      .orderBy('timestamp', 'asc')
      .get();

    // Group by date
    const byDate = new Map<string, { positive: number; neutral: number; negative: number }>();

    snapshot.forEach((doc) => {
      const data = doc.data() as EffectivenessDocument;
      const date = data.timestamp.toDate().toISOString().split('T')[0];

      if (!byDate.has(date)) {
        byDate.set(date, { positive: 0, neutral: 0, negative: 0 });
      }

      const entry = byDate.get(date)!;
      entry[data.userReaction]++;
    });

    return Array.from(byDate.entries()).map(([date, counts]) => ({
      date,
      ...counts,
    }));
  } catch (error) {
    log.error({ error: String(error), capability }, 'Failed to get trend');
    return [];
  }
}

/**
 * Get top performing capabilities
 */
export async function getTopCapabilities(
  limit = 10
): Promise<
  Array<{ capability: SuperhumanCapability; effectivenessRate: number; sampleSize: number }>
> {
  const firestore = getDb();
  if (!firestore) return [];

  try {
    const snapshot = await firestore
      .collection(COLLECTIONS.AGGREGATES)
      .orderBy('effectivenessRate', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data() as AggregateDocument;
      const sampleSize = data.positiveReactions + data.neutralReactions + data.negativeReactions;
      return {
        capability: data.capability,
        effectivenessRate: data.effectivenessRate,
        sampleSize,
      };
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get top capabilities');
    return [];
  }
}

/**
 * Export for testing
 */
export function resetPersistence(): void {
  db = null;
  initialized = false;
}

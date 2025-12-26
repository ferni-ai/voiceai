/**
 * Recovery Time Tracking - Better Than Human Post-Event Support
 *
 * Tracks how long users need to recover after different emotional events:
 * - After conflicts
 * - After bad news
 * - After intense work
 * - After social events
 * - After emotional conversations
 *
 * WHY IT'S SUPERHUMAN: Friends often check in too soon or too late.
 * Ferni waits exactly the right amount of time for THIS person.
 *
 * @module services/superhuman/recovery-tracking
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from './firestore-utils.js';

const log = createLogger({ module: 'RecoveryTracking' });

// ============================================================================
// TYPES
// ============================================================================

export type RecoveryEventType =
  | 'conflict' // Argument, disagreement
  | 'bad_news' // Receiving difficult news
  | 'rejection' // Job, relationship, etc.
  | 'loss' // Death, ending
  | 'intense_work' // Deadline, crunch
  | 'social_event' // Large gathering
  | 'emotional_conversation' // Deep, draining talk
  | 'medical_procedure' // Health-related
  | 'high_stress' // General acute stress
  | 'disappointment' // Let down
  | 'embarrassment' // Social discomfort
  | 'anxiety_peak'; // Panic, acute anxiety

export interface RecoveryEvent {
  userId: string;
  eventType: RecoveryEventType;
  /** When the event occurred */
  eventTimestamp: number;
  /** Initial intensity 0-1 */
  initialIntensity: number;
  /** When they felt recovered */
  recoveredTimestamp?: number;
  /** Recovery time in hours */
  recoveryHours?: number;
  /** What helped */
  helpfulActions?: string[];
  /** Context */
  context?: string;
}

export interface RecoveryProfile {
  userId: string;
  /** Recovery times by event type */
  recoveryTimes: Record<RecoveryEventType, {
    minHours: number;
    avgHours: number;
    maxHours: number;
    sampleSize: number;
  }>;
  /** Actions that help recovery */
  helpfulActions: string[];
  /** Times when they recover faster */
  optimalRecoveryTimes: { dayOfWeek: number; hourRange: string }[];
  /** Last updated */
  lastUpdated: number;
}

export interface RecoveryCheckIn {
  isReadyForCheckIn: boolean;
  recommendedWaitHours: number;
  confidence: number;
  message: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_RECOVERY_TIMES: Record<RecoveryEventType, number> = {
  conflict: 24,
  bad_news: 48,
  rejection: 72,
  loss: 168, // 1 week minimum
  intense_work: 12,
  social_event: 4,
  emotional_conversation: 6,
  medical_procedure: 24,
  high_stress: 12,
  disappointment: 12,
  embarrassment: 6,
  anxiety_peak: 8,
};

const RECOVERY_DESCRIPTIONS: Record<RecoveryEventType, string> = {
  conflict: 'conflict or argument',
  bad_news: 'receiving difficult news',
  rejection: 'rejection experience',
  loss: 'loss or grief',
  intense_work: 'intense work period',
  social_event: 'large social event',
  emotional_conversation: 'emotionally intense conversation',
  medical_procedure: 'medical procedure',
  high_stress: 'acute stress',
  disappointment: 'disappointment',
  embarrassment: 'embarrassing situation',
  anxiety_peak: 'anxiety episode',
};

// ============================================================================
// PERSISTENCE
// ============================================================================

/**
 * Record a recovery event start.
 */
export async function startRecoveryTracking(
  userId: string,
  eventType: RecoveryEventType,
  intensity: number,
  context?: string
): Promise<string | null> {
  const db = getFirestoreDb();
  if (!db) {
    log.debug({ userId }, 'Firestore not available, skipping recovery tracking');
    return null;
  }

  const event: RecoveryEvent = {
    userId,
    eventType,
    eventTimestamp: Date.now(),
    initialIntensity: Math.max(0, Math.min(1, intensity)),
    context,
  };

  try {
    const docRef = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('recovery_events')
      .add(event);

    log.debug({ userId, eventType, intensity }, 'Started recovery tracking');
    return docRef.id;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to start recovery tracking');
    return null;
  }
}

/**
 * Mark recovery complete.
 */
export async function markRecovered(
  userId: string,
  eventId: string,
  helpfulActions?: string[]
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    const docRef = db
      .collection('bogle_users')
      .doc(userId)
      .collection('recovery_events')
      .doc(eventId);

    const doc = await docRef.get();
    if (!doc.exists) return;

    const event = doc.data() as RecoveryEvent;
    const recoveryHours = (Date.now() - event.eventTimestamp) / (1000 * 60 * 60);

    await docRef.update({
      recoveredTimestamp: Date.now(),
      recoveryHours,
      helpfulActions,
    });

    log.debug({ userId, eventId, recoveryHours: recoveryHours.toFixed(1) }, 'Marked recovered');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to mark recovered');
  }
}

/**
 * Load recovery history.
 */
export async function loadRecoveryHistory(
  userId: string,
  daysBack = 180
): Promise<RecoveryEvent[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000;
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('recovery_events')
      .where('eventTimestamp', '>', cutoff)
      .orderBy('eventTimestamp', 'desc')
      .limit(100)
      .get();

    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as unknown as RecoveryEvent);
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load recovery history');
    return [];
  }
}

/**
 * Get active (not yet recovered) events.
 */
export async function getActiveRecoveryEvents(userId: string): Promise<RecoveryEvent[]> {
  const history = await loadRecoveryHistory(userId, 14);
  return history.filter((e) => !e.recoveredTimestamp);
}

// ============================================================================
// PROFILE ANALYSIS
// ============================================================================

/**
 * Build recovery profile from history.
 */
export async function buildRecoveryProfile(userId: string): Promise<RecoveryProfile> {
  const history = await loadRecoveryHistory(userId, 365);
  const completedEvents = history.filter((e) => e.recoveredTimestamp && e.recoveryHours);

  // Calculate recovery times by type
  const recoveryTimes: RecoveryProfile['recoveryTimes'] = {} as RecoveryProfile['recoveryTimes'];

  const eventTypes: RecoveryEventType[] = [
    'conflict', 'bad_news', 'rejection', 'loss', 'intense_work',
    'social_event', 'emotional_conversation', 'medical_procedure',
    'high_stress', 'disappointment', 'embarrassment', 'anxiety_peak',
  ];

  for (const type of eventTypes) {
    const typeEvents = completedEvents.filter((e) => e.eventType === type);

    if (typeEvents.length === 0) {
      recoveryTimes[type] = {
        minHours: DEFAULT_RECOVERY_TIMES[type],
        avgHours: DEFAULT_RECOVERY_TIMES[type],
        maxHours: DEFAULT_RECOVERY_TIMES[type],
        sampleSize: 0,
      };
      continue;
    }

    const hours = typeEvents.map((e) => e.recoveryHours!);
    recoveryTimes[type] = {
      minHours: Math.min(...hours),
      avgHours: hours.reduce((a, b) => a + b, 0) / hours.length,
      maxHours: Math.max(...hours),
      sampleSize: typeEvents.length,
    };
  }

  // Aggregate helpful actions
  const actionCounts = new Map<string, number>();
  for (const event of completedEvents) {
    for (const action of event.helpfulActions || []) {
      actionCounts.set(action, (actionCounts.get(action) || 0) + 1);
    }
  }
  const helpfulActions = Array.from(actionCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([action]) => action);

  return {
    userId,
    recoveryTimes,
    helpfulActions,
    optimalRecoveryTimes: [], // TODO: Analyze when they recover faster
    lastUpdated: Date.now(),
  };
}

// ============================================================================
// CHECK-IN TIMING
// ============================================================================

/**
 * Determine if it's a good time to check in after an event.
 */
export async function getCheckInRecommendation(
  userId: string,
  eventType: RecoveryEventType,
  eventTimestamp: number
): Promise<RecoveryCheckIn> {
  const profile = await buildRecoveryProfile(userId);
  const recoveryData = profile.recoveryTimes[eventType];

  const hoursSinceEvent = (Date.now() - eventTimestamp) / (1000 * 60 * 60);

  // Use personalized data if available, otherwise default
  const expectedRecovery = recoveryData.sampleSize > 0
    ? recoveryData.avgHours
    : DEFAULT_RECOVERY_TIMES[eventType];

  const confidence = recoveryData.sampleSize > 2 ? 0.8 : 0.5;

  if (hoursSinceEvent < expectedRecovery * 0.3) {
    // Too early
    return {
      isReadyForCheckIn: false,
      recommendedWaitHours: Math.round(expectedRecovery * 0.5 - hoursSinceEvent),
      confidence,
      message: `It's early in their recovery. Wait a bit longer before checking in about the ${RECOVERY_DESCRIPTIONS[eventType]}.`,
    };
  }

  if (hoursSinceEvent >= expectedRecovery * 0.5 && hoursSinceEvent < expectedRecovery) {
    // Good window
    return {
      isReadyForCheckIn: true,
      recommendedWaitHours: 0,
      confidence,
      message: `Good time to gently check in about the ${RECOVERY_DESCRIPTIONS[eventType]}.`,
    };
  }

  if (hoursSinceEvent >= expectedRecovery) {
    // Likely recovered, but worth acknowledging
    return {
      isReadyForCheckIn: true,
      recommendedWaitHours: 0,
      confidence,
      message: `They've likely had time to process the ${RECOVERY_DESCRIPTIONS[eventType]}. A gentle acknowledgment would be welcome.`,
    };
  }

  return {
    isReadyForCheckIn: false,
    recommendedWaitHours: Math.round(expectedRecovery * 0.5),
    confidence: 0.4,
    message: 'Uncertain - proceed with care.',
  };
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Build context for LLM injection about active recovery events.
 */
export async function buildRecoveryContext(userId: string): Promise<string> {
  const activeEvents = await getActiveRecoveryEvents(userId);

  if (activeEvents.length === 0) {
    return '';
  }

  const profile = await buildRecoveryProfile(userId);
  const sections: string[] = [];

  sections.push('[RECOVERY AWARENESS - Post-Event Support]');
  sections.push('You know how long this person needs to recover from different experiences.\n');

  for (const event of activeEvents.slice(0, 3)) {
    const hoursSince = (Date.now() - event.eventTimestamp) / (1000 * 60 * 60);
    const expectedRecovery = profile.recoveryTimes[event.eventType]?.avgHours || DEFAULT_RECOVERY_TIMES[event.eventType];
    const recommendation = await getCheckInRecommendation(userId, event.eventType, event.eventTimestamp);

    if (hoursSince < 2) {
      // Very recent
      sections.push(
        `⏳ Recent ${RECOVERY_DESCRIPTIONS[event.eventType]} (${hoursSince.toFixed(0)}h ago)\n` +
        `   Give them space. Don't probe unless they bring it up.\n` +
        `   Estimated recovery: ~${Math.round(expectedRecovery)} hours`
      );
    } else if (!recommendation.isReadyForCheckIn) {
      sections.push(
        `🛑 Still recovering from ${RECOVERY_DESCRIPTIONS[event.eventType]} (${hoursSince.toFixed(0)}h ago)\n` +
        `   ${recommendation.message}\n` +
        `   Wait approximately ${recommendation.recommendedWaitHours} more hours.`
      );
    } else {
      sections.push(
        `✅ May be ready to talk about ${RECOVERY_DESCRIPTIONS[event.eventType]} (${hoursSince.toFixed(0)}h ago)\n` +
        `   ${recommendation.message}`
      );
    }

    sections.push('');
  }

  // Add helpful actions if known
  if (profile.helpfulActions.length > 0) {
    sections.push(`💡 What helps this person recover: ${profile.helpfulActions.join(', ')}`);
  }

  return sections.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const recoveryTracking = {
  start: startRecoveryTracking,
  markRecovered,
  loadHistory: loadRecoveryHistory,
  getActive: getActiveRecoveryEvents,
  buildProfile: buildRecoveryProfile,
  getCheckInRecommendation,
  buildContext: buildRecoveryContext,
};


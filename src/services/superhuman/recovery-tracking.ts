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
import { getFirestoreDb, cleanForFirestore } from './firestore-utils.js';
import { onRecoveryMilestoneChange } from '../data-layer/hooks/superhuman-hooks.js';

const log = createLogger({ module: 'RecoveryTracking' });

// ============================================================================
// TYPES
// ============================================================================

export type RecoveryEventType =
  | 'conflict' // Argument, disagreement
  | 'bad_news' // Receiving difficult news
  | 'rejection' // Job, relationship, etc.
  | 'loss' // Death, ending
  | 'betrayal' // Cheated on, backstabbed, lied to
  | 'failure' // Failed exam, bombed interview, messed up
  | 'intense_work' // Deadline, crunch
  | 'burnout' // Depleted, running on empty
  | 'social_event' // Large gathering
  | 'emotional_conversation' // Deep, draining talk
  | 'medical_procedure' // Health-related
  | 'high_stress' // General acute stress
  | 'disappointment' // Let down
  | 'embarrassment' // Social discomfort
  | 'anxiety_peak' // Panic, acute anxiety
  | 'trauma'; // Traumatic event, accident, assault

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
  recoveryTimes: Record<
    RecoveryEventType,
    {
      minHours: number;
      avgHours: number;
      maxHours: number;
      sampleSize: number;
    }
  >;
  /** Actions that help recovery */
  helpfulActions: string[];
  /** Times when they recover faster */
  optimalRecoveryTimes: {
    dayOfWeek: number;
    hourRange: string;
    avgRecoveryHours?: number;
    sampleSize?: number;
  }[];
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
  betrayal: 168, // Deep wounds need time
  failure: 48,
  intense_work: 12,
  burnout: 72, // Burnout needs real recovery
  social_event: 4,
  emotional_conversation: 6,
  medical_procedure: 24,
  high_stress: 12,
  disappointment: 12,
  embarrassment: 6,
  anxiety_peak: 8,
  trauma: 336, // 2 weeks minimum for trauma
};

const RECOVERY_DESCRIPTIONS: Record<RecoveryEventType, string> = {
  conflict: 'conflict or argument',
  bad_news: 'receiving difficult news',
  rejection: 'rejection experience',
  loss: 'loss or grief',
  betrayal: 'betrayal or broken trust',
  failure: 'setback or failure',
  intense_work: 'intense work period',
  burnout: 'burnout or exhaustion',
  social_event: 'large social event',
  emotional_conversation: 'emotionally intense conversation',
  medical_procedure: 'medical procedure',
  high_stress: 'acute stress',
  disappointment: 'disappointment',
  embarrassment: 'embarrassing situation',
  anxiety_peak: 'anxiety episode',
  trauma: 'traumatic experience',
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
      .add(cleanForFirestore(event));

    // Index to semantic memory for recovery pattern analysis
    void onRecoveryMilestoneChange(
      userId,
      docRef.id,
      {
        milestone: `Started ${eventType} recovery`,
        recoveryFrom: eventType,
        significance: context || `Recovery tracking initiated (intensity: ${intensity})`,
        date: new Date().toISOString(),
      },
      'create'
    );

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

    await docRef.update(
      cleanForFirestore({
        recoveredTimestamp: Date.now(),
        recoveryHours,
        helpfulActions,
      })
    );

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
// OPTIMAL RECOVERY ANALYSIS
// ============================================================================

interface OptimalRecoveryTime {
  dayOfWeek: number; // 0=Sunday, 1=Monday, ..., 6=Saturday
  hourRange: string; // e.g., '10-14'
  avgRecoveryHours: number;
  sampleSize: number;
}

/**
 * Analyze when the user tends to recover faster.
 * Looks at both day-of-week and time-of-day patterns.
 */
function analyzeOptimalRecoveryTimes(completedEvents: RecoveryEvent[]): OptimalRecoveryTime[] {
  if (completedEvents.length < 3) {
    return []; // Need enough data for meaningful patterns
  }

  // Group events by day of week when recovery STARTED
  const byDayOfWeek = new Map<number, number[]>();
  // Group events by hour range when recovery STARTED
  const byHourRange = new Map<string, number[]>();

  for (const event of completedEvents) {
    if (!event.recoveryHours || !event.eventTimestamp) continue;

    const eventDate = new Date(event.eventTimestamp);
    const dayOfWeek = eventDate.getDay();
    const hour = eventDate.getHours();

    // Track by day of week
    if (!byDayOfWeek.has(dayOfWeek)) {
      byDayOfWeek.set(dayOfWeek, []);
    }
    byDayOfWeek.get(dayOfWeek)!.push(event.recoveryHours);

    // Track by 4-hour ranges: 0-4, 4-8, 8-12, 12-16, 16-20, 20-24
    const hourRangeStart = Math.floor(hour / 4) * 4;
    const hourRange = `${hourRangeStart}-${hourRangeStart + 4}`;
    if (!byHourRange.has(hourRange)) {
      byHourRange.set(hourRange, []);
    }
    byHourRange.get(hourRange)!.push(event.recoveryHours);
  }

  // Calculate average recovery time for each day of week
  const dayAverages: { dayOfWeek: number; avg: number; count: number }[] = [];
  for (const [day, hours] of byDayOfWeek) {
    if (hours.length >= 2) {
      // Need at least 2 samples
      const avg = hours.reduce((a, b) => a + b, 0) / hours.length;
      dayAverages.push({ dayOfWeek: day, avg, count: hours.length });
    }
  }

  // Calculate average recovery time for each hour range
  const hourAverages: { hourRange: string; avg: number; count: number }[] = [];
  for (const [range, hours] of byHourRange) {
    if (hours.length >= 2) {
      // Need at least 2 samples
      const avg = hours.reduce((a, b) => a + b, 0) / hours.length;
      hourAverages.push({ hourRange: range, avg, count: hours.length });
    }
  }

  // Find the optimal combinations (fastest recovery)
  const results: OptimalRecoveryTime[] = [];

  // Sort by fastest average recovery
  dayAverages.sort((a, b) => a.avg - b.avg);
  hourAverages.sort((a, b) => a.avg - b.avg);

  // Overall average for comparison
  const allRecoveryHours = completedEvents
    .filter((e) => e.recoveryHours)
    .map((e) => e.recoveryHours!);
  const overallAvg =
    allRecoveryHours.length > 0
      ? allRecoveryHours.reduce((a, b) => a + b, 0) / allRecoveryHours.length
      : 24;

  // Add top day-of-week patterns that are significantly faster than average
  for (const dayData of dayAverages.slice(0, 2)) {
    // Only include if at least 15% faster than overall average
    if (dayData.avg < overallAvg * 0.85) {
      // Find the best hour range for this day (if we have cross-data)
      const bestHourRange = hourAverages.length > 0 ? hourAverages[0].hourRange : '8-12';

      results.push({
        dayOfWeek: dayData.dayOfWeek,
        hourRange: bestHourRange,
        avgRecoveryHours: Math.round(dayData.avg * 10) / 10,
        sampleSize: dayData.count,
      });
    }
  }

  // If no day-specific patterns, check hour-range patterns
  if (results.length === 0 && hourAverages.length > 0) {
    const bestHour = hourAverages[0];
    if (bestHour.avg < overallAvg * 0.85) {
      // Find which day has most samples at this hour range
      let bestDay = 0;
      let maxSamples = 0;
      for (const [day, hours] of byDayOfWeek) {
        if (hours.length > maxSamples) {
          maxSamples = hours.length;
          bestDay = day;
        }
      }

      results.push({
        dayOfWeek: bestDay,
        hourRange: bestHour.hourRange,
        avgRecoveryHours: Math.round(bestHour.avg * 10) / 10,
        sampleSize: bestHour.count,
      });
    }
  }

  return results;
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
    'conflict',
    'bad_news',
    'rejection',
    'loss',
    'betrayal',
    'failure',
    'intense_work',
    'burnout',
    'social_event',
    'emotional_conversation',
    'medical_procedure',
    'high_stress',
    'disappointment',
    'embarrassment',
    'anxiety_peak',
    'trauma',
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
    optimalRecoveryTimes: analyzeOptimalRecoveryTimes(completedEvents),
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
  const expectedRecovery =
    recoveryData.sampleSize > 0 ? recoveryData.avgHours : DEFAULT_RECOVERY_TIMES[eventType];

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
    const expectedRecovery =
      profile.recoveryTimes[event.eventType]?.avgHours || DEFAULT_RECOVERY_TIMES[event.eventType];
    const recommendation = await getCheckInRecommendation(
      userId,
      event.eventType,
      event.eventTimestamp
    );

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

/**
 * Social Battery Tracker - Better Than Human Energy Management
 *
 * Tracks and predicts social energy levels:
 * - Current battery level based on recent social interactions
 * - Drain rate (how fast social events deplete energy)
 * - Recharge rate (how fast they recover alone)
 * - Warning when approaching depletion
 *
 * WHY IT'S SUPERHUMAN: No friend tracks your social capacity and warns
 * you before you overcommit. Ferni knows when you're "peopled out."
 *
 * @module services/superhuman/social-battery
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from './firestore-utils.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

const log = createLogger({ module: 'SocialBattery' });

// ============================================================================
// TYPES
// ============================================================================

export type SocialEventType =
  | 'large_gathering' // Party, conference, big meeting
  | 'small_group' // Dinner with friends, team meeting
  | 'one_on_one' // Coffee with a friend, 1:1 meeting
  | 'family' // Family time (often different energy cost)
  | 'work_meeting' // Professional obligation
  | 'deep_conversation' // Emotionally intense but rewarding
  | 'casual_chat' // Light interaction
  | 'conflict' // Draining conflict situation
  | 'alone_time'; // Recharging

export interface SocialEvent {
  userId: string;
  type: SocialEventType;
  durationMinutes: number;
  energyImpact: number; // Negative = drained, positive = recharged
  timestamp: number;
  context?: string;
}

export interface SocialBatteryState {
  /** Current battery level 0-100 */
  currentLevel: number;
  /** Average drain per hour of social activity */
  drainRatePerHour: number;
  /** Average recharge per hour of alone time */
  rechargeRatePerHour: number;
  /** Hours of alone time needed to fully recharge */
  fullRechargeHours: number;
  /** Warning threshold (suggest declining invitations below this) */
  warningThreshold: number;
  /** Introvert/extrovert tendency (0 = extreme introvert, 1 = extreme extrovert) */
  socialTendency: number;
  /** Last updated */
  lastUpdated: number;
}

export interface SocialBatteryProfile {
  /** How draining are different event types for this person */
  eventCosts: Record<SocialEventType, number>;
  /** What's their baseline capacity (some people have bigger batteries) */
  maxCapacity: number;
  /** How fast do they recover */
  recoveryMultiplier: number;
  /** Peak social hours (when they handle social events best) */
  peakSocialHours: number[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_EVENT_COSTS: Record<SocialEventType, number> = {
  large_gathering: -25,
  small_group: -15,
  one_on_one: -8,
  family: -10, // Varies widely
  work_meeting: -12,
  deep_conversation: -5, // Draining but meaningful
  casual_chat: -3,
  conflict: -30,
  alone_time: 10, // Per hour
};

const DEFAULT_BATTERY_STATE: SocialBatteryState = {
  currentLevel: 75,
  drainRatePerHour: 10,
  rechargeRatePerHour: 8,
  fullRechargeHours: 12,
  warningThreshold: 30,
  socialTendency: 0.5,
  lastUpdated: Date.now(),
};

// ============================================================================
// BATTERY CALCULATION
// ============================================================================

/**
 * Calculate current battery level based on recent events.
 */
export function calculateBatteryLevel(
  events: SocialEvent[],
  profile: SocialBatteryProfile,
  lastKnownLevel = 100
): number {
  if (events.length === 0) return lastKnownLevel;

  // Sort by timestamp
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);

  let level = lastKnownLevel;
  let lastTimestamp = sorted[0].timestamp;

  for (const event of sorted) {
    // Calculate time passed since last event (recharge opportunity)
    const hoursPassed = (event.timestamp - lastTimestamp) / (1000 * 60 * 60);

    // Assume passive recharge during gaps
    if (hoursPassed > 0.5) {
      const sleepingHours = calculateSleepingHours(lastTimestamp, event.timestamp);
      const activeAloneHours = hoursPassed - sleepingHours;

      // Recharge during awake alone time
      level = Math.min(100, level + activeAloneHours * profile.recoveryMultiplier * 5);

      // Smaller recharge during sleep
      level = Math.min(100, level + sleepingHours * 2);
    }

    // Apply event impact
    const baseCost = profile.eventCosts[event.type] ?? DEFAULT_EVENT_COSTS[event.type];
    const durationMultiplier = event.durationMinutes / 60;
    const impact = baseCost * durationMultiplier;

    level = Math.max(0, Math.min(100, level + impact));
    lastTimestamp = event.timestamp;
  }

  // Calculate time since last event
  const hoursSinceLast = (Date.now() - lastTimestamp) / (1000 * 60 * 60);
  if (hoursSinceLast > 0.5) {
    const sleepingHours = calculateSleepingHours(lastTimestamp, Date.now());
    const activeAloneHours = hoursSinceLast - sleepingHours;
    level = Math.min(100, level + activeAloneHours * profile.recoveryMultiplier * 5);
    level = Math.min(100, level + sleepingHours * 2);
  }

  return Math.round(level);
}

/**
 * Estimate sleeping hours between two timestamps.
 */
function calculateSleepingHours(start: number, end: number): number {
  let sleepHours = 0;
  const startDate = new Date(start);
  const endDate = new Date(end);

  // Simple estimate: assume sleep from 11pm to 7am
  const current = new Date(startDate);
  while (current < endDate) {
    const hour = current.getHours();
    if (hour >= 23 || hour < 7) {
      sleepHours++;
    }
    current.setHours(current.getHours() + 1);
    if (sleepHours > 24) break; // Safety limit
  }

  return sleepHours;
}

/**
 * Determine social tendency from event history.
 */
export function calculateSocialTendency(events: SocialEvent[]): number {
  if (events.length < 5) return 0.5;

  // Count positive energy events (they enjoyed it)
  const positiveEvents = events.filter((e) => e.energyImpact > 0);
  const socialEvents = events.filter((e) => e.type !== 'alone_time');

  // High ratio of positive social events = more extroverted
  if (socialEvents.length === 0) return 0.3; // Introvert baseline

  const positiveRatio = positiveEvents.length / socialEvents.length;

  // Also factor in frequency - extroverts seek more social interaction
  const daysSpan = (Date.now() - events[events.length - 1].timestamp) / (1000 * 60 * 60 * 24);
  const socialFrequency = socialEvents.length / Math.max(daysSpan, 1);

  // Combine: 0 = extreme introvert, 1 = extreme extrovert
  return Math.min(1, Math.max(0, positiveRatio * 0.5 + Math.min(socialFrequency / 3, 0.5)));
}

// ============================================================================
// PERSISTENCE
// ============================================================================

/**
 * Record a social event.
 */
export async function recordSocialEvent(
  userId: string,
  type: SocialEventType,
  durationMinutes: number,
  context?: string
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) {
    log.debug({ userId }, 'Firestore not available, skipping social event');
    return;
  }

  // Calculate energy impact based on type and duration
  const baseCost = DEFAULT_EVENT_COSTS[type];
  const energyImpact = (baseCost * durationMinutes) / 60;

  const event: SocialEvent = {
    userId,
    type,
    durationMinutes,
    energyImpact,
    timestamp: Date.now(),
    context,
  };

  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('social_events')
      .add(cleanForFirestore(event));

    log.debug({ userId, type, impact: energyImpact }, 'Recorded social event');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to record social event');
  }
}

/**
 * Load recent social events.
 */
export async function loadSocialEvents(userId: string, daysBack = 14): Promise<SocialEvent[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000;
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('social_events')
      .where('timestamp', '>', cutoff)
      .orderBy('timestamp', 'desc')
      .limit(100)
      .get();

    return snapshot.docs.map((doc) => doc.data() as SocialEvent);
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load social events');
    return [];
  }
}

/**
 * Get or create social battery profile.
 */
export async function getSocialBatteryProfile(userId: string): Promise<SocialBatteryProfile> {
  const db = getFirestoreDb();
  if (!db) {
    return {
      eventCosts: { ...DEFAULT_EVENT_COSTS },
      maxCapacity: 100,
      recoveryMultiplier: 1,
      peakSocialHours: [10, 11, 14, 15, 19, 20],
    };
  }

  try {
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('superhuman_profiles')
      .doc('social_battery')
      .get();

    if (doc.exists) {
      return doc.data() as SocialBatteryProfile;
    }
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to load social profile');
  }

  return {
    eventCosts: { ...DEFAULT_EVENT_COSTS },
    maxCapacity: 100,
    recoveryMultiplier: 1,
    peakSocialHours: [10, 11, 14, 15, 19, 20],
  };
}

// ============================================================================
// STATE & CONTEXT
// ============================================================================

/**
 * Get current social battery state.
 */
export async function getSocialBatteryState(userId: string): Promise<SocialBatteryState> {
  const [events, profile] = await Promise.all([
    loadSocialEvents(userId, 7),
    getSocialBatteryProfile(userId),
  ]);

  const currentLevel = calculateBatteryLevel(events, profile);
  const socialTendency = calculateSocialTendency(events);

  // Calculate drain rate from actual events
  const socialEvents = events.filter((e) => e.type !== 'alone_time');
  const totalDrain = socialEvents.reduce((sum, e) => sum + Math.abs(e.energyImpact), 0);
  const totalSocialHours = socialEvents.reduce((sum, e) => sum + e.durationMinutes / 60, 0);
  const drainRatePerHour = totalSocialHours > 0 ? totalDrain / totalSocialHours : 10;

  // Calculate recharge rate
  const aloneEvents = events.filter((e) => e.type === 'alone_time');
  const totalRecharge = aloneEvents.reduce((sum, e) => sum + e.energyImpact, 0);
  const totalAloneHours = aloneEvents.reduce((sum, e) => sum + e.durationMinutes / 60, 0);
  const rechargeRatePerHour = totalAloneHours > 0 ? totalRecharge / totalAloneHours : 8;

  return {
    currentLevel,
    drainRatePerHour,
    rechargeRatePerHour,
    fullRechargeHours: Math.ceil((100 - currentLevel) / Math.max(rechargeRatePerHour, 1)),
    warningThreshold: socialTendency > 0.6 ? 20 : 35, // Introverts need bigger buffer
    socialTendency,
    lastUpdated: Date.now(),
  };
}

/**
 * Build context for LLM injection.
 */
export async function buildSocialBatteryContext(userId: string): Promise<string> {
  const state = await getSocialBatteryState(userId);
  const sections: string[] = [];

  // Only include if battery is noteworthy
  if (state.currentLevel > 60 && state.socialTendency > 0.4) {
    return ''; // Battery is fine, no need to mention
  }

  sections.push('[SOCIAL BATTERY - Energy Awareness]');

  if (state.currentLevel <= state.warningThreshold) {
    sections.push(
      `⚠️ SOCIAL BATTERY LOW: ${state.currentLevel}%\n` +
        `This person is likely "peopled out." They may need:\n` +
        `• Permission to decline social obligations\n` +
        `• Validation that rest is okay\n` +
        `• Help protecting alone time\n` +
        `Estimated recharge time: ${state.fullRechargeHours} hours of alone time`
    );
  } else if (state.currentLevel <= 50) {
    sections.push(
      `🔋 Social battery at ${state.currentLevel}%.\n` +
        `Be mindful - this person may be running low on social energy. ` +
        `Avoid suggesting big social commitments.`
    );
  }

  // Introvert-specific guidance
  if (state.socialTendency < 0.4) {
    sections.push(
      `\n📊 Note: This person trends introverted. They recover through solitude, ` +
        `not through more social interaction. Respect their need for alone time.`
    );
  }

  return sections.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const socialBattery = {
  record: recordSocialEvent,
  load: loadSocialEvents,
  getState: getSocialBatteryState,
  getProfile: getSocialBatteryProfile,
  calculateLevel: calculateBatteryLevel,
  buildContext: buildSocialBatteryContext,
};

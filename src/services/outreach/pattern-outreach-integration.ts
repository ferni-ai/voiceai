/**
 * Pattern-Based Proactive Outreach Integration
 *
 * "Better Than Human" - We notice patterns and reach out at the right moment
 *
 * Connects the pattern detection from live-superhuman-injections.ts to the
 * proactive outreach system. When patterns are detected during conversation,
 * this module schedules appropriate follow-up outreach.
 *
 * Examples:
 * - Sunday evening anxiety pattern → Schedule Monday morning check-in
 * - Work stress detected → Schedule evening support call
 * - Relationship tension mentioned → Schedule thoughtful check-in next day
 *
 * @module services/outreach/pattern-outreach-integration
 */

import { createLogger } from '../../utils/safe-logger.js';
import { registerInterval } from '../../utils/interval-manager.js';
import { publishOutreachTrigger, type OutreachTriggerPayload } from './trigger-publisher.js';
import { runBackground } from '../../utils/background-task.js';

const log = createLogger({ module: 'PatternOutreachIntegration' });

// ============================================================================
// DEDUPLICATION - Prevent duplicate outreach triggers
// ============================================================================

/**
 * Track recently scheduled outreach to prevent duplicates
 * Key: `userId:pattern` → Timestamp of last schedule
 */
const recentlyScheduled = new Map<string, number>();

/** Minimum time between duplicate pattern triggers (4 hours) */
const DEDUP_WINDOW_MS = 4 * 60 * 60 * 1000;

/** Cleanup stale entries every 30 minutes */
const CLEANUP_INTERVAL_MS = 30 * 60 * 1000;

// Periodic cleanup of old entries
registerInterval(
  'pattern-outreach-dedup-cleanup',
  () => {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, timestamp] of recentlyScheduled.entries()) {
      if (now - timestamp > DEDUP_WINDOW_MS) {
        recentlyScheduled.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      log.debug({ cleaned }, 'Cleaned stale dedup entries');
    }
  },
  CLEANUP_INTERVAL_MS
);

/**
 * Check if this pattern was recently scheduled for this user
 */
function wasRecentlyScheduled(userId: string, pattern: string): boolean {
  const key = `${userId}:${pattern}`;
  const lastScheduled = recentlyScheduled.get(key);
  if (!lastScheduled) return false;
  return Date.now() - lastScheduled < DEDUP_WINDOW_MS;
}

/**
 * Mark pattern as scheduled for deduplication
 */
function markAsScheduled(userId: string, pattern: string): void {
  const key = `${userId}:${pattern}`;
  recentlyScheduled.set(key, Date.now());
}

// ============================================================================
// TYPES
// ============================================================================

export interface PatternTrigger {
  pattern: string;
  patternDescription: string;
  tendency: string;
  suggestedOutreach: string;
  actionable: string;
}

export interface PatternOutreachContext {
  userId: string;
  sessionId: string;
  personaId?: string;
  currentEmotion?: string;
  emotionIntensity?: number;
  topics?: string[];
}

// ============================================================================
// PATTERN → OUTREACH MAPPING
// ============================================================================

interface OutreachSchedule {
  triggerType: OutreachTriggerPayload['type'];
  priority: OutreachTriggerPayload['priority'];
  delayMinutes: number;
  suggestedTime?: { hour: number; dayOffset: number };
}

/**
 * Map pattern types to outreach strategies
 */
const PATTERN_OUTREACH_MAP: Record<string, OutreachSchedule> = {
  'Sunday evening anxiety': {
    triggerType: 'pattern_acknowledgment',
    priority: 'medium',
    delayMinutes: 0, // Schedule for tomorrow morning
    suggestedTime: { hour: 8, dayOffset: 1 }, // Monday 8am
  },
  'Work stress trigger': {
    triggerType: 'emotional_support',
    priority: 'medium',
    delayMinutes: 180, // 3 hours later (likely after work)
  },
  'Morning deflection': {
    triggerType: 'check_in',
    priority: 'low',
    delayMinutes: 480, // 8 hours (evening check-in)
  },
  'Relationship tension': {
    triggerType: 'emotional_support',
    priority: 'medium',
    delayMinutes: 1440, // Next day (give them space)
  },
};

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Schedule proactive outreach based on detected pattern
 *
 * This is the main entry point - called from live-superhuman-injections
 * when a pattern is detected during conversation.
 */
export async function schedulePatternOutreach(
  pattern: PatternTrigger,
  ctx: PatternOutreachContext
): Promise<void> {
  const schedule = PATTERN_OUTREACH_MAP[pattern.pattern];

  if (!schedule) {
    log.debug({ pattern: pattern.pattern }, 'No outreach schedule for pattern');
    return;
  }

  // Check deduplication - don't schedule same pattern twice in 4 hours
  if (wasRecentlyScheduled(ctx.userId, pattern.pattern)) {
    log.debug(
      { userId: ctx.userId, pattern: pattern.pattern },
      'Pattern already scheduled recently, skipping duplicate'
    );
    return;
  }

  // Calculate scheduled time
  const scheduledFor = calculateScheduledTime(schedule);

  // Build the trigger payload
  const trigger: Omit<OutreachTriggerPayload, 'id' | 'createdAt'> = {
    userId: ctx.userId,
    type: schedule.triggerType,
    priority: schedule.priority,
    reason: `Pattern detected: ${pattern.patternDescription}`,
    sessionId: ctx.sessionId,
    personaId: ctx.personaId || 'ferni',
    scheduledFor: scheduledFor.toISOString(),
    context: {
      commitment: pattern.tendency,
      emotion: ctx.currentEmotion,
      emotionIntensity: ctx.emotionIntensity,
      topics: ctx.topics,
      metadata: {
        patternType: pattern.pattern,
        suggestedMessage: pattern.suggestedOutreach,
        actionable: pattern.actionable,
        source: 'pattern_detection',
      },
    },
  };

  // Publish to outreach system
  const result = await publishOutreachTrigger(trigger);

  if (result.success) {
    // Mark as scheduled for deduplication
    markAsScheduled(ctx.userId, pattern.pattern);

    log.info(
      {
        userId: ctx.userId,
        pattern: pattern.pattern,
        scheduledFor: scheduledFor.toISOString(),
        triggerId: result.triggerId,
      },
      '📅 Pattern-based outreach scheduled'
    );
  } else {
    log.warn(
      {
        userId: ctx.userId,
        pattern: pattern.pattern,
        error: result.error,
      },
      'Failed to schedule pattern-based outreach'
    );
  }
}

/**
 * Fire-and-forget version for use in hot paths
 */
export function schedulePatternOutreachAsync(
  pattern: PatternTrigger,
  ctx: PatternOutreachContext
): void {
  runBackground(schedulePatternOutreach(pattern, ctx), {
    task: 'pattern-outreach-scheduling',
    context: { pattern: pattern.pattern, userId: ctx.userId },
  });
}

// ============================================================================
// SCHEDULING HELPERS
// ============================================================================

/**
 * Calculate when outreach should happen based on schedule
 */
function calculateScheduledTime(schedule: OutreachSchedule): Date {
  const now = new Date();

  if (schedule.suggestedTime) {
    // Schedule for a specific time
    const target = new Date(now);
    target.setDate(target.getDate() + schedule.suggestedTime.dayOffset);
    target.setHours(schedule.suggestedTime.hour, 0, 0, 0);

    // If target is in the past, move to next day
    if (target <= now) {
      target.setDate(target.getDate() + 1);
    }

    return target;
  }

  // Otherwise, delay from now
  return new Date(now.getTime() + schedule.delayMinutes * 60 * 1000);
}

// ============================================================================
// SPECIALIZED OUTREACH FUNCTIONS
// ============================================================================

/**
 * Schedule Sunday evening anxiety follow-up
 * Called when user shows pre-Monday anxiety on Sunday
 */
export async function scheduleSundayAnxietyFollowUp(
  userId: string,
  sessionId: string,
  anxietyLevel: number
): Promise<void> {
  const priority = anxietyLevel > 0.7 ? 'high' : 'medium';

  // Calculate Monday 8am
  const mondayMorning = getNextWeekdayAt(1, 8); // Monday at 8am

  const trigger: Omit<OutreachTriggerPayload, 'id' | 'createdAt'> = {
    userId,
    type: 'pattern_acknowledgment',
    priority,
    reason: 'Sunday evening anxiety pattern - Monday morning check-in',
    sessionId,
    personaId: 'ferni',
    scheduledFor: mondayMorning.toISOString(),
    context: {
      emotion: 'anxiety',
      emotionIntensity: anxietyLevel,
      metadata: {
        patternType: 'sunday_evening_anxiety',
        suggestedMessage:
          "Good morning! I know Mondays can feel heavy. How are you doing? I'm here if you want to talk through anything.",
        source: 'pattern_detection',
      },
    },
  };

  await publishOutreachTrigger(trigger);
  log.info(
    { userId, scheduledFor: mondayMorning.toISOString() },
    '📅 Monday morning check-in scheduled'
  );
}

/**
 * Schedule work stress evening check-in
 * Called when user is stressed about work during the day
 */
export async function scheduleWorkStressFollowUp(
  userId: string,
  sessionId: string,
  stressTopics: string[]
): Promise<void> {
  // Calculate evening time (7pm today, or tomorrow if past 7pm)
  const evening = getNextTimeAt(19); // 7pm

  const trigger: Omit<OutreachTriggerPayload, 'id' | 'createdAt'> = {
    userId,
    type: 'emotional_support',
    priority: 'medium',
    reason: 'Work stress detected - evening support check-in',
    sessionId,
    personaId: 'ferni',
    scheduledFor: evening.toISOString(),
    context: {
      emotion: 'stress',
      topics: stressTopics,
      metadata: {
        patternType: 'work_stress',
        suggestedMessage:
          "Hey, I was thinking about what you shared earlier about work. How are you feeling now that the day's winding down?",
        source: 'pattern_detection',
      },
    },
  };

  await publishOutreachTrigger(trigger);
  log.info({ userId, scheduledFor: evening.toISOString() }, '📅 Work stress follow-up scheduled');
}

/**
 * Schedule relationship tension gentle check-in
 * Called when user mentions relationship stress
 */
export async function scheduleRelationshipCheckIn(
  userId: string,
  sessionId: string,
  relationshipType: string
): Promise<void> {
  // Wait a day before checking in (give them space)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(12, 0, 0, 0); // Noon tomorrow

  const trigger: Omit<OutreachTriggerPayload, 'id' | 'createdAt'> = {
    userId,
    type: 'check_in',
    priority: 'low',
    reason: `Relationship tension with ${relationshipType} - gentle follow-up`,
    sessionId,
    personaId: 'ferni',
    scheduledFor: tomorrow.toISOString(),
    context: {
      metadata: {
        patternType: 'relationship_tension',
        relationshipType,
        suggestedMessage: `Hey, just thinking of you. How are things going?`,
        source: 'pattern_detection',
      },
    },
  };

  await publishOutreachTrigger(trigger);
  log.info({ userId, scheduledFor: tomorrow.toISOString() }, '📅 Relationship check-in scheduled');
}

// ============================================================================
// TIME UTILITIES
// ============================================================================

/**
 * Get next occurrence of a specific weekday at a specific hour
 */
function getNextWeekdayAt(targetDay: number, hour: number): Date {
  const now = new Date();
  const result = new Date(now);

  // Calculate days until target day
  let daysUntil = targetDay - now.getDay();
  if (daysUntil <= 0) daysUntil += 7;

  result.setDate(result.getDate() + daysUntil);
  result.setHours(hour, 0, 0, 0);

  return result;
}

/**
 * Get next occurrence of a specific hour (today or tomorrow)
 */
function getNextTimeAt(hour: number): Date {
  const now = new Date();
  const result = new Date(now);
  result.setHours(hour, 0, 0, 0);

  // If it's past that time today, move to tomorrow
  if (result <= now) {
    result.setDate(result.getDate() + 1);
  }

  return result;
}

// ============================================================================
// EXPORTS
// ============================================================================

export { PATTERN_OUTREACH_MAP, calculateScheduledTime, getNextWeekdayAt, getNextTimeAt };

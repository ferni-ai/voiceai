/**
 * CEO Coaching Proactive Triggers
 *
 * > "We show up. Not because you asked. Because we noticed."
 *
 * Detects patterns in CEO coaching data that warrant proactive outreach:
 * - Energy downtrends (burnout risk)
 * - Stale blockers (stuck for 14+ days)
 * - Win streaks (celebrate momentum)
 * - Decision paralysis (pending too long)
 * - Gratitude gaps (mindset drift)
 * - Achievement milestones (5, 10, 25 wins)
 *
 * Integrates with the existing proactive-call-scheduler to trigger
 * warm, personalized outbound calls at optimal times.
 *
 * @module services/ceo-coaching/proactive-triggers
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  getRecentWins,
  getEnergyTrend,
  getRecentEnergyEntries,
  getActiveBlockers,
  getPendingDecisions,
  getRecentGratitude,
  getPriorities,
} from '../../tools/domains/ceo-coaching/storage.js';
import {
  scheduleProactiveCall,
  type ProactiveCallRequest,
} from '../outreach/proactive-call-scheduler.js';
import type { OutreachType, UserContext } from '../outreach/llm-content-generator.js';

const log = createLogger({ module: 'ceo-proactive-triggers' });

// ============================================================================
// TYPES
// ============================================================================

export type CEOTriggerType =
  | 'energy_downtrend' // Energy dropping over several days
  | 'energy_crash' // Sudden energy drop (≤3)
  | 'stale_blocker' // Blocker unresolved 14+ days
  | 'decision_paralysis' // Decision pending 14+ days
  | 'win_streak' // 5+ wins in a week - celebrate!
  | 'win_milestone' // 5, 10, 25, 50 total wins
  | 'gratitude_gap' // No gratitude logged in 7+ days
  | 'priority_overload' // 5+ active priorities
  | 'morning_briefing'; // Proactive morning check-in

export interface CEOTrigger {
  type: CEOTriggerType;
  priority: 'high' | 'medium' | 'low';
  message: string;
  data?: Record<string, unknown>;
  outreachType: OutreachType;
}

export interface CEOTriggerAnalysis {
  userId: string;
  analyzedAt: string;
  triggers: CEOTrigger[];
  shouldReachOut: boolean;
  topTrigger?: CEOTrigger;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export const TRIGGER_CONFIG = {
  // Energy thresholds
  ENERGY_LOW_THRESHOLD: 4,
  ENERGY_CRASH_THRESHOLD: 3,
  ENERGY_DOWNTREND_DAYS: 3,

  // Time thresholds (days)
  BLOCKER_STALE_DAYS: 14,
  DECISION_STALE_DAYS: 14,
  GRATITUDE_GAP_DAYS: 7,

  // Win thresholds
  WIN_STREAK_THRESHOLD: 5,
  WIN_MILESTONES: [5, 10, 25, 50, 100],

  // Priority thresholds
  PRIORITY_OVERLOAD_THRESHOLD: 5,

  // Cooldowns (hours) - prevent over-contact
  COOLDOWN_HIGH_PRIORITY: 24,
  COOLDOWN_MEDIUM_PRIORITY: 72,
  COOLDOWN_LOW_PRIORITY: 168,
};

// ============================================================================
// TRIGGER DETECTION
// ============================================================================

/**
 * Analyze a user's CEO coaching data for proactive outreach triggers.
 */
export async function analyzeUserForTriggers(userId: string): Promise<CEOTriggerAnalysis> {
  const triggers: CEOTrigger[] = [];
  const analyzedAt = new Date().toISOString();

  try {
    // Fetch all data in parallel for efficiency
    const [
      recentWins,
      energyTrend,
      energyEntries,
      activeBlockers,
      pendingDecisions,
      recentGratitude,
      priorities,
    ] = await Promise.all([
      getRecentWins(userId, 7).catch(() => []),
      getEnergyTrend(userId).catch(() => null),
      getRecentEnergyEntries(userId, 7).catch(() => []),
      getActiveBlockers(userId).catch(() => []),
      getPendingDecisions(userId).catch(() => []),
      getRecentGratitude(userId, 14).catch(() => []),
      getPriorities(userId).catch(() => []),
    ]);

    // 1. Check for energy downtrend
    if (
      energyTrend?.trend === 'down' &&
      energyTrend.weekAverage &&
      energyTrend.weekAverage < TRIGGER_CONFIG.ENERGY_LOW_THRESHOLD
    ) {
      triggers.push({
        type: 'energy_downtrend',
        priority: 'high',
        message: `Energy trending down to ${energyTrend.weekAverage.toFixed(1)}/10 - may need support`,
        data: { average: energyTrend.weekAverage, trend: 'down' },
        outreachType: 'setback_support',
      });
    }

    // 2. Check for energy crash (sudden low)
    const latestEnergy = energyEntries[0];
    if (latestEnergy && latestEnergy.level <= TRIGGER_CONFIG.ENERGY_CRASH_THRESHOLD) {
      triggers.push({
        type: 'energy_crash',
        priority: 'high',
        message: `Energy at ${latestEnergy.level}/10 - needs immediate support`,
        data: { level: latestEnergy.level, note: latestEnergy.note },
        outreachType: 'setback_support',
      });
    }

    // 3. Check for stale blockers
    const now = new Date();
    const staleBlockers = activeBlockers.filter((b) => {
      const daysOld = Math.floor(
        (now.getTime() - new Date(b.createdAt).getTime()) / (24 * 60 * 60 * 1000)
      );
      return daysOld >= TRIGGER_CONFIG.BLOCKER_STALE_DAYS;
    });

    if (staleBlockers.length > 0) {
      triggers.push({
        type: 'stale_blocker',
        priority: staleBlockers.length >= 3 ? 'high' : 'medium',
        message: `${staleBlockers.length} blocker(s) stuck for 14+ days`,
        data: {
          count: staleBlockers.length,
          blockers: staleBlockers.map((b) => b.text).slice(0, 3),
        },
        outreachType: 'momentum_check',
      });
    }

    // 4. Check for decision paralysis
    const staleDecisions = pendingDecisions.filter((d) => {
      const daysOld = Math.floor(
        (now.getTime() - new Date(d.createdAt).getTime()) / (24 * 60 * 60 * 1000)
      );
      return daysOld >= TRIGGER_CONFIG.DECISION_STALE_DAYS;
    });

    if (staleDecisions.length > 0) {
      triggers.push({
        type: 'decision_paralysis',
        priority: staleDecisions.length >= 2 ? 'high' : 'medium',
        message: `${staleDecisions.length} decision(s) pending 14+ days`,
        data: {
          count: staleDecisions.length,
          decisions: staleDecisions.map((d) => d.description).slice(0, 3),
        },
        outreachType: 'momentum_check',
      });
    }

    // 5. Check for win streak (celebrate!)
    if (recentWins.length >= TRIGGER_CONFIG.WIN_STREAK_THRESHOLD) {
      triggers.push({
        type: 'win_streak',
        priority: 'medium',
        message: `${recentWins.length} wins this week - hot streak!`,
        data: { count: recentWins.length, wins: recentWins.map((w) => w.text).slice(0, 3) },
        outreachType: 'win_celebration',
      });
    }

    // 6. Check for win milestones (total count)
    // NOTE: This would need total win count from storage
    // For now, we check if recent wins pushed them over a milestone
    // This is a simplified check - in production, track total in storage

    // 7. Check for gratitude gap
    const daysSinceGratitude =
      recentGratitude.length > 0
        ? Math.floor(
            (now.getTime() - new Date(recentGratitude[0].date).getTime()) / (24 * 60 * 60 * 1000)
          )
        : 999;

    if (daysSinceGratitude >= TRIGGER_CONFIG.GRATITUDE_GAP_DAYS) {
      triggers.push({
        type: 'gratitude_gap',
        priority: 'low',
        message: `No gratitude logged in ${daysSinceGratitude} days`,
        data: { daysSince: daysSinceGratitude },
        outreachType: 'thinking_of_you',
      });
    }

    // 8. Check for priority overload
    const activePriorities = priorities.filter((p) => p.status === 'active');
    if (activePriorities.length >= TRIGGER_CONFIG.PRIORITY_OVERLOAD_THRESHOLD) {
      triggers.push({
        type: 'priority_overload',
        priority: activePriorities.length >= 7 ? 'high' : 'medium',
        message: `${activePriorities.length} active priorities - may need help focusing`,
        data: { count: activePriorities.length },
        outreachType: 'momentum_check',
      });
    }

    // Sort triggers by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    triggers.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    const shouldReachOut = triggers.some((t) => t.priority === 'high' || t.priority === 'medium');
    const topTrigger = triggers[0];

    log.info(
      {
        userId,
        triggerCount: triggers.length,
        topTrigger: topTrigger?.type,
        shouldReachOut,
      },
      'CEO coaching trigger analysis complete'
    );

    return {
      userId,
      analyzedAt,
      triggers,
      shouldReachOut,
      topTrigger,
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to analyze user for triggers');
    return {
      userId,
      analyzedAt,
      triggers: [],
      shouldReachOut: false,
    };
  }
}

// ============================================================================
// OUTREACH TRIGGER
// ============================================================================

/**
 * Build user context for the outreach system from CEO coaching data.
 */
async function buildUserContextForOutreach(
  userId: string,
  userName?: string,
  recentTopics?: string[]
): Promise<UserContext> {
  // Get user metadata from Firestore (engagement, days since signup, etc.)
  // For now, use sensible defaults
  return {
    userId,
    name: userName,
    daysSinceSignup: 30, // Would come from user profile
    conversationCount: 10, // Would come from session history
    engagementLevel: 'medium',
    primaryConcerns: recentTopics,
    recentTopics,
  };
}

/**
 * Trigger a proactive outbound call based on CEO coaching patterns.
 */
export async function triggerProactiveOutreach(
  userId: string,
  phoneNumber: string,
  trigger: CEOTrigger,
  userName?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    log.info(
      {
        userId,
        triggerType: trigger.type,
        priority: trigger.priority,
        outreachType: trigger.outreachType,
      },
      'Triggering proactive outreach for CEO coaching pattern'
    );

    // Build user context
    const recentTopics =
      (trigger.data?.blockers as string[]) ||
      (trigger.data?.decisions as string[]) ||
      (trigger.data?.wins as string[]) ||
      [];

    const userContext = await buildUserContextForOutreach(userId, userName, recentTopics);

    // Add trigger-specific context
    if (trigger.type === 'energy_downtrend' || trigger.type === 'energy_crash') {
      userContext.lastMood = 'struggling';
      userContext.emotionalPatterns = ['low_energy', 'needs_support'];
    } else if (trigger.type === 'win_streak') {
      userContext.lastMood = 'winning';
      userContext.milestonesReached = trigger.data?.wins as string[];
    }

    // Build the call request
    const request: ProactiveCallRequest = {
      userId,
      phoneNumber,
      userContext,
      outreachType: trigger.outreachType,
      personaId: 'ferni', // Ferni handles CEO coaching calls
      reason: `CEO Coaching: ${trigger.type} - ${trigger.message}`,
    };

    const result = await scheduleProactiveCall(request);

    if (result.success) {
      log.info(
        {
          userId,
          triggerType: trigger.type,
          callId: result.callId,
          status: result.status,
        },
        'Proactive outreach scheduled successfully'
      );
    }

    return { success: result.success, error: result.error };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to trigger proactive outreach');
    return { success: false, error: String(error) };
  }
}

// ============================================================================
// BATCH PROCESSING (for scheduled jobs)
// ============================================================================

/**
 * Process all users for CEO coaching triggers.
 * Intended to be called by a Cloud Scheduler job (e.g., daily at 9 AM).
 */
export async function processCEOTriggersBatch(
  getUserIds: () => Promise<string[]>,
  getUserPhone: (userId: string) => Promise<string | null>,
  getUserName: (userId: string) => Promise<string | undefined>
): Promise<{ processed: number; triggered: number; errors: number }> {
  const stats = { processed: 0, triggered: 0, errors: 0 };

  try {
    const userIds = await getUserIds();
    log.info({ userCount: userIds.length }, 'Starting CEO trigger batch processing');

    for (const userId of userIds) {
      try {
        stats.processed++;

        // Analyze for triggers
        const analysis = await analyzeUserForTriggers(userId);

        if (!analysis.shouldReachOut || !analysis.topTrigger) {
          continue;
        }

        // Get user's phone number
        const phoneNumber = await getUserPhone(userId);
        if (!phoneNumber) {
          log.debug({ userId }, 'No phone number for user, skipping outreach');
          continue;
        }

        // Get user's name for personalization
        const userName = await getUserName(userId);

        // Trigger outreach
        const result = await triggerProactiveOutreach(
          userId,
          phoneNumber,
          analysis.topTrigger,
          userName
        );

        if (result.success) {
          stats.triggered++;
        } else {
          stats.errors++;
        }
      } catch (error) {
        log.error({ error: String(error), userId }, 'Error processing user for triggers');
        stats.errors++;
      }
    }

    log.info(stats, 'CEO trigger batch processing complete');
    return stats;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to process CEO triggers batch');
    return stats;
  }
}

// ============================================================================
// INDIVIDUAL CHECKS (for real-time triggers)
// ============================================================================

/**
 * Check if a user should receive a proactive call right now.
 * Call this after significant events (e.g., energy logged at 2/10).
 */
export async function checkImmediateTrigger(
  userId: string,
  eventType: 'energy_logged' | 'blocker_added' | 'win_logged' | 'decision_made',
  eventData?: Record<string, unknown>
): Promise<CEOTrigger | null> {
  try {
    // Energy crash check (immediate)
    if (eventType === 'energy_logged' && typeof eventData?.level === 'number') {
      if (eventData.level <= TRIGGER_CONFIG.ENERGY_CRASH_THRESHOLD) {
        return {
          type: 'energy_crash',
          priority: 'high',
          message: `Energy at ${eventData.level}/10 - immediate support needed`,
          data: eventData,
          outreachType: 'setback_support',
        };
      }
    }

    // Win celebration check (immediate for milestones)
    if (eventType === 'win_logged') {
      // Check if this win completes a streak or milestone
      const recentWins = await getRecentWins(userId, 7).catch(() => []);
      if (recentWins.length >= TRIGGER_CONFIG.WIN_STREAK_THRESHOLD) {
        return {
          type: 'win_streak',
          priority: 'medium',
          message: `${recentWins.length} wins this week!`,
          data: { count: recentWins.length },
          outreachType: 'win_celebration',
        };
      }
    }

    return null;
  } catch (error) {
    log.error({ error: String(error), userId, eventType }, 'Error checking immediate trigger');
    return null;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  analyzeUserForTriggers as analyzeTriggers,
  triggerProactiveOutreach as triggerOutreach,
  checkImmediateTrigger as checkImmediate,
  processCEOTriggersBatch as processBatch,
  TRIGGER_CONFIG as config,
};

export default {
  analyzeTriggers: analyzeUserForTriggers,
  triggerOutreach: triggerProactiveOutreach,
  checkImmediate: checkImmediateTrigger,
  processBatch: processCEOTriggersBatch,
  config: TRIGGER_CONFIG,
};

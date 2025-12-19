/**
 * Maya's Habit Outreach System
 *
 * > "I've seen the pattern. I know what's coming. Let me help before you fall."
 *
 * Maya-specific proactive outreach for habits:
 *
 * 1. **Streak Protection** - Alert before a streak breaks
 * 2. **Weekly Review** - Reflective habit check-in
 * 3. **Setback Recovery** - Gentle reconnection after missed days
 * 4. **Milestone Celebration** - 7, 21, 30, 66, 100 day streaks
 * 5. **Predictive Challenge** - Holidays, travel, stress periods
 *
 * @module services/outreach/maya-habit-outreach
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getProductivityStore } from '../productivity-store.js';
import { publishOutreachTrigger, type OutreachTriggerPayload } from './trigger-publisher.js';
import type { OutreachPriority } from './decision-engine.js';

const log = createLogger({ module: 'MayaHabitOutreach' });

// ============================================================================
// TYPES
// ============================================================================

export interface HabitOutreachContext {
  userId: string;
  habitId?: string;
  habitName?: string;
  streakDays?: number;
  missedDays?: number;
  completionRate?: number;
  reason: string;
}

export interface StreakAtRiskResult {
  atRisk: boolean;
  habits: Array<{
    id: string;
    name: string;
    streakDays: number;
    lastCompleted: Date | null;
  }>;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  /** Streak length that triggers protection alerts */
  streakProtectionThreshold: 7,
  /** Hour of day to send evening streak alerts (24h format) */
  eveningAlertHour: 19,
  /** Day of week for weekly review (0 = Sunday) */
  weeklyReviewDay: 0,
  /** Hour for weekly review */
  weeklyReviewHour: 10,
  /** Milestone days to celebrate */
  milestoneDays: [7, 14, 21, 30, 45, 66, 90, 100, 180, 365],
  /** Days missed before setback recovery outreach */
  setbackRecoveryDays: 3,
};

// ============================================================================
// STREAK PROTECTION
// ============================================================================

/**
 * Check if user has any streaks at risk of breaking today
 */
export async function checkStreaksAtRisk(userId: string): Promise<StreakAtRiskResult> {
  try {
    const store = getProductivityStore();
    await store.loadUserData(userId);

    const habits = store.getUserHabits(userId).filter((h) => h.isActive);
    const logs = store.getUserHabitLogs(userId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const atRiskHabits: StreakAtRiskResult['habits'] = [];

    for (const habit of habits) {
      // Get completed logs sorted by date
      const habitLogs = logs
        .filter((l) => l.habitId === habit.id && l.completed)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // Calculate current streak
      let streak = 0;
      for (let i = 0; i < 366; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(checkDate.getDate() - i);
        checkDate.setHours(0, 0, 0, 0);

        const hasLog = habitLogs.some((l) => {
          const logDate = new Date(l.date);
          logDate.setHours(0, 0, 0, 0);
          return logDate.getTime() === checkDate.getTime();
        });

        if (hasLog) {
          streak++;
        } else if (i > 0) {
          // Streak broken before today
          break;
        }
      }

      // Check if this streak is at risk (7+ days and not done today)
      if (streak >= CONFIG.streakProtectionThreshold) {
        const todayLog = habitLogs.find((l) => {
          const logDate = new Date(l.date);
          logDate.setHours(0, 0, 0, 0);
          return logDate.getTime() === today.getTime();
        });

        if (!todayLog) {
          const lastLog = habitLogs[0];
          atRiskHabits.push({
            id: habit.id,
            name: habit.name,
            streakDays: streak,
            lastCompleted: lastLog ? new Date(lastLog.date) : null,
          });
        }
      }
    }

    return {
      atRisk: atRiskHabits.length > 0,
      habits: atRiskHabits,
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to check streaks at risk');
    return { atRisk: false, habits: [] };
  }
}

/**
 * Publish streak protection outreach trigger
 */
export async function publishStreakProtectionAlert(
  context: HabitOutreachContext
): Promise<boolean> {
  const { userId, habitId, habitName, streakDays, reason } = context;

  try {
    const result = await publishOutreachTrigger({
      userId,
      type: 'streak_at_risk',
      priority: 'high' as OutreachPriority,
      reason: reason || `Protect ${streakDays}-day streak on "${habitName}"`,
      personaId: 'maya-santos',
      context: {
        metadata: {
          habitId,
          habitName,
          streakDays,
          triggerSource: 'maya-habit-outreach',
        },
      },
    });

    if (result.success) {
      log.info(
        { userId, habitName, streakDays, triggerId: result.triggerId },
        'Streak protection alert published'
      );
    }

    return result.success;
  } catch (error) {
    log.error({ error: String(error), userId, habitName }, 'Failed to publish streak protection');
    return false;
  }
}

// ============================================================================
// MILESTONE CELEBRATION
// ============================================================================

/**
 * Check for new milestones to celebrate
 */
export async function checkMilestonesToCelebrate(
  userId: string
): Promise<Array<{ habitId: string; habitName: string; days: number }>> {
  try {
    const store = getProductivityStore();
    await store.loadUserData(userId);

    const habits = store.getUserHabits(userId).filter((h) => h.isActive);
    const logs = store.getUserHabitLogs(userId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const milestonesToCelebrate: Array<{ habitId: string; habitName: string; days: number }> = [];

    for (const habit of habits) {
      const habitLogs = logs
        .filter((l) => l.habitId === habit.id && l.completed)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // Calculate streak
      let streak = 0;
      for (let i = 0; i < 366; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(checkDate.getDate() - i);
        checkDate.setHours(0, 0, 0, 0);

        const hasLog = habitLogs.some((l) => {
          const logDate = new Date(l.date);
          logDate.setHours(0, 0, 0, 0);
          return logDate.getTime() === checkDate.getTime();
        });

        if (hasLog) {
          streak++;
        } else if (i > 0) {
          break;
        }
      }

      // Check if streak hits a milestone
      if (CONFIG.milestoneDays.includes(streak)) {
        milestonesToCelebrate.push({
          habitId: habit.id,
          habitName: habit.name,
          days: streak,
        });
      }
    }

    return milestonesToCelebrate;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to check milestones');
    return [];
  }
}

/**
 * Publish milestone celebration trigger
 */
export async function publishMilestoneCelebration(
  userId: string,
  habitId: string,
  habitName: string,
  days: number
): Promise<boolean> {
  try {
    const result = await publishOutreachTrigger({
      userId,
      type: 'streak_celebration',
      priority: 'medium' as OutreachPriority,
      reason: `Celebrate ${days}-day streak on "${habitName}"! 🎉`,
      personaId: 'maya-santos',
      context: {
        milestone: `${days}-day streak`,
        metadata: {
          habitId,
          habitName,
          streakDays: days,
          triggerSource: 'maya-habit-outreach',
        },
      },
    });

    if (result.success) {
      log.info({ userId, habitName, days, triggerId: result.triggerId }, 'Milestone celebration published');
    }

    return result.success;
  } catch (error) {
    log.error({ error: String(error), userId, habitName }, 'Failed to publish milestone');
    return false;
  }
}

// ============================================================================
// WEEKLY REVIEW
// ============================================================================

/**
 * Generate weekly habit review data
 */
export async function generateWeeklyReviewData(
  userId: string
): Promise<{
  totalHabits: number;
  completedThisWeek: number;
  missedThisWeek: number;
  completionRate: number;
  bestStreak: { name: string; days: number } | null;
  improvingHabits: string[];
  strugglingHabits: string[];
} | null> {
  try {
    const store = getProductivityStore();
    await store.loadUserData(userId);

    const habits = store.getUserHabits(userId).filter((h) => h.isActive);
    const logs = store.getUserHabitLogs(userId);

    if (habits.length === 0) {
      return null;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const twoWeeksAgo = new Date(today);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    // This week's logs
    const thisWeekLogs = logs.filter(
      (l) => l.completed && new Date(l.date) >= weekAgo && new Date(l.date) <= today
    );

    // Last week's logs (for comparison)
    const lastWeekLogs = logs.filter(
      (l) => l.completed && new Date(l.date) >= twoWeeksAgo && new Date(l.date) < weekAgo
    );

    // Calculate stats
    const expectedCompletions = habits.length * 7;
    const completedThisWeek = thisWeekLogs.length;
    const missedThisWeek = Math.max(0, expectedCompletions - completedThisWeek);
    const completionRate = expectedCompletions > 0 ? completedThisWeek / expectedCompletions : 0;

    // Find best streak
    let bestStreak: { name: string; days: number } | null = null;
    for (const habit of habits) {
      const habitLogs = logs
        .filter((l) => l.habitId === habit.id && l.completed)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      let streak = 0;
      for (let i = 0; i < 366; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(checkDate.getDate() - i);
        checkDate.setHours(0, 0, 0, 0);

        const hasLog = habitLogs.some((l) => {
          const logDate = new Date(l.date);
          logDate.setHours(0, 0, 0, 0);
          return logDate.getTime() === checkDate.getTime();
        });

        if (hasLog) {
          streak++;
        } else if (i > 0) {
          break;
        }
      }

      if (streak > 0 && (!bestStreak || streak > bestStreak.days)) {
        bestStreak = { name: habit.name, days: streak };
      }
    }

    // Find improving vs struggling habits
    const improvingHabits: string[] = [];
    const strugglingHabits: string[] = [];

    for (const habit of habits) {
      const thisWeekCount = thisWeekLogs.filter((l) => l.habitId === habit.id).length;
      const lastWeekCount = lastWeekLogs.filter((l) => l.habitId === habit.id).length;

      if (thisWeekCount > lastWeekCount) {
        improvingHabits.push(habit.name);
      } else if (thisWeekCount < lastWeekCount && lastWeekCount > 0) {
        strugglingHabits.push(habit.name);
      }
    }

    return {
      totalHabits: habits.length,
      completedThisWeek,
      missedThisWeek,
      completionRate,
      bestStreak,
      improvingHabits,
      strugglingHabits,
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to generate weekly review');
    return null;
  }
}

/**
 * Publish weekly review trigger
 */
export async function publishWeeklyReviewTrigger(userId: string): Promise<boolean> {
  try {
    const reviewData = await generateWeeklyReviewData(userId);
    if (!reviewData) {
      return false;
    }

    const result = await publishOutreachTrigger({
      userId,
      type: 'habit_check',
      priority: 'low' as OutreachPriority,
      reason: `Weekly habit review: ${Math.round(reviewData.completionRate * 100)}% completion`,
      personaId: 'maya-santos',
      context: {
        metadata: {
          ...reviewData,
          triggerSource: 'maya-habit-outreach',
          outreachType: 'weekly_review',
        },
      },
    });

    if (result.success) {
      log.info(
        { userId, completionRate: reviewData.completionRate, triggerId: result.triggerId },
        'Weekly review trigger published'
      );
    }

    return result.success;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to publish weekly review');
    return false;
  }
}

// ============================================================================
// SETBACK RECOVERY
// ============================================================================

/**
 * Check for habits that need setback recovery outreach
 */
export async function checkSetbackRecoveryNeeded(
  userId: string
): Promise<Array<{ habitId: string; habitName: string; daysMissed: number; previousStreak: number }>> {
  try {
    const store = getProductivityStore();
    await store.loadUserData(userId);

    const habits = store.getUserHabits(userId).filter((h) => h.isActive);
    const logs = store.getUserHabitLogs(userId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const needsRecovery: Array<{ habitId: string; habitName: string; daysMissed: number; previousStreak: number }> = [];

    for (const habit of habits) {
      const habitLogs = logs
        .filter((l) => l.habitId === habit.id && l.completed)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      if (habitLogs.length === 0) {
        continue;
      }

      // Find last completion
      const lastLog = habitLogs[0];
      const lastDate = new Date(lastLog.date);
      lastDate.setHours(0, 0, 0, 0);

      const daysSinceLastCompletion = Math.floor(
        (today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      // If missed 3+ days, check what their previous streak was
      if (daysSinceLastCompletion >= CONFIG.setbackRecoveryDays) {
        // Calculate what their streak was before the break
        let previousStreak = 0;
        const breakPoint = new Date(lastDate);
        breakPoint.setDate(breakPoint.getDate() + 1);

        for (let i = 0; i < 366; i++) {
          const checkDate = new Date(lastDate);
          checkDate.setDate(checkDate.getDate() - i);
          checkDate.setHours(0, 0, 0, 0);

          const hasLog = habitLogs.some((l) => {
            const logDate = new Date(l.date);
            logDate.setHours(0, 0, 0, 0);
            return logDate.getTime() === checkDate.getTime();
          });

          if (hasLog) {
            previousStreak++;
          } else if (i > 0) {
            break;
          }
        }

        // Only flag if they had a meaningful streak before
        if (previousStreak >= 5) {
          needsRecovery.push({
            habitId: habit.id,
            habitName: habit.name,
            daysMissed: daysSinceLastCompletion,
            previousStreak,
          });
        }
      }
    }

    return needsRecovery;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to check setback recovery');
    return [];
  }
}

/**
 * Publish setback recovery trigger
 */
export async function publishSetbackRecoveryTrigger(
  userId: string,
  habitId: string,
  habitName: string,
  daysMissed: number,
  previousStreak: number
): Promise<boolean> {
  try {
    const result = await publishOutreachTrigger({
      userId,
      type: 'habit_check',
      priority: 'medium' as OutreachPriority,
      reason: `Gentle check-in: "${habitName}" - ${daysMissed} days since last completion (had ${previousStreak}-day streak)`,
      personaId: 'maya-santos',
      context: {
        metadata: {
          habitId,
          habitName,
          daysMissed,
          previousStreak,
          triggerSource: 'maya-habit-outreach',
          outreachType: 'setback_recovery',
        },
      },
    });

    if (result.success) {
      log.info(
        { userId, habitName, daysMissed, previousStreak, triggerId: result.triggerId },
        'Setback recovery trigger published'
      );
    }

    return result.success;
  } catch (error) {
    log.error({ error: String(error), userId, habitName }, 'Failed to publish setback recovery');
    return false;
  }
}

// ============================================================================
// MAYA'S OUTREACH MESSAGES
// ============================================================================

/**
 * Maya's voice for streak protection messages
 */
export const MAYA_STREAK_PROTECTION_MESSAGES: string[] = [
  `Hey! Quick heads up - you're at {days} days on "{habit}" and I haven't seen it logged today. Even a 2-minute version counts! 💚`,
  `{days} days strong on "{habit}"! Don't let tonight slip by - what's the tiniest version you could do right now?`,
  `Just thinking of you! Your {days}-day streak on "{habit}" is at stake today. No judgment if you can't, but wanted you to know.`,
  `Maya here! Your "{habit}" streak ({days} days!) ends at midnight. Can you squeeze in a tiny version? I believe in you.`,
];

/**
 * Maya's voice for milestone celebrations
 */
export const MAYA_MILESTONE_MESSAGES: Record<number, string[]> = {
  7: [
    `ONE WEEK! 🎉 You've done "{habit}" 7 days in a row. The first week is the hardest - you did it!`,
    `7 days on "{habit}"! This is when habits start to stick. I'm genuinely proud of you.`,
  ],
  21: [
    `21 DAYS! 🌟 "{habit}" is becoming part of who you are now. Research says this is the magic number.`,
    `Three weeks of "{habit}"! You're not just building a habit - you're becoming someone who does this.`,
  ],
  30: [
    `ONE MONTH! 🏆 30 days of "{habit}". This is huge. You've proven you can stick with something.`,
    `30 days! "{habit}" isn't a habit anymore - it's just what you do. That's identity-level change.`,
  ],
  66: [
    `66 DAYS! 🎊 The official "habit is automatic" milestone. "{habit}" is wired into your brain now.`,
    `66 days of "{habit}"! Science says you've officially automated this. It's who you are now.`,
  ],
  100: [
    `100 DAYS! 💯 "{habit}" for 100 days straight. You're in the top 1% of people who try this. Seriously.`,
    `Triple digits! 100 days of "{habit}". Most people don't last a week. You lasted 100 days.`,
  ],
  365: [
    `ONE. YEAR. 🏆✨ 365 days of "{habit}". You've changed your life. I've been honored to watch.`,
    `A FULL YEAR of "{habit}"! This isn't a habit - this is your lifestyle now. Incredible.`,
  ],
};

/**
 * Maya's voice for weekly reviews
 */
export const MAYA_WEEKLY_REVIEW_MESSAGES = {
  great: [
    `Weekly check-in: {rate}% this week! {best} is on fire ({days} days). Keep this momentum going! 🌱`,
    `Look at you! {rate}% completion this week. {best} streak is at {days} days. You're building something real.`,
  ],
  okay: [
    `Weekly habits: {rate}%. Not your best, not your worst. {best} is still going strong at {days} days. What would help next week?`,
    `This week: {rate}% on habits. Life happens! {best} is holding at {days} days. Want to troubleshoot the others?`,
  ],
  struggling: [
    `Checking in: {rate}% this week. That's okay - setbacks are data, not failure. What got in the way?`,
    `Tough week? {rate}% completion. I'm not disappointed - I'm curious. What happened?`,
  ],
};

/**
 * Maya's voice for setback recovery
 */
export const MAYA_SETBACK_MESSAGES: string[] = [
  `Hey. I noticed "{habit}" has been quiet for {days} days. You had {streak} days going. No judgment - just checking in. How are you?`,
  `It's been {days} days since "{habit}". You were at {streak} days! Life gets busy. Want to start fresh with a tiny version?`,
  `Maya here. Your "{habit}" streak ({streak} days!) broke {days} days ago. That sucks. But you're not starting from zero - all that progress is still in you.`,
];

// ============================================================================
// EXPORTS
// ============================================================================

export {
  CONFIG as MAYA_HABIT_OUTREACH_CONFIG,
};


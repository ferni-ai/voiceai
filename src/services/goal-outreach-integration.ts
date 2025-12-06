/**
 * Goal + Outreach Integration
 *
 * Connects Maya's habit/goal tracking with proactive outreach:
 * - Streak at risk alerts
 * - Goal milestone celebrations
 * - Missed check-in nudges
 * - Progress encouragement
 *
 * Works with the outreach intelligence system to send timely,
 * contextual messages that support user goals.
 */

import { getLogger } from '../utils/safe-logger.js';
import {
  scheduleText,
  scheduleEmail,
  getUserContactInfo,
  canReachUser,
} from '../tools/proactive-outreach.js';
import { getPreferences, canSendOutreach } from './outreach-intelligence.js';

// ============================================================================
// TYPES
// ============================================================================

export interface Goal {
  id: string;
  userId: string;
  title: string;
  description?: string;
  targetDate?: Date;
  progress: number; // 0-100
  status: 'active' | 'completed' | 'paused' | 'abandoned';
  milestones: GoalMilestone[];
  createdAt: Date;
  updatedAt: Date;
}

export interface GoalMilestone {
  id: string;
  title: string;
  targetProgress: number; // 0-100
  reached: boolean;
  reachedAt?: Date;
  celebrationSent: boolean;
}

export interface Streak {
  id: string;
  userId: string;
  habitName: string;
  currentStreak: number;
  longestStreak: number;
  lastCheckIn: Date;
  checkInFrequency: 'daily' | 'weekly';
  atRisk: boolean;
  riskAlertSent: boolean;
}

export interface HabitCheckIn {
  userId: string;
  habitName: string;
  completed: boolean;
  timestamp: Date;
  notes?: string;
}

// ============================================================================
// STORAGE
// ============================================================================

const goalStore = new Map<string, Goal[]>();
const streakStore = new Map<string, Streak[]>();

// ============================================================================
// STREAK MANAGEMENT
// ============================================================================

/**
 * Record a habit check-in and update streak
 */
export async function recordCheckIn(checkIn: HabitCheckIn): Promise<{
  streak: Streak;
  celebration?: string;
}> {
  const { userId, habitName, completed, timestamp } = checkIn;

  const streaks = streakStore.get(userId) || [];
  let streak = streaks.find((s) => s.habitName === habitName);

  if (!streak) {
    // Create new streak
    streak = {
      id: `streak_${Date.now()}`,
      userId,
      habitName,
      currentStreak: 0,
      longestStreak: 0,
      lastCheckIn: timestamp,
      checkInFrequency: 'daily',
      atRisk: false,
      riskAlertSent: false,
    };
    streaks.push(streak);
  }

  let celebration: string | undefined;

  if (completed) {
    // Check if this continues the streak
    const hoursSinceLastCheckIn =
      (timestamp.getTime() - streak.lastCheckIn.getTime()) / (1000 * 60 * 60);
    const maxGap = streak.checkInFrequency === 'daily' ? 36 : 192; // 1.5 days or 8 days

    if (hoursSinceLastCheckIn <= maxGap) {
      streak.currentStreak++;
    } else {
      // Streak broken, start over
      streak.currentStreak = 1;
    }

    // Update longest streak
    if (streak.currentStreak > streak.longestStreak) {
      streak.longestStreak = streak.currentStreak;
    }

    // Check for milestone celebrations
    celebration = await checkStreakMilestone(userId, streak);

    // Reset risk state
    streak.atRisk = false;
    streak.riskAlertSent = false;
  }

  streak.lastCheckIn = timestamp;
  streakStore.set(userId, streaks);

  getLogger().info(
    { userId, habitName, streak: streak.currentStreak, completed },
    '📊 Habit check-in recorded'
  );

  return { streak, celebration };
}

/**
 * Check for streak milestones and send celebrations
 */
async function checkStreakMilestone(userId: string, streak: Streak): Promise<string | undefined> {
  const milestones = [3, 7, 14, 21, 30, 60, 90, 100, 180, 365];

  if (!milestones.includes(streak.currentStreak)) {
    return undefined;
  }

  // Check if we can reach user
  if (!(await canReachUser(userId)) || !canSendOutreach(userId)) {
    return undefined;
  }

  const prefs = getPreferences(userId);
  const messages: Record<number, string> = {
    3: `🔥 3-day streak on ${streak.habitName}! You're building momentum!`,
    7: `🎉 ONE WEEK! You've been crushing ${streak.habitName} for 7 days straight!`,
    14: `💪 Two weeks of ${streak.habitName}! You're officially in the habit zone!`,
    21: `🏆 21 DAYS! They say it takes 21 days to form a habit - you did it!`,
    30: `🌟 30-DAY STREAK! A full month of ${streak.habitName}! Incredible dedication!`,
    60: `🚀 60 days! ${streak.habitName} is truly part of your lifestyle now!`,
    90: `👑 90-DAY STREAK! Quarter of a year! You're unstoppable!`,
    100: `💯 ONE HUNDRED DAYS! Triple digits on ${streak.habitName}!`,
    180: `🎊 6 MONTHS! Half a year of consistent ${streak.habitName}!`,
    365: `🏅 ONE YEAR! 365 days of ${streak.habitName}! You're a legend!`,
  };

  const message = messages[streak.currentStreak];
  if (!message) return undefined;

  // Schedule celebration message
  const now = new Date();
  const result = await scheduleText(userId, message, now, 'Maya');

  if (result.success) {
    getLogger().info(
      { userId, habitName: streak.habitName, streak: streak.currentStreak },
      '🎉 Streak celebration sent'
    );
  }

  return message;
}

/**
 * Check for at-risk streaks and send alerts
 */
export async function checkAtRiskStreaks(): Promise<number> {
  let alertsSent = 0;
  const now = new Date();

  for (const [userId, streaks] of streakStore) {
    for (const streak of streaks) {
      if (streak.currentStreak === 0) continue;
      if (streak.riskAlertSent) continue;

      // Calculate hours since last check-in
      const hoursSinceCheckIn = (now.getTime() - streak.lastCheckIn.getTime()) / (1000 * 60 * 60);

      // Risk thresholds (alert when X hours without check-in)
      const riskThreshold = streak.checkInFrequency === 'daily' ? 20 : 144; // 20 hours or 6 days

      if (hoursSinceCheckIn >= riskThreshold && !streak.atRisk) {
        streak.atRisk = true;

        // Check if we can reach user
        if (!(await canReachUser(userId)) || !canSendOutreach(userId)) {
          continue;
        }

        // Send risk alert
        const message = getStreakRiskMessage(streak);
        const result = await scheduleText(userId, message, now, 'Maya');

        if (result.success) {
          streak.riskAlertSent = true;
          alertsSent++;

          getLogger().info(
            { userId, habitName: streak.habitName, streak: streak.currentStreak },
            '⚠️ Streak at-risk alert sent'
          );
        }
      }
    }

    streakStore.set(userId, streaks);
  }

  return alertsSent;
}

/**
 * Get contextual message for at-risk streak
 */
function getStreakRiskMessage(streak: Streak): string {
  const messages = [
    `Hey! Your ${streak.currentStreak}-day ${streak.habitName} streak is at risk! 😰 Still time to keep it going today!`,
    `Don't let that ${streak.currentStreak}-day streak slip! Quick ${streak.habitName} check-in? You've got this! 💪`,
    `Your ${streak.habitName} streak (${streak.currentStreak} days!) needs you! Even a small effort counts. 🌟`,
    `Remember that ${streak.currentStreak}-day ${streak.habitName} streak? It's counting on you today! 🔥`,
  ];

  return messages[Math.floor(Math.random() * messages.length)];
}

// ============================================================================
// GOAL MANAGEMENT
// ============================================================================

/**
 * Create a new goal
 */
export function createGoal(params: {
  userId: string;
  title: string;
  description?: string;
  targetDate?: Date;
  milestones?: Array<{ title: string; targetProgress: number }>;
}): Goal {
  const goal: Goal = {
    id: `goal_${Date.now()}`,
    userId: params.userId,
    title: params.title,
    description: params.description,
    targetDate: params.targetDate,
    progress: 0,
    status: 'active',
    milestones: (params.milestones || []).map((m, i) => ({
      id: `milestone_${i}`,
      title: m.title,
      targetProgress: m.targetProgress,
      reached: false,
      celebrationSent: false,
    })),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const goals = goalStore.get(params.userId) || [];
  goals.push(goal);
  goalStore.set(params.userId, goals);

  getLogger().info(
    { userId: params.userId, goalId: goal.id, title: goal.title },
    '🎯 Goal created'
  );

  return goal;
}

/**
 * Update goal progress and check for milestone celebrations
 */
export async function updateGoalProgress(
  userId: string,
  goalId: string,
  newProgress: number
): Promise<{
  goal: Goal;
  milestonesReached: GoalMilestone[];
  celebration?: string;
}> {
  const goals = goalStore.get(userId) || [];
  const goal = goals.find((g) => g.id === goalId);

  if (!goal) {
    throw new Error(`Goal ${goalId} not found`);
  }

  const oldProgress = goal.progress;
  goal.progress = Math.min(100, Math.max(0, newProgress));
  goal.updatedAt = new Date();

  // Check for newly reached milestones
  const milestonesReached: GoalMilestone[] = [];

  for (const milestone of goal.milestones) {
    if (!milestone.reached && goal.progress >= milestone.targetProgress) {
      milestone.reached = true;
      milestone.reachedAt = new Date();
      milestonesReached.push(milestone);
    }
  }

  // Check for goal completion
  let celebration: string | undefined;

  if (goal.progress >= 100 && oldProgress < 100) {
    goal.status = 'completed';
    celebration = `🎊 GOAL ACHIEVED! You completed "${goal.title}"! I'm so proud of you! 🏆`;
  } else if (milestonesReached.length > 0) {
    const milestone = milestonesReached[milestonesReached.length - 1];
    celebration = `🎉 Milestone reached! "${milestone.title}" - You're ${goal.progress}% of the way to "${goal.title}"!`;
  }

  // Send celebration if we can reach user
  if (celebration && (await canReachUser(userId)) && canSendOutreach(userId)) {
    const result = await scheduleText(userId, celebration, new Date(), 'Maya');

    if (result.success) {
      for (const m of milestonesReached) {
        m.celebrationSent = true;
      }
      getLogger().info({ userId, goalId, progress: goal.progress }, '🎉 Goal celebration sent');
    }
  }

  goalStore.set(userId, goals);

  return { goal, milestonesReached, celebration };
}

/**
 * Get user's active goals
 */
export function getActiveGoals(userId: string): Goal[] {
  const goals = goalStore.get(userId) || [];
  return goals.filter((g) => g.status === 'active');
}

/**
 * Check for goals at risk (deadline approaching)
 */
export async function checkGoalDeadlines(): Promise<number> {
  let alertsSent = 0;
  const now = new Date();

  for (const [userId, goals] of goalStore) {
    for (const goal of goals) {
      if (goal.status !== 'active' || !goal.targetDate) continue;

      const daysUntilDeadline = (goal.targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

      // Alert at 7 days, 3 days, 1 day
      const alertDays = [7, 3, 1];

      for (const alertDay of alertDays) {
        if (daysUntilDeadline <= alertDay && daysUntilDeadline > alertDay - 1) {
          if (!(await canReachUser(userId)) || !canSendOutreach(userId)) continue;

          const message = getDeadlineMessage(goal, Math.ceil(daysUntilDeadline));
          const result = await scheduleText(userId, message, now, 'Maya');

          if (result.success) {
            alertsSent++;
            getLogger().info(
              { userId, goalId: goal.id, daysLeft: alertDay },
              '⏰ Goal deadline alert sent'
            );
          }
          break;
        }
      }
    }
  }

  return alertsSent;
}

/**
 * Get deadline reminder message
 */
function getDeadlineMessage(goal: Goal, daysLeft: number): string {
  if (daysLeft === 1) {
    return `⏰ "${goal.title}" deadline is TOMORROW! You're at ${goal.progress}%. Final push! 💪`;
  } else if (daysLeft <= 3) {
    return `⚡ ${daysLeft} days left for "${goal.title}"! Currently at ${goal.progress}%. Let's make it happen!`;
  } else {
    return `📅 One week until "${goal.title}" deadline. You're ${goal.progress}% there - how can I help you finish strong?`;
  }
}

// ============================================================================
// MISSED CHECK-IN DETECTION
// ============================================================================

/**
 * Check for users who haven't engaged and send nudges
 */
export async function sendMissedCheckInNudges(maxDaysSinceContact = 3): Promise<number> {
  // This would integrate with engagement tracking
  // For now, returns 0 as it needs lastInteraction data
  return 0;
}

// ============================================================================
// SCHEDULED JOBS
// ============================================================================

let goalCheckInterval: NodeJS.Timeout | null = null;

/**
 * Start the goal monitoring background job
 */
export function startGoalMonitoring(intervalMs: number = 60 * 60 * 1000): void {
  if (goalCheckInterval) {
    getLogger().warn('Goal monitoring already running');
    return;
  }

  getLogger().info({ intervalMs }, '🎯 Starting goal monitoring');

  goalCheckInterval = setInterval(() => {
    void (async () => {
      try {
        const streakAlerts = await checkAtRiskStreaks();
        const deadlineAlerts = await checkGoalDeadlines();

        if (streakAlerts > 0 || deadlineAlerts > 0) {
          getLogger().info({ streakAlerts, deadlineAlerts }, '📊 Goal monitoring cycle complete');
        }
      } catch (error) {
        getLogger().error({ error }, 'Goal monitoring error');
      }
    })();
  }, intervalMs);
}

/**
 * Stop the goal monitoring background job
 */
export function stopGoalMonitoring(): void {
  if (goalCheckInterval) {
    clearInterval(goalCheckInterval);
    goalCheckInterval = null;
    getLogger().info('Goal monitoring stopped');
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Streaks
  recordCheckIn,
  checkAtRiskStreaks,

  // Goals
  createGoal,
  updateGoalProgress,
  getActiveGoals,
  checkGoalDeadlines,

  // Background jobs
  startGoalMonitoring,
  stopGoalMonitoring,
};

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
 *
 * PERSISTENCE: Goals and streaks are persisted to Firestore.
 */

import { canReachUser, scheduleEmail, scheduleText } from '../tools/proactive-outreach.js';
import { getLogger } from '../utils/safe-logger.js';
import { canSendOutreach, getPreferences } from './outreach-intelligence.js';
import { createPersistenceStore, type PersistenceStore } from './persistence/index.js';

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
// PERSISTENCE TYPES (serialized for Firestore)
// ============================================================================

interface PersistedGoal {
  id: string;
  userId: string;
  title: string;
  description?: string;
  targetDate?: string; // ISO string
  progress: number;
  status: 'active' | 'completed' | 'paused' | 'abandoned';
  milestones: Array<{
    id: string;
    title: string;
    targetProgress: number;
    reached: boolean;
    reachedAt?: string; // ISO string
    celebrationSent: boolean;
  }>;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

interface PersistedStreak {
  id: string;
  userId: string;
  habitName: string;
  currentStreak: number;
  longestStreak: number;
  lastCheckIn: string; // ISO string
  checkInFrequency: 'daily' | 'weekly';
  atRisk: boolean;
  riskAlertSent: boolean;
}

interface UserGoalsData {
  goals: PersistedGoal[];
}

interface UserStreaksData {
  streaks: PersistedStreak[];
}

// ============================================================================
// SERIALIZATION HELPERS
// ============================================================================

function serializeGoal(goal: Goal): PersistedGoal {
  return {
    ...goal,
    targetDate: goal.targetDate?.toISOString(),
    milestones: goal.milestones.map((m) => ({
      ...m,
      reachedAt: m.reachedAt?.toISOString(),
    })),
    createdAt: goal.createdAt.toISOString(),
    updatedAt: goal.updatedAt.toISOString(),
  };
}

function deserializeGoal(data: PersistedGoal): Goal {
  return {
    ...data,
    targetDate: data.targetDate ? new Date(data.targetDate) : undefined,
    milestones: data.milestones.map((m) => ({
      ...m,
      reachedAt: m.reachedAt ? new Date(m.reachedAt) : undefined,
    })),
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt),
  };
}

function serializeStreak(streak: Streak): PersistedStreak {
  return {
    ...streak,
    lastCheckIn: streak.lastCheckIn.toISOString(),
  };
}

function deserializeStreak(data: PersistedStreak): Streak {
  return {
    ...data,
    lastCheckIn: new Date(data.lastCheckIn),
  };
}

// ============================================================================
// STORAGE (in-memory cache backed by Firestore)
// ============================================================================

const goalStore = new Map<string, Goal[]>();
const streakStore = new Map<string, Streak[]>();
const loadedUsers = new Set<string>();

// Persistence stores
let goalPersistence: PersistenceStore<UserGoalsData> | null = null;
let streakPersistence: PersistenceStore<UserStreaksData> | null = null;

function getGoalPersistence(): PersistenceStore<UserGoalsData> {
  if (!goalPersistence) {
    goalPersistence = createPersistenceStore<UserGoalsData>({
      collection: 'goals_outreach',
      documentId: 'goals',
      syncIntervalMs: 3000,
    });
  }
  return goalPersistence;
}

function getStreakPersistence(): PersistenceStore<UserStreaksData> {
  if (!streakPersistence) {
    streakPersistence = createPersistenceStore<UserStreaksData>({
      collection: 'goals_outreach',
      documentId: 'streaks',
      syncIntervalMs: 3000,
    });
  }
  return streakPersistence;
}

/**
 * Load user's goals and streaks from persistence
 */
async function ensureUserLoaded(userId: string): Promise<void> {
  if (loadedUsers.has(userId)) return;

  try {
    // Load goals
    const goalsData = await getGoalPersistence().load(userId);
    if (goalsData?.goals) {
      goalStore.set(userId, goalsData.goals.map(deserializeGoal));
    }

    // Load streaks
    const streaksData = await getStreakPersistence().load(userId);
    if (streaksData?.streaks) {
      streakStore.set(userId, streaksData.streaks.map(deserializeStreak));
    }

    loadedUsers.add(userId);
    getLogger().debug({ userId }, 'Loaded goals and streaks from persistence');
  } catch (error) {
    getLogger().warn({ error, userId }, 'Failed to load goals/streaks from persistence');
    loadedUsers.add(userId); // Mark as loaded to avoid repeated failures
  }
}

/**
 * Persist goals for a user
 */
function persistGoals(userId: string): void {
  const goals = goalStore.get(userId) || [];
  getGoalPersistence().set(userId, {
    goals: goals.map(serializeGoal),
  });
}

/**
 * Persist streaks for a user
 */
function persistStreaks(userId: string): void {
  const streaks = streakStore.get(userId) || [];
  getStreakPersistence().set(userId, {
    streaks: streaks.map(serializeStreak),
  });
}

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

  // Ensure user data is loaded from persistence
  await ensureUserLoaded(userId);

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
  persistStreaks(userId);

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

  // Use preferences to determine optimal delivery time
  const now = new Date();
  const sendTime = getOptimalSendTime(now, prefs);

  const result = await scheduleText(userId, message, sendTime, 'Maya');

  if (result.success) {
    getLogger().info(
      {
        userId,
        habitName: streak.habitName,
        streak: streak.currentStreak,
        sendTime: sendTime.toISOString(),
      },
      '🎉 Streak celebration scheduled'
    );
  }

  return message;
}

/**
 * Get optimal send time based on user preferences
 */
function getOptimalSendTime(baseTime: Date, prefs: ReturnType<typeof getPreferences>): Date {
  const time = new Date(baseTime);
  const hour = time.getHours();

  // Check if current time is within preferred time windows
  const isPreferredTime =
    (prefs.preferredTimes.morning && hour >= 7 && hour < 11) ||
    (prefs.preferredTimes.afternoon && hour >= 11 && hour < 17) ||
    (prefs.preferredTimes.evening && hour >= 17 && hour < 21) ||
    (prefs.preferredTimes.night && (hour >= 21 || hour < 7));

  if (isPreferredTime) {
    return time;
  }

  // Check quiet hours
  if (prefs.quietHoursStart && prefs.quietHoursEnd) {
    const quietStart = parseInt(prefs.quietHoursStart.split(':')[0]);
    const quietEnd = parseInt(prefs.quietHoursEnd.split(':')[0]);

    if (hour >= quietStart || hour < quietEnd) {
      // Move to after quiet hours
      time.setHours(quietEnd, 0, 0, 0);
      if (time <= baseTime) {
        time.setDate(time.getDate() + 1);
      }
      return time;
    }
  }

  // Find next preferred window
  if (prefs.preferredTimes.morning && hour < 7) {
    time.setHours(8, 0, 0, 0); // Send at 8am
  } else if (prefs.preferredTimes.afternoon && hour < 11) {
    time.setHours(12, 0, 0, 0); // Send at noon
  } else if (prefs.preferredTimes.evening && hour < 17) {
    time.setHours(18, 0, 0, 0); // Send at 6pm
  } else {
    // Default to next morning
    time.setDate(time.getDate() + 1);
    time.setHours(9, 0, 0, 0);
  }

  return time;
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
    persistStreaks(userId);
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
export async function createGoal(params: {
  userId: string;
  title: string;
  description?: string;
  targetDate?: Date;
  milestones?: Array<{ title: string; targetProgress: number }>;
}): Promise<Goal> {
  // Ensure user data is loaded from persistence
  await ensureUserLoaded(params.userId);

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
  persistGoals(params.userId);

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
  // Ensure user data is loaded from persistence
  await ensureUserLoaded(userId);

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
    // For goal completion, send email as well as text for a more memorable celebration
    if (goal.progress >= 100) {
      // Goal completed - send celebratory email
      const emailResult = await scheduleEmail(
        userId,
        `🎊 You Did It! "${goal.title}" Complete!`,
        `Congratulations on completing your goal "${goal.title}"!\n\n` +
          `This achievement represents real dedication and effort. ` +
          `Take a moment to celebrate what you've accomplished.\n\n` +
          `- Maya\n\nP.S. What's your next goal? I'd love to help you crush that one too! 🚀`,
        new Date(),
        'Maya'
      );
      if (emailResult.success) {
        getLogger().info({ userId, goalId }, '📧 Goal completion email sent');
      }
    }

    // Send text message celebration
    const result = await scheduleText(userId, celebration, new Date(), 'Maya');

    if (result.success) {
      for (const m of milestonesReached) {
        m.celebrationSent = true;
      }
      getLogger().info({ userId, goalId, progress: goal.progress }, '🎉 Goal celebration sent');
    }
  }

  goalStore.set(userId, goals);
  persistGoals(userId);

  return { goal, milestonesReached, celebration };
}

/**
 * Get user's active goals
 */
export async function getActiveGoals(userId: string): Promise<Goal[]> {
  // Ensure user data is loaded from persistence
  await ensureUserLoaded(userId);
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
  let nudgesSent = 0;

  try {
    // Get engagement store to find users who haven't interacted recently
    const { getEngagementStore } = await import('./engagement-store.js');
    const store = await getEngagementStore();

    if (!store) {
      getLogger().warn('Engagement store not available for missed check-in detection');
      return 0;
    }

    // Get all engagement profiles (in production, this should be paginated/batched)
    // Note: This feature requires direct Firestore access - skip if not available
    const { getFirestoreStore } = await import('../memory/firestore-store.js');
    const firestoreStore = getFirestoreStore();

    if (!firestoreStore) {
      getLogger().warn('Firestore not available for missed check-in detection');
      return 0;
    }

    // Get Firestore instance from the store
    const { db } = firestoreStore as unknown as { db?: FirebaseFirestore.Firestore };
    if (!db) {
      getLogger().warn('Firestore DB not accessible for missed check-in detection');
      return 0;
    }

    const now = new Date();
    const cutoffDate = new Date(now.getTime() - maxDaysSinceContact * 24 * 60 * 60 * 1000);

    // Query users who haven't engaged recently
    const profilesRef = db.collection('engagement_profiles');
    const snapshot = await profilesRef
      .where('lastEngagementAt', '<', cutoffDate.toISOString())
      .limit(100) // Process in batches
      .get();

    for (const doc of snapshot.docs) {
      const profile = doc.data();
      const userId = doc.id;
      const lastEngagement = new Date(profile.lastEngagementAt);
      const daysSinceContact = Math.floor(
        (now.getTime() - lastEngagement.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Skip if they've been contacted very recently via outreach
      const activeGoals = goalStore.get(userId);
      if (!activeGoals || activeGoals.length === 0) {
        continue; // No goals to nudge about
      }

      // Send a gentle re-engagement nudge
      try {
        const { triggerOutreach } = await import('./outreach/index.js');
        const preferredPersona = (profile.preferences?.favoritePersona ||
          'ferni') as import('./agent-bus.js').AgentId;

        const nudgeMessage = generateMissedCheckInMessage(daysSinceContact, activeGoals[0]);

        // Use triggerOutreach instead of non-existent sendOutreachMessage
        triggerOutreach({
          type: 'thinking_of_you', // Best fit for re-engagement
          userId,
          priority: 'low',
          reason: nudgeMessage,
          suggestedPersona: preferredPersona,
        } as import('./outreach/decision-engine.js').OutreachTrigger);

        nudgesSent++;
        getLogger().info(
          { userId, daysSinceContact, goalCount: activeGoals.length },
          '📬 Sent missed check-in nudge'
        );
      } catch (error) {
        getLogger().warn({ error, userId }, 'Failed to send missed check-in nudge');
      }
    }
  } catch (error) {
    getLogger().error({ error }, 'Error in sendMissedCheckInNudges');
  }

  return nudgesSent;
}

/**
 * Generate a warm, non-pushy re-engagement message
 */
function generateMissedCheckInMessage(daysSinceContact: number, goal: Goal): string {
  const messages = [
    `Hey! Just thinking about you and your "${goal.title}" goal. No pressure - just wanted you to know I'm here if you want to chat! 💚`,
    `It's been a few days! How's everything going with "${goal.title}"? Would love to hear how you're doing.`,
    `Miss our chats! Whenever you're ready to catch up on "${goal.title}" or anything else, I'm here. 🌱`,
    `Hope you're doing well! Your "${goal.title}" goal crossed my mind. Drop in when you have a moment?`,
  ];

  // Pick based on days since contact (more gentle as time increases)
  const index = Math.min(daysSinceContact - 1, messages.length - 1);
  return messages[Math.max(0, index)];
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
// LIFECYCLE
// ============================================================================

/**
 * Flush all pending persistence writes
 */
export async function flushGoalOutreachPersistence(): Promise<void> {
  await Promise.all([getGoalPersistence().flush(), getStreakPersistence().flush()]);
  getLogger().info('Goal outreach persistence flushed');
}

/**
 * Shutdown the goal outreach service
 */
export async function shutdownGoalOutreach(): Promise<void> {
  stopGoalMonitoring();
  await flushGoalOutreachPersistence();
  // Clear state for clean restart
  loadedUsers.clear();
  goalStore.clear();
  streakStore.clear();
  getLogger().info('Goal outreach service shutdown complete');
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

  // Lifecycle
  flushGoalOutreachPersistence,
  shutdownGoalOutreach,
};

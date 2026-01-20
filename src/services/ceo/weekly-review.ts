/**
 * Weekly Review Service for CEO CLI
 *
 * Generates comprehensive weekly reviews aggregating data from:
 * - Goals progress (start vs end of week)
 * - Focus session summary
 * - Wins logged
 * - Business metrics trends
 *
 * Part of the Personal Productivity commands (ferni weekly).
 *
 * @module services/ceo/weekly-review
 */

import chalk from 'chalk';
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb, toSafeDate } from '../../utils/firestore-utils.js';
import { goalsService, type Goal } from './goals.js';
import { focusService, type FocusSession } from './focus.js';

const log = createLogger({ module: 'weekly-review' });

// ============================================================================
// TYPES
// ============================================================================

export interface GoalProgress {
  goal: Goal;
  startProgress: number;
  endProgress: number;
  change: number;
}

export interface TimeAllocation {
  deepWork: number; // hours
  meetings: number; // hours
  admin: number; // hours
}

export interface MetricsTrend {
  activeUsers: { current: number; previous: number; change: number };
  callQuality: { current: number; previous: number; change: number };
  revenue: { current: number; previous: number; change: number };
}

export interface FocusSummary {
  totalSessions: number;
  totalMinutes: number;
  completionRate: number; // 0-100
}

export interface Win {
  id: string;
  text: string;
  date: string;
  category?: string;
  createdAt: string;
}

export interface WeeklyReview {
  weekStart: Date;
  weekEnd: Date;
  goalsProgress: GoalProgress[];
  timeAllocation: TimeAllocation;
  wins: Win[];
  metrics: MetricsTrend;
  focusSummary: FocusSummary;
  recommendations: string[];
}

export interface WeeklyReviewService {
  generateReview: (userId: string, weekOffset?: number) => Promise<WeeklyReview>;
  formatForTerminal: (review: WeeklyReview) => string;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get the start of the week (Monday) for a given date.
 */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  // If Sunday (0), go back 6 days; otherwise go back (day - 1) days
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get the end of the week (Sunday) for a given date.
 */
function getWeekEnd(date: Date): Date {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

/**
 * Format a date as "Jan 13"
 */
function formatShortDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Create a progress bar with filled and empty blocks.
 */
function createProgressBar(percent: number, width = 10): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return chalk.green('\u2588'.repeat(filled)) + chalk.gray('\u2591'.repeat(empty));
}

/**
 * Format change with + or - sign and color.
 */
function formatChange(change: number, unit = '%'): string {
  if (change > 0) {
    return chalk.green(`+${change}${unit}`);
  } else if (change < 0) {
    return chalk.red(`${change}${unit}`);
  }
  return chalk.gray(`0${unit}`);
}

/**
 * Format hours nicely.
 */
function formatHours(hours: number): string {
  if (hours < 1) {
    return `${Math.round(hours * 60)}m`;
  }
  return `${Math.round(hours)}h`;
}

// ============================================================================
// DATA FETCHING
// ============================================================================

/**
 * Get wins from the CEO coaching storage for a date range.
 */
async function getWinsInRange(userId: string, start: Date, end: Date): Promise<Win[]> {
  const db = getFirestoreDb();
  if (!db) {
    log.debug({ userId }, 'Firestore not available for wins');
    return [];
  }

  try {
    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];

    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('ceo_wins')
      .where('date', '>=', startStr)
      .where('date', '<=', endStr)
      .orderBy('date', 'desc')
      .limit(50)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        text: data.text as string,
        date: data.date as string,
        category: data.category as string | undefined,
        createdAt: data.createdAt as string,
      };
    });
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get wins');
    return [];
  }
}

/**
 * Get focus sessions in a date range.
 */
async function getFocusSessionsInRange(
  userId: string,
  start: Date,
  end: Date
): Promise<FocusSession[]> {
  const db = getFirestoreDb();
  if (!db) {
    return [];
  }

  try {
    const snapshot = await db
      .collection('users')
      .doc(userId)
      .collection('focus_sessions')
      .where('startTime', '>=', start.toISOString())
      .where('startTime', '<=', end.toISOString())
      .orderBy('startTime', 'desc')
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId as string,
        startTime: toSafeDate(data.startTime),
        endTime: data.endTime ? toSafeDate(data.endTime) : undefined,
        plannedDuration: data.plannedDuration as number,
        actualDuration: data.actualDuration ? (data.actualDuration as number) : undefined,
        task: data.task ? (data.task as string) : undefined,
        interrupted: data.interrupted as boolean,
        calendarBlocked: data.calendarBlocked as boolean,
        createdAt: toSafeDate(data.createdAt),
      };
    });
  } catch (error) {
    const errorStr = String(error);
    if (errorStr.includes('FAILED_PRECONDITION') && errorStr.includes('index')) {
      log.debug({ userId }, 'Firestore index still building for focus sessions');
      return [];
    }
    log.error({ error: errorStr, userId }, 'Failed to get focus sessions');
    return [];
  }
}

/**
 * Get goal snapshots from start and end of week.
 * We compare current goal progress to approximate start-of-week state.
 */
async function getGoalsProgress(userId: string, weekStart: Date): Promise<GoalProgress[]> {
  try {
    // Get current goals
    const goals = await goalsService.getGoals(userId, 'active');

    // For each goal, estimate start-of-week progress
    // In a real system, we'd store historical snapshots.
    // For now, we estimate based on updatedAt timestamp
    return goals.map((goal) => {
      const endProgress = goal.progress;
      // Estimate: if goal was updated this week, assume some progress was made
      const wasUpdatedThisWeek = goal.updatedAt >= weekStart;
      const estimatedChange = wasUpdatedThisWeek ? Math.min(10, endProgress) : 0;
      const startProgress = Math.max(0, endProgress - estimatedChange);

      return {
        goal,
        startProgress,
        endProgress,
        change: endProgress - startProgress,
      };
    });
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get goals progress');
    return [];
  }
}

/**
 * Calculate time allocation from focus sessions.
 * Assumes focus sessions are "deep work" time.
 */
function calculateTimeAllocation(sessions: FocusSession[]): TimeAllocation {
  const completedSessions = sessions.filter((s) => s.endTime !== undefined);
  const deepWorkMinutes = completedSessions.reduce((sum, s) => sum + (s.actualDuration || 0), 0);
  const deepWorkHours = deepWorkMinutes / 60;

  // Placeholder values for meetings and admin until we have calendar integration
  // In a real implementation, these would come from calendar events
  const meetingHours = 0;
  const adminHours = 0;

  return {
    deepWork: Math.round(deepWorkHours * 10) / 10,
    meetings: meetingHours,
    admin: adminHours,
  };
}

/**
 * Calculate focus summary from sessions.
 */
function calculateFocusSummary(sessions: FocusSession[]): FocusSummary {
  const completedSessions = sessions.filter((s) => s.endTime !== undefined);
  const totalMinutes = completedSessions.reduce((sum, s) => sum + (s.actualDuration || 0), 0);
  const completedWithoutInterruption = completedSessions.filter((s) => !s.interrupted).length;
  const completionRate =
    completedSessions.length > 0
      ? Math.round((completedWithoutInterruption / completedSessions.length) * 100)
      : 0;

  return {
    totalSessions: completedSessions.length,
    totalMinutes,
    completionRate,
  };
}

/**
 * Get business metrics trends.
 * Placeholder implementation - in production, this would pull from analytics APIs.
 */
async function getMetricsTrends(_userId: string): Promise<MetricsTrend> {
  // Placeholder data - would integrate with actual metrics in production
  return {
    activeUsers: { current: 0, previous: 0, change: 0 },
    callQuality: { current: 0, previous: 0, change: 0 },
    revenue: { current: 0, previous: 0, change: 0 },
  };
}

/**
 * Generate AI recommendations based on patterns.
 */
function generateRecommendations(
  goalsProgress: GoalProgress[],
  focusSummary: FocusSummary,
  wins: Win[]
): string[] {
  const recommendations: string[] = [];

  // Focus session recommendations
  if (focusSummary.totalSessions === 0) {
    recommendations.push(
      'Try scheduling at least one focus session this week to make progress on your goals.'
    );
  } else if (focusSummary.completionRate < 70) {
    recommendations.push(
      'Your focus sessions have frequent interruptions. Consider blocking your calendar and silencing notifications.'
    );
  }

  // Goals recommendations
  const stagnantGoals = goalsProgress.filter((g) => g.change === 0 && g.endProgress < 100);
  if (stagnantGoals.length > 0) {
    const goalTitles = stagnantGoals
      .slice(0, 2)
      .map((g) => g.goal.title)
      .join(', ');
    recommendations.push(
      `Some goals need attention: ${goalTitles}. Consider breaking them into smaller milestones.`
    );
  }

  // Wins recommendations
  if (wins.length === 0) {
    recommendations.push("Don't forget to log your wins! Celebrating progress builds momentum.");
  } else if (wins.length >= 5) {
    recommendations.push(
      'Great week of wins! Consider sharing your progress with someone you trust.'
    );
  }

  // If no recommendations, add an encouraging one
  if (recommendations.length === 0) {
    recommendations.push(
      "You're on track! Keep up the momentum and stay consistent with your routines."
    );
  }

  return recommendations;
}

// ============================================================================
// MAIN SERVICE FUNCTIONS
// ============================================================================

/**
 * Generate a comprehensive weekly review.
 *
 * @param userId - The user ID
 * @param weekOffset - Number of weeks back (0 = current week, 1 = last week, etc.)
 */
async function generateReview(userId: string, weekOffset = 0): Promise<WeeklyReview> {
  log.info({ userId, weekOffset }, 'Generating weekly review');

  // Calculate the week range
  const now = new Date();
  const targetDate = new Date(now.getTime() - weekOffset * 7 * 24 * 60 * 60 * 1000);
  const weekStart = getWeekStart(targetDate);
  const weekEnd = getWeekEnd(targetDate);

  // Fetch all data in parallel
  const [wins, focusSessions, goalsProgress, metrics] = await Promise.all([
    getWinsInRange(userId, weekStart, weekEnd),
    getFocusSessionsInRange(userId, weekStart, weekEnd),
    getGoalsProgress(userId, weekStart),
    getMetricsTrends(userId),
  ]);

  // Calculate summaries
  const timeAllocation = calculateTimeAllocation(focusSessions);
  const focusSummary = calculateFocusSummary(focusSessions);
  const recommendations = generateRecommendations(goalsProgress, focusSummary, wins);

  const review: WeeklyReview = {
    weekStart,
    weekEnd,
    goalsProgress,
    timeAllocation,
    wins,
    metrics,
    focusSummary,
    recommendations,
  };

  log.info(
    {
      userId,
      weekStart: weekStart.toISOString(),
      goalsCount: goalsProgress.length,
      winsCount: wins.length,
      focusSessions: focusSummary.totalSessions,
    },
    'Weekly review generated'
  );

  return review;
}

/**
 * Format a weekly review for terminal output with colors and progress bars.
 */
function formatForTerminal(review: WeeklyReview): string {
  const lines: string[] = [];
  const divider = chalk.gray('\u2500'.repeat(60));

  // Header
  const dateRange = `${formatShortDate(review.weekStart)} - ${formatShortDate(review.weekEnd)}, ${review.weekStart.getFullYear()}`;
  lines.push('');
  lines.push(chalk.bold.cyan(`\u{1F4CA} WEEKLY REVIEW (${dateRange})`));
  lines.push(divider);

  // Goals Progress
  lines.push('');
  lines.push(chalk.bold('\u{1F3AF} GOALS PROGRESS'));
  if (review.goalsProgress.length === 0) {
    lines.push(chalk.gray('   No active goals. Use `ferni goals add` to create one.'));
  } else {
    for (const gp of review.goalsProgress) {
      const title = gp.goal.title.length > 22 ? `${gp.goal.title.slice(0, 22)}...` : gp.goal.title;
      const progressBar = createProgressBar(gp.endProgress);
      const changeStr = gp.change !== 0 ? ` (${formatChange(gp.change)})` : '';
      lines.push(`   ${title.padEnd(25)} ${progressBar} ${gp.endProgress}%${changeStr}`);
    }
  }

  // Time Allocation
  lines.push('');
  lines.push(chalk.bold('\u23F1\uFE0F  TIME ALLOCATION'));
  const deepWorkTarget = 15; // hours
  const deepWorkBar = createProgressBar(
    Math.min(100, (review.timeAllocation.deepWork / deepWorkTarget) * 100)
  );
  lines.push(
    `   Deep Work:    ${deepWorkBar} ${formatHours(review.timeAllocation.deepWork)} ${chalk.gray(`(target: ${formatHours(deepWorkTarget)})`)}`
  );
  if (review.timeAllocation.meetings > 0) {
    lines.push(`   Meetings:     ${formatHours(review.timeAllocation.meetings)}`);
  }
  if (review.timeAllocation.admin > 0) {
    lines.push(`   Admin:        ${formatHours(review.timeAllocation.admin)}`);
  }

  // Focus Summary
  lines.push('');
  lines.push(chalk.bold('\u{1F9D8} FOCUS SESSIONS'));
  if (review.focusSummary.totalSessions === 0) {
    lines.push(chalk.gray('   No focus sessions this week.'));
  } else {
    const totalHours = Math.round((review.focusSummary.totalMinutes / 60) * 10) / 10;
    lines.push(`   Sessions:     ${review.focusSummary.totalSessions}`);
    lines.push(`   Total Time:   ${totalHours}h (${review.focusSummary.totalMinutes}m)`);
    lines.push(`   Completion:   ${review.focusSummary.completionRate}%`);
  }

  // Wins
  lines.push('');
  lines.push(chalk.bold('\u{1F3C6} WINS THIS WEEK'));
  if (review.wins.length === 0) {
    lines.push(chalk.gray('   No wins logged. Use `ferni wins` to celebrate your achievements!'));
  } else {
    for (const win of review.wins.slice(0, 5)) {
      const text = win.text.length > 50 ? `${win.text.slice(0, 50)}...` : win.text;
      lines.push(`   ${chalk.green('\u2022')} ${text}`);
    }
    if (review.wins.length > 5) {
      lines.push(chalk.gray(`   ... and ${review.wins.length - 5} more`));
    }
  }

  // Metrics (only show if we have data)
  const hasMetrics =
    review.metrics.activeUsers.current > 0 ||
    review.metrics.callQuality.current > 0 ||
    review.metrics.revenue.current > 0;

  if (hasMetrics) {
    lines.push('');
    lines.push(chalk.bold('\u{1F4C8} METRICS TREND'));
    if (review.metrics.activeUsers.current > 0) {
      lines.push(
        `   Active Users:  ${review.metrics.activeUsers.current} ${formatChange(review.metrics.activeUsers.change)} ${review.metrics.activeUsers.change > 0 ? '\u2191' : review.metrics.activeUsers.change < 0 ? '\u2193' : ''}`
      );
    }
    if (review.metrics.callQuality.current > 0) {
      lines.push(
        `   Call Quality:  ${review.metrics.callQuality.current}% ${chalk.gray('(stable)')}`
      );
    }
    if (review.metrics.revenue.current > 0) {
      lines.push(
        `   Revenue:       $${review.metrics.revenue.current.toLocaleString()} ${formatChange(review.metrics.revenue.change)}`
      );
    }
  }

  // Recommendations
  lines.push('');
  lines.push(chalk.bold('\u{1F4A1} RECOMMENDATIONS'));
  for (const rec of review.recommendations) {
    lines.push(`   ${chalk.yellow('\u2022')} ${rec}`);
  }

  lines.push('');
  lines.push(divider);
  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const weeklyReviewService: WeeklyReviewService = {
  generateReview,
  formatForTerminal,
};

// Also export individual functions for convenience
export { generateReview, formatForTerminal };

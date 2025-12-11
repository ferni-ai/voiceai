/**
 * Goal Trajectory Alerts
 *
 * > "At your current pace, you'll hit your savings goal 3 weeks late."
 *
 * Projects goal completion dates based on current progress rate
 * and suggests course corrections when off track.
 *
 * Features:
 * - Progress rate calculation
 * - Completion date projection
 * - Course correction suggestions
 * - Milestone predictions
 *
 * @module PredictiveInsights/GoalTrajectory
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { CourseCorrection } from './types.js';

const log = createLogger({ module: 'GoalTrajectory' });

// ============================================================================
// TYPES
// ============================================================================

export interface GoalTrajectory {
  userId: string;
  goalId: string;
  goalName: string;

  /** Current progress (0-100) */
  currentProgress: number;

  /** Target progress by now */
  targetProgress: number;

  /** Original deadline */
  originalDeadline: Date;

  /** Projected completion date at current pace */
  projectedCompletion: Date;

  /** Days ahead (+) or behind (-) schedule */
  daysOff: number;

  /** Is the goal on track? */
  onTrack: boolean;

  /** Suggested course correction */
  courseCorrection?: CourseCorrection;

  /** Human-friendly message */
  message: string;

  /** Actionable suggestion */
  suggestion: string;

  /** Confidence in projection (0-1) */
  confidence: number;

  /** Should surface to user */
  shouldSurface: boolean;
}

interface GoalProgress {
  goalId: string;
  goalName: string;
  goalType: 'savings' | 'habit' | 'project' | 'health' | 'learning' | 'other';
  targetValue: number;
  currentValue: number;
  unit: string;
  deadline: Date;
  createdAt: Date;
  progressHistory: Array<{
    date: Date;
    value: number;
  }>;
}

// ============================================================================
// STORAGE
// ============================================================================

const userGoals = new Map<string, Map<string, GoalProgress>>();

// ============================================================================
// MAIN PROJECTION FUNCTION
// ============================================================================

/**
 * Project trajectories for all user goals
 */
export async function projectGoalTrajectory(userId: string): Promise<GoalTrajectory[]> {
  const goals = userGoals.get(userId);
  if (!goals || goals.size === 0) {
    // Try to load from external sources
    await loadGoalsFromSources(userId);
  }

  const loadedGoals = userGoals.get(userId);
  if (!loadedGoals || loadedGoals.size === 0) {
    return [];
  }

  const trajectories: GoalTrajectory[] = [];

  for (const [goalId, goal] of loadedGoals) {
    const trajectory = projectSingleGoal(userId, goal);
    if (trajectory) {
      trajectories.push(trajectory);
    }
  }

  return trajectories;
}

function projectSingleGoal(userId: string, goal: GoalProgress): GoalTrajectory | null {
  const now = new Date();

  // Skip if deadline passed
  if (goal.deadline < now) {
    return null;
  }

  // Calculate progress percentage
  const currentProgress = (goal.currentValue / goal.targetValue) * 100;

  // Calculate expected progress by now
  const totalDuration = goal.deadline.getTime() - goal.createdAt.getTime();
  const elapsed = now.getTime() - goal.createdAt.getTime();
  const expectedProgress = Math.min(100, (elapsed / totalDuration) * 100);

  // Calculate progress rate
  const progressRate = calculateProgressRate(goal);

  // Project completion
  const remaining = goal.targetValue - goal.currentValue;
  const projectedCompletion = projectCompletionDate(goal, progressRate, now);

  // Calculate days off
  const daysOff = Math.round(
    (goal.deadline.getTime() - projectedCompletion.getTime()) / (24 * 60 * 60 * 1000)
  );

  const onTrack = daysOff >= -7; // Within a week of deadline is "on track"

  // Generate course correction if needed
  const courseCorrection = !onTrack
    ? generateCourseCorrection(goal, daysOff, progressRate)
    : undefined;

  // Generate message
  const { message, suggestion } = generateGoalMessage(
    goal,
    currentProgress,
    projectedCompletion,
    daysOff,
    onTrack,
    courseCorrection
  );

  // Calculate confidence
  const confidence = calculateConfidence(goal.progressHistory.length, progressRate);

  // Should surface if significantly off track or about to hit milestone
  const shouldSurface =
    (!onTrack && Math.abs(daysOff) > 7) ||
    (currentProgress >= 90 && currentProgress < 100) ||
    (currentProgress >= 45 && currentProgress < 55); // Halfway point

  return {
    userId,
    goalId: goal.goalId,
    goalName: goal.goalName,
    currentProgress,
    targetProgress: expectedProgress,
    originalDeadline: goal.deadline,
    projectedCompletion,
    daysOff,
    onTrack,
    courseCorrection,
    message,
    suggestion,
    confidence,
    shouldSurface,
  };
}

// ============================================================================
// CALCULATION FUNCTIONS
// ============================================================================

function calculateProgressRate(goal: GoalProgress): number {
  const history = goal.progressHistory;
  if (history.length < 2) {
    // Not enough data, assume linear progress
    const totalDays =
      (goal.deadline.getTime() - goal.createdAt.getTime()) / (24 * 60 * 60 * 1000);
    return goal.targetValue / totalDays;
  }

  // Use recent history (last 14 days or last 5 entries)
  const recentHistory = history.slice(-Math.min(5, history.length));

  if (recentHistory.length < 2) {
    return goal.targetValue / 30; // Default to monthly rate
  }

  const firstEntry = recentHistory[0];
  const lastEntry = recentHistory[recentHistory.length - 1];

  const valueDiff = lastEntry.value - firstEntry.value;
  const daysDiff =
    (lastEntry.date.getTime() - firstEntry.date.getTime()) / (24 * 60 * 60 * 1000);

  if (daysDiff === 0) return 0;

  return valueDiff / daysDiff; // Units per day
}

function projectCompletionDate(
  goal: GoalProgress,
  progressRate: number,
  now: Date
): Date {
  if (progressRate <= 0) {
    // No progress or negative - project far future
    return new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  }

  const remaining = goal.targetValue - goal.currentValue;
  const daysToComplete = remaining / progressRate;

  return new Date(now.getTime() + daysToComplete * 24 * 60 * 60 * 1000);
}

function generateCourseCorrection(
  goal: GoalProgress,
  daysOff: number,
  currentRate: number
): CourseCorrection {
  const daysRemaining =
    (goal.deadline.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
  const remaining = goal.targetValue - goal.currentValue;
  const requiredRate = remaining / daysRemaining;

  const rateIncrease = requiredRate - currentRate;
  const percentIncrease = currentRate > 0 ? (rateIncrease / currentRate) * 100 : 100;

  // Generate type-specific suggestions
  let action = '';
  let impact = '';
  let effort: 'low' | 'medium' | 'high' = 'medium';

  switch (goal.goalType) {
    case 'savings':
      const weeklyIncrease = rateIncrease * 7;
      action = `Increase weekly savings by $${weeklyIncrease.toFixed(0)}`;
      impact = `Gets you back on track in ${Math.abs(daysOff)} days`;
      effort = percentIncrease < 20 ? 'low' : percentIncrease < 50 ? 'medium' : 'high';
      break;

    case 'habit':
      action = `Add ${Math.ceil(rateIncrease)} more sessions per week`;
      impact = `Catches you up within ${Math.ceil(Math.abs(daysOff) / 7)} weeks`;
      effort = 'medium';
      break;

    case 'health':
      action = `Increase daily effort by ${percentIncrease.toFixed(0)}%`;
      impact = `Projected completion: ${goal.deadline.toLocaleDateString()}`;
      effort = percentIncrease < 25 ? 'low' : 'high';
      break;

    default:
      action = `Increase pace by ${percentIncrease.toFixed(0)}%`;
      impact = `Will get you back on schedule`;
      effort = percentIncrease < 30 ? 'low' : percentIncrease < 60 ? 'medium' : 'high';
  }

  return {
    action,
    impact,
    effort,
    timeToResult: `${Math.ceil(Math.abs(daysOff))} days`,
  };
}

function generateGoalMessage(
  goal: GoalProgress,
  currentProgress: number,
  projectedCompletion: Date,
  daysOff: number,
  onTrack: boolean,
  courseCorrection?: CourseCorrection
): { message: string; suggestion: string } {
  let message = '';
  let suggestion = '';

  if (onTrack && daysOff > 7) {
    // Ahead of schedule
    message = `You're ${daysOff} days ahead on "${goal.goalName}"! Current progress: ${currentProgress.toFixed(0)}%.`;
    suggestion = "Keep this momentum going, or consider raising your target.";
  } else if (onTrack) {
    // On track
    message = `"${goal.goalName}" is on track. You're at ${currentProgress.toFixed(0)}% with ${Math.ceil((goal.deadline.getTime() - Date.now()) / (24 * 60 * 60 * 1000))} days to go.`;
    suggestion = "You're doing great. Stay consistent.";
  } else {
    // Behind schedule
    const weeksLate = Math.ceil(Math.abs(daysOff) / 7);
    message = `At your current pace, you'll hit "${goal.goalName}" ${weeksLate} week${weeksLate > 1 ? 's' : ''} late.`;

    if (courseCorrection) {
      suggestion = `${courseCorrection.action} and you're back on track.`;
    } else {
      suggestion = "Want to adjust your timeline or find ways to catch up?";
    }
  }

  return { message, suggestion };
}

function calculateConfidence(historyLength: number, progressRate: number): number {
  let confidence = 0.3;

  if (historyLength >= 14) confidence += 0.3;
  else if (historyLength >= 7) confidence += 0.2;
  else if (historyLength >= 3) confidence += 0.1;

  // Steady progress increases confidence
  if (progressRate > 0) confidence += 0.2;

  return Math.min(confidence, 0.9);
}

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadGoalsFromSources(userId: string): Promise<void> {
  try {
    // Try to load from coaching goals
    const { getActiveGoals } = await import('../coaching/progress-metrics.js');
    const coachingGoals = await getActiveGoals(userId);

    if (coachingGoals && coachingGoals.length > 0) {
      const goalsMap = new Map<string, GoalProgress>();

      for (const goal of coachingGoals) {
        goalsMap.set(goal.id, {
          goalId: goal.id,
          goalName: goal.name || goal.description || 'Goal',
          goalType: mapGoalType(goal.category),
          targetValue: goal.targetValue || 100,
          currentValue: goal.currentValue || goal.progress || 0,
          unit: goal.unit || 'units',
          deadline: goal.deadline ? new Date(goal.deadline) : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          createdAt: goal.createdAt ? new Date(goal.createdAt) : new Date(),
          progressHistory: goal.history || [],
        });
      }

      userGoals.set(userId, goalsMap);
    }
  } catch (error) {
    log.debug({ error, userId }, 'Could not load goals from coaching');
  }

  try {
    // Try to load from financial goals
    const { getFinancialStore } = await import('../financial-store.js');
    const store = await getFinancialStore();
    const savingsGoals = await store.getSavingsGoals(userId);

    if (savingsGoals && savingsGoals.length > 0) {
      let goalsMap = userGoals.get(userId) || new Map<string, GoalProgress>();

      for (const goal of savingsGoals) {
        goalsMap.set(`savings_${goal.id}`, {
          goalId: `savings_${goal.id}`,
          goalName: goal.name,
          goalType: 'savings',
          targetValue: goal.targetAmount,
          currentValue: goal.currentAmount,
          unit: 'dollars',
          deadline: new Date(goal.targetDate),
          createdAt: new Date(goal.createdAt),
          progressHistory: goal.contributions?.map((c: { date: string; amount: number; runningTotal: number }) => ({
            date: new Date(c.date),
            value: c.runningTotal,
          })) || [],
        });
      }

      userGoals.set(userId, goalsMap);
    }
  } catch (error) {
    log.debug({ error, userId }, 'Could not load financial goals');
  }
}

function mapGoalType(category?: string): GoalProgress['goalType'] {
  if (!category) return 'other';

  const lower = category.toLowerCase();
  if (lower.includes('saving') || lower.includes('financ') || lower.includes('money')) {
    return 'savings';
  }
  if (lower.includes('habit') || lower.includes('routine')) {
    return 'habit';
  }
  if (lower.includes('health') || lower.includes('fitness') || lower.includes('weight')) {
    return 'health';
  }
  if (lower.includes('learn') || lower.includes('skill') || lower.includes('education')) {
    return 'learning';
  }
  if (lower.includes('project') || lower.includes('work')) {
    return 'project';
  }
  return 'other';
}

// ============================================================================
// DATA COLLECTION
// ============================================================================

/**
 * Record goal progress update
 */
export function recordGoalProgress(
  userId: string,
  goalId: string,
  currentValue: number
): void {
  const goals = userGoals.get(userId);
  if (!goals) return;

  const goal = goals.get(goalId);
  if (!goal) return;

  goal.currentValue = currentValue;
  goal.progressHistory.push({
    date: new Date(),
    value: currentValue,
  });

  log.debug({ userId, goalId, currentValue }, 'Recorded goal progress');
}

/**
 * Add a new goal to track
 */
export function addGoalToTrack(
  userId: string,
  goal: Omit<GoalProgress, 'progressHistory'>
): void {
  let goals = userGoals.get(userId);
  if (!goals) {
    goals = new Map();
    userGoals.set(userId, goals);
  }

  goals.set(goal.goalId, {
    ...goal,
    progressHistory: [{ date: new Date(), value: goal.currentValue }],
  });

  log.debug({ userId, goalId: goal.goalId }, 'Added goal to tracking');
}

/**
 * Clear goal data for a user
 */
export function clearGoalData(userId: string): void {
  userGoals.delete(userId);
}

export default {
  projectGoalTrajectory,
  recordGoalProgress,
  addGoalToTrack,
  clearGoalData,
};

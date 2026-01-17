/**
 * Task Metrics Service
 *
 * Provides comprehensive metrics and analytics for task performance.
 * Helps identify:
 * - Which tasks are most effective
 * - When tasks underperform
 * - Patterns in task usage
 * - Areas for improvement
 *
 * @module TaskMetricsService
 */

import { createLogger } from '../utils/safe-logger.js';
import { TASK_WISDOM } from './task-manager.js';
import { getTaskHistory } from './task-persistence.js';

const log = createLogger({ module: 'TaskMetricsService' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Comprehensive metrics for a single task type
 */
export interface TaskTypeMetrics {
  taskType: string;
  taskName: string;
  category: string;
  priority: number;
  totalExecutions: number;
  successfulExecutions: number;
  effectivenessRate: number;
  averageTurnsToComplete: number;
  averageDistressImprovement: number;
  medianDistressImprovement: number;
  triggerBreakdown: {
    automatic: number;
    manual: number;
    scheduled: number;
  };
  timeDistribution: {
    hour: Record<number, number>; // Hour of day -> count
    dayOfWeek: Record<number, number>; // Day of week -> count
  };
  trend: 'improving' | 'stable' | 'declining' | 'insufficient_data';
}

/**
 * Overall task system health metrics
 */
export interface SystemHealthMetrics {
  totalTasksExecuted: number;
  totalTasksToday: number;
  totalTasksThisWeek: number;
  overallEffectivenessRate: number;
  averageDistressImprovement: number;
  tasksByCategory: Record<string, number>;
  topPerformingTasks: Array<{ taskType: string; effectivenessRate: number }>;
  underperformingTasks: Array<{ taskType: string; effectivenessRate: number }>;
  unusedTasks: string[];
  healthScore: number; // 0-100
}

/**
 * Real-time metrics for monitoring
 */
export interface RealtimeMetrics {
  activeTasks: number;
  tasksCompletedLastHour: number;
  averageCompletionTimeMs: number;
  currentEffectivenessRate: number;
  alertsActive: number;
}

/**
 * Alert for task system issues
 */
export interface TaskAlert {
  type: 'low_effectiveness' | 'high_failure_rate' | 'unused_task' | 'anomaly';
  severity: 'info' | 'warning' | 'critical';
  taskType?: string;
  message: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}

// ============================================================================
// IN-MEMORY METRICS CACHE
// ============================================================================

interface MetricsCache {
  systemHealth?: { data: SystemHealthMetrics; timestamp: number };
  taskTypeMetrics: Map<string, { data: TaskTypeMetrics; timestamp: number }>;
  alerts: TaskAlert[];
}

const cache: MetricsCache = {
  taskTypeMetrics: new Map(),
  alerts: [],
};

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function isCacheValid(timestamp: number): boolean {
  return Date.now() - timestamp < CACHE_TTL_MS;
}

// ============================================================================
// TASK TYPE METRICS
// ============================================================================

/**
 * Get comprehensive metrics for a specific task type
 */
export async function getTaskTypeMetrics(taskType: string): Promise<TaskTypeMetrics | null> {
  // Check cache
  const cached = cache.taskTypeMetrics.get(taskType);
  if (cached && isCacheValid(cached.timestamp)) {
    return cached.data;
  }

  // Get task wisdom for metadata
  const wisdom = TASK_WISDOM.find((w) => w.id === taskType);
  if (!wisdom) {
    log.warn({ taskType }, 'Unknown task type requested for metrics');
    return null;
  }

  // Get historical data
  const tasks = await getTaskHistory({ taskType, limit: 500 });

  if (tasks.length === 0) {
    return {
      taskType,
      taskName: wisdom.name,
      category: wisdom.category,
      priority: wisdom.priority,
      totalExecutions: 0,
      successfulExecutions: 0,
      effectivenessRate: 0,
      averageTurnsToComplete: 0,
      averageDistressImprovement: 0,
      medianDistressImprovement: 0,
      triggerBreakdown: { automatic: 0, manual: 0, scheduled: 0 },
      timeDistribution: { hour: {}, dayOfWeek: {} },
      trend: 'insufficient_data',
    };
  }

  // Calculate metrics
  const successfulTasks = tasks.filter((t) => t.wasEffective);
  const distressImprovements = tasks.map((t) => t.distressImprovement).sort((a, b) => a - b);

  const triggerBreakdown = { automatic: 0, manual: 0, scheduled: 0 };
  const hourDistribution: Record<number, number> = {};
  const dayDistribution: Record<number, number> = {};

  for (const task of tasks) {
    // Trigger breakdown
    const trigger = task.triggerType || 'automatic';
    triggerBreakdown[trigger]++;

    // Time distribution
    const hour = task.startedAt.getHours();
    const day = task.startedAt.getDay();
    hourDistribution[hour] = (hourDistribution[hour] || 0) + 1;
    dayDistribution[day] = (dayDistribution[day] || 0) + 1;
  }

  // Calculate trend (compare last 30 days vs previous 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const recentTasks = tasks.filter((t) => t.startedAt >= thirtyDaysAgo);
  const olderTasks = tasks.filter(
    (t) => t.startedAt >= sixtyDaysAgo && t.startedAt < thirtyDaysAgo
  );

  let trend: TaskTypeMetrics['trend'] = 'insufficient_data';
  if (recentTasks.length >= 5 && olderTasks.length >= 5) {
    const recentRate = recentTasks.filter((t) => t.wasEffective).length / recentTasks.length;
    const olderRate = olderTasks.filter((t) => t.wasEffective).length / olderTasks.length;

    if (recentRate > olderRate + 0.1) trend = 'improving';
    else if (recentRate < olderRate - 0.1) trend = 'declining';
    else trend = 'stable';
  }

  const metrics: TaskTypeMetrics = {
    taskType,
    taskName: wisdom.name,
    category: wisdom.category,
    priority: wisdom.priority,
    totalExecutions: tasks.length,
    successfulExecutions: successfulTasks.length,
    effectivenessRate: successfulTasks.length / tasks.length,
    averageTurnsToComplete: tasks.reduce((sum, t) => sum + t.turnsToComplete, 0) / tasks.length,
    averageDistressImprovement:
      tasks.reduce((sum, t) => sum + t.distressImprovement, 0) / tasks.length,
    medianDistressImprovement: distressImprovements[Math.floor(distressImprovements.length / 2)],
    triggerBreakdown,
    timeDistribution: {
      hour: hourDistribution,
      dayOfWeek: dayDistribution,
    },
    trend,
  };

  // Cache result
  cache.taskTypeMetrics.set(taskType, { data: metrics, timestamp: Date.now() });

  return metrics;
}

/**
 * Get metrics for all task types
 */
export async function getAllTaskTypeMetrics(): Promise<TaskTypeMetrics[]> {
  const metrics: TaskTypeMetrics[] = [];

  for (const wisdom of TASK_WISDOM) {
    const taskMetrics = await getTaskTypeMetrics(wisdom.id);
    if (taskMetrics) {
      metrics.push(taskMetrics);
    }
  }

  return metrics;
}

// ============================================================================
// SYSTEM HEALTH METRICS
// ============================================================================

/**
 * Get overall system health metrics
 */
export async function getSystemHealthMetrics(): Promise<SystemHealthMetrics> {
  // Check cache
  if (cache.systemHealth && isCacheValid(cache.systemHealth.timestamp)) {
    return cache.systemHealth.data;
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  // Get all recent tasks
  const allTasks = await getTaskHistory({ limit: 1000 });
  const todayTasks = allTasks.filter((t) => t.startedAt >= today);
  const weekTasks = allTasks.filter((t) => t.startedAt >= weekAgo);

  // Calculate category distribution
  const tasksByCategory: Record<string, number> = {};
  for (const task of allTasks) {
    tasksByCategory[task.category] = (tasksByCategory[task.category] || 0) + 1;
  }

  // Get effectiveness by task type
  const typeStats = new Map<string, { effective: number; total: number }>();
  for (const task of allTasks) {
    const stats = typeStats.get(task.taskType) || { effective: 0, total: 0 };
    stats.total++;
    if (task.wasEffective) stats.effective++;
    typeStats.set(task.taskType, stats);
  }

  // Find top and bottom performers
  const typeRates = Array.from(typeStats.entries())
    .filter(([_, stats]) => stats.total >= 3) // Minimum sample size
    .map(([taskType, stats]) => ({
      taskType,
      effectivenessRate: stats.effective / stats.total,
    }));

  const topPerforming = [...typeRates]
    .sort((a, b) => b.effectivenessRate - a.effectivenessRate)
    .slice(0, 5);

  const underperforming = [...typeRates]
    .filter((t) => t.effectivenessRate < 0.5)
    .sort((a, b) => a.effectivenessRate - b.effectivenessRate)
    .slice(0, 5);

  // Find unused tasks
  const usedTaskTypes = new Set(allTasks.map((t) => t.taskType));
  const unusedTasks = TASK_WISDOM.filter((w) => !usedTaskTypes.has(w.id)).map((w) => w.id);

  // Calculate overall effectiveness
  const effectiveTasks = allTasks.filter((t) => t.wasEffective);
  const overallEffectivenessRate =
    allTasks.length > 0 ? effectiveTasks.length / allTasks.length : 0;

  // Calculate average distress improvement
  const averageDistressImprovement =
    allTasks.length > 0
      ? allTasks.reduce((sum, t) => sum + t.distressImprovement, 0) / allTasks.length
      : 0;

  // Calculate health score (0-100)
  let healthScore = 70; // Base score

  // Adjust for effectiveness
  if (overallEffectivenessRate >= 0.7) healthScore += 15;
  else if (overallEffectivenessRate >= 0.5) healthScore += 5;
  else if (overallEffectivenessRate < 0.3) healthScore -= 20;

  // Adjust for underperforming tasks
  healthScore -= underperforming.length * 3;

  // Adjust for unused tasks (minor penalty)
  healthScore -= Math.min(unusedTasks.length, 5);

  // Clamp to 0-100
  healthScore = Math.max(0, Math.min(100, healthScore));

  const metrics: SystemHealthMetrics = {
    totalTasksExecuted: allTasks.length,
    totalTasksToday: todayTasks.length,
    totalTasksThisWeek: weekTasks.length,
    overallEffectivenessRate,
    averageDistressImprovement,
    tasksByCategory,
    topPerformingTasks: topPerforming,
    underperformingTasks: underperforming,
    unusedTasks,
    healthScore,
  };

  // Cache result
  cache.systemHealth = { data: metrics, timestamp: Date.now() };

  return metrics;
}

// ============================================================================
// ALERTS
// ============================================================================

/**
 * Check for task system alerts
 */
export async function checkForAlerts(): Promise<TaskAlert[]> {
  const alerts: TaskAlert[] = [];
  const systemHealth = await getSystemHealthMetrics();

  // Alert for low overall effectiveness
  if (systemHealth.overallEffectivenessRate < 0.4) {
    alerts.push({
      type: 'low_effectiveness',
      severity: 'critical',
      message: `Overall task effectiveness is critically low at ${(systemHealth.overallEffectivenessRate * 100).toFixed(1)}%`,
      timestamp: new Date(),
      data: { effectivenessRate: systemHealth.overallEffectivenessRate },
    });
  } else if (systemHealth.overallEffectivenessRate < 0.6) {
    alerts.push({
      type: 'low_effectiveness',
      severity: 'warning',
      message: `Overall task effectiveness is below target at ${(systemHealth.overallEffectivenessRate * 100).toFixed(1)}%`,
      timestamp: new Date(),
      data: { effectivenessRate: systemHealth.overallEffectivenessRate },
    });
  }

  // Alert for specific underperforming tasks
  for (const task of systemHealth.underperformingTasks) {
    if (task.effectivenessRate < 0.3) {
      alerts.push({
        type: 'high_failure_rate',
        severity: 'warning',
        taskType: task.taskType,
        message: `Task "${task.taskType}" has a very low effectiveness rate of ${(task.effectivenessRate * 100).toFixed(1)}%`,
        timestamp: new Date(),
        data: { effectivenessRate: task.effectivenessRate },
      });
    }
  }

  // Alert for unused tasks (info level)
  if (systemHealth.unusedTasks.length > 10) {
    alerts.push({
      type: 'unused_task',
      severity: 'info',
      message: `${systemHealth.unusedTasks.length} tasks have never been triggered`,
      timestamp: new Date(),
      data: { unusedTasks: systemHealth.unusedTasks.slice(0, 10) },
    });
  }

  // Update cache
  cache.alerts = alerts;

  return alerts;
}

/**
 * Get current active alerts
 */
export function getActiveAlerts(): TaskAlert[] {
  return cache.alerts;
}

// ============================================================================
// REPORTING
// ============================================================================

/**
 * Generate a comprehensive task report
 */
export async function generateTaskReport(): Promise<{
  generatedAt: Date;
  systemHealth: SystemHealthMetrics;
  taskMetrics: TaskTypeMetrics[];
  alerts: TaskAlert[];
  recommendations: string[];
}> {
  const systemHealth = await getSystemHealthMetrics();
  const taskMetrics = await getAllTaskTypeMetrics();
  const alerts = await checkForAlerts();

  // Generate recommendations
  const recommendations: string[] = [];

  if (systemHealth.overallEffectivenessRate < 0.6) {
    recommendations.push(
      'Consider reviewing task trigger conditions - many tasks may be firing inappropriately.'
    );
  }

  for (const task of systemHealth.underperformingTasks) {
    const metrics = taskMetrics.find((m) => m.taskType === task.taskType);
    if (metrics && metrics.trend === 'declining') {
      recommendations.push(
        `Task "${task.taskType}" is declining in effectiveness. Review recent changes to triggers or instructions.`
      );
    }
  }

  if (systemHealth.unusedTasks.length > 5) {
    recommendations.push(
      `${systemHealth.unusedTasks.length} tasks are unused. Consider adjusting trigger conditions or removing unused tasks.`
    );
  }

  // Check for category imbalances
  const categoryTotal = Object.values(systemHealth.tasksByCategory).reduce((a, b) => a + b, 0);
  const supportPct = (systemHealth.tasksByCategory['support'] || 0) / categoryTotal;
  if (supportPct < 0.1) {
    recommendations.push(
      'Support tasks are underutilized. Users may not be getting enough emotional support.'
    );
  }

  return {
    generatedAt: new Date(),
    systemHealth,
    taskMetrics,
    alerts,
    recommendations,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const taskMetricsService = {
  getTaskTypeMetrics,
  getAllTaskTypeMetrics,
  getSystemHealthMetrics,
  checkForAlerts,
  getActiveAlerts,
  generateTaskReport,
};

export default taskMetricsService;

/**
 * Scheduler Service
 *
 * Unified interface for scheduled workflow execution.
 * Abstracts between:
 * - Cloud Scheduler + Pub/Sub (production)
 * - Local in-process scheduler (development/fallback)
 *
 * @module services/workflows/scheduler/scheduler-service
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { getWorkflowData, saveWorkflowData, type Workflow } from '../../stores/workflow-store.js';

const log = createLogger({ module: 'scheduler-service' });

// ============================================================================
// TYPES
// ============================================================================

export interface ScheduleConfig {
  workflowId: string;
  userId: string;
  schedule: string; // Cron expression
  timezone: string;
  enabled: boolean;
  payload?: Record<string, unknown>;
}

export interface ScheduleResult {
  success: boolean;
  scheduleId?: string;
  error?: string;
  nextRun?: Date;
}

export interface ScheduleInfo {
  workflowId: string;
  schedule: string;
  timezone: string;
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
}

// ============================================================================
// CRON PARSER
// ============================================================================

/**
 * Simple cron parser for common patterns
 */
export function parseCronExpression(cron: string): {
  valid: boolean;
  nextRun?: Date;
  description?: string;
  error?: string;
} {
  const parts = cron.trim().split(/\s+/);
  
  if (parts.length < 5 || parts.length > 6) {
    return { valid: false, error: 'Cron expression must have 5-6 fields' };
  }

  // Calculate next run time based on cron
  const now = new Date();
  const nextRun = calculateNextRun(parts, now);
  
  return {
    valid: true,
    nextRun,
    description: describeCron(parts),
  };
}

/**
 * Calculate next run time from cron parts
 */
function calculateNextRun(parts: string[], from: Date): Date {
  const [minuteSpec, hourSpec, daySpec, monthSpec, dowSpec] = parts;
  
  const next = new Date(from);
  next.setSeconds(0);
  next.setMilliseconds(0);
  
  // Handle common patterns
  if (minuteSpec.startsWith('*/')) {
    // Every X minutes
    const interval = parseInt(minuteSpec.slice(2)) || 5;
    const currentMinute = next.getMinutes();
    const nextMinute = Math.ceil((currentMinute + 1) / interval) * interval;
    if (nextMinute >= 60) {
      next.setHours(next.getHours() + 1);
      next.setMinutes(nextMinute % 60);
    } else {
      next.setMinutes(nextMinute);
    }
    return next;
  }
  
  if (hourSpec.startsWith('*/')) {
    // Every X hours
    const interval = parseInt(hourSpec.slice(2)) || 1;
    const minute = minuteSpec === '*' ? 0 : parseInt(minuteSpec);
    next.setMinutes(minute);
    const currentHour = next.getHours();
    const nextHour = Math.ceil((currentHour + 1) / interval) * interval;
    if (nextHour >= 24) {
      next.setDate(next.getDate() + 1);
      next.setHours(nextHour % 24);
    } else {
      next.setHours(nextHour);
    }
    return next;
  }
  
  // Specific time
  const minute = minuteSpec === '*' ? 0 : parseInt(minuteSpec);
  const hour = hourSpec === '*' ? from.getHours() : parseInt(hourSpec);
  
  next.setMinutes(minute);
  next.setHours(hour);
  
  // If we've passed this time today, move to tomorrow
  if (next <= from) {
    next.setDate(next.getDate() + 1);
  }
  
  // Handle day of week
  if (dowSpec !== '*' && dowSpec !== '?') {
    const targetDow = parseDayOfWeek(dowSpec);
    if (targetDow.length > 0) {
      while (!targetDow.includes(next.getDay())) {
        next.setDate(next.getDate() + 1);
      }
    }
  }
  
  return next;
}

/**
 * Parse day of week specification
 */
function parseDayOfWeek(spec: string): number[] {
  if (spec === '1-5') return [1, 2, 3, 4, 5]; // Weekdays
  if (spec === '0,6') return [0, 6]; // Weekends
  const num = parseInt(spec);
  if (!isNaN(num)) return [num];
  return [];
}

/**
 * Generate human-readable cron description
 */
function describeCron(parts: string[]): string {
  const [minute, hour, day, month, dow] = parts;
  
  let desc = '';
  
  // Time
  if (minute.startsWith('*/')) {
    desc = `Every ${minute.slice(2)} minutes`;
  } else if (hour.startsWith('*/')) {
    desc = `Every ${hour.slice(2)} hours`;
  } else if (minute !== '*' && hour !== '*') {
    desc = `At ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  } else if (minute !== '*') {
    desc = `At minute ${minute}`;
  } else {
    desc = 'Every minute';
  }
  
  // Day of week
  if (dow !== '*' && dow !== '?') {
    if (dow === '1-5') {
      desc += ' on weekdays';
    } else if (dow === '0,6') {
      desc += ' on weekends';
    } else {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayNum = parseInt(dow);
      if (!isNaN(dayNum) && days[dayNum]) {
        desc += ` on ${days[dayNum]}`;
      }
    }
  }
  
  // Day of month
  if (day !== '*' && day !== '?') {
    desc += ` on day ${day}`;
  }
  
  return desc;
}

// ============================================================================
// SCHEDULER SERVICE CLASS
// ============================================================================

export class SchedulerService {
  private activeTimers: Map<string, NodeJS.Timeout> = new Map();
  private callbacks: Map<string, () => Promise<void>> = new Map();

  constructor() {
    log.info('Scheduler service initialized');
  }

  // ==========================================================================
  // SCHEDULE MANAGEMENT
  // ==========================================================================

  /**
   * Schedule a workflow
   */
  async scheduleWorkflow(config: ScheduleConfig): Promise<ScheduleResult> {
    // Validate cron expression
    const parsed = parseCronExpression(config.schedule);
    if (!parsed.valid) {
      return { success: false, error: parsed.error };
    }

    // Store schedule in workflow data
    const data = await getWorkflowData(config.userId);
    const workflow = data.workflows.find((w: Workflow) => w.id === config.workflowId);
    
    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    // Update workflow with schedule info
    workflow.updatedAt = new Date().toISOString();
    await saveWorkflowData(config.userId, data);

    // Set up local timer if enabled
    if (config.enabled && parsed.nextRun) {
      this.setupTimer(config, parsed.nextRun);
    }

    log.info(
      { workflowId: config.workflowId, nextRun: parsed.nextRun?.toISOString() },
      'Workflow scheduled'
    );

    return {
      success: true,
      scheduleId: `schedule-${config.workflowId}`,
      nextRun: parsed.nextRun,
    };
  }

  /**
   * Update a workflow schedule
   */
  async updateSchedule(
    userId: string,
    workflowId: string,
    updates: Partial<ScheduleConfig>
  ): Promise<ScheduleResult> {
    const timerId = `${userId}:${workflowId}`;
    
    // Clear existing timer
    const existingTimer = this.activeTimers.get(timerId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.activeTimers.delete(timerId);
    }

    // Get current workflow
    const data = await getWorkflowData(userId);
    const workflow = data.workflows.find((w: Workflow) => w.id === workflowId);
    
    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    // If schedule provided, validate and set up new timer
    if (updates.schedule) {
      const parsed = parseCronExpression(updates.schedule);
      if (!parsed.valid) {
        return { success: false, error: parsed.error };
      }

      if (updates.enabled !== false && parsed.nextRun) {
        this.setupTimer({
          workflowId,
          userId,
          schedule: updates.schedule,
          timezone: updates.timezone || 'UTC',
          enabled: true,
        }, parsed.nextRun);
      }

      return { success: true, nextRun: parsed.nextRun };
    }

    return { success: true };
  }

  /**
   * Cancel a workflow schedule
   */
  async cancelSchedule(userId: string, workflowId: string): Promise<ScheduleResult> {
    const timerId = `${userId}:${workflowId}`;
    
    const existingTimer = this.activeTimers.get(timerId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.activeTimers.delete(timerId);
    }

    this.callbacks.delete(timerId);

    log.info({ workflowId }, 'Schedule cancelled');
    return { success: true };
  }

  /**
   * Pause a schedule
   */
  async pauseSchedule(userId: string, workflowId: string): Promise<ScheduleResult> {
    const timerId = `${userId}:${workflowId}`;
    
    const existingTimer = this.activeTimers.get(timerId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.activeTimers.delete(timerId);
    }

    log.info({ workflowId }, 'Schedule paused');
    return { success: true };
  }

  /**
   * Resume a paused schedule
   */
  async resumeSchedule(userId: string, workflowId: string): Promise<ScheduleResult> {
    const data = await getWorkflowData(userId);
    const workflow = data.workflows.find((w: Workflow) => w.id === workflowId);
    
    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    // Check if the trigger is a time trigger
    const trigger = workflow.trigger;
    if (!trigger || trigger.type !== 'time') {
      return { success: false, error: 'No time trigger found' };
    }

    const schedule = trigger.schedule;
    if (!schedule) {
      return { success: false, error: 'No schedule configured' };
    }

    const parsed = parseCronExpression(schedule);
    if (!parsed.valid || !parsed.nextRun) {
      return { success: false, error: 'Invalid schedule' };
    }

    this.setupTimer({
      workflowId,
      userId,
      schedule,
      timezone: trigger.timezone || 'UTC',
      enabled: true,
    }, parsed.nextRun);

    log.info({ workflowId, nextRun: parsed.nextRun }, 'Schedule resumed');
    return { success: true, nextRun: parsed.nextRun };
  }

  /**
   * Get schedule info
   */
  async getScheduleInfo(userId: string, workflowId: string): Promise<ScheduleInfo | null> {
    const data = await getWorkflowData(userId);
    const workflow = data.workflows.find((w: Workflow) => w.id === workflowId);
    
    if (!workflow) {
      return null;
    }

    const trigger = workflow.trigger;
    if (!trigger || trigger.type !== 'time') {
      return null;
    }

    const schedule = trigger.schedule || '';
    const parsed = parseCronExpression(schedule);

    return {
      workflowId,
      schedule,
      timezone: trigger.timezone || 'UTC',
      enabled: workflow.status === 'active',
      lastRun: workflow.lastRunAt ? new Date(workflow.lastRunAt) : undefined,
      nextRun: parsed.nextRun,
    };
  }

  // ==========================================================================
  // CALLBACK REGISTRATION
  // ==========================================================================

  /**
   * Register a callback for when a workflow should run
   */
  registerCallback(userId: string, workflowId: string, callback: () => Promise<void>): void {
    const id = `${userId}:${workflowId}`;
    this.callbacks.set(id, callback);
  }

  /**
   * Unregister a callback
   */
  unregisterCallback(userId: string, workflowId: string): void {
    const id = `${userId}:${workflowId}`;
    this.callbacks.delete(id);
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  /**
   * Set up a timer for the next run
   */
  private setupTimer(config: ScheduleConfig, nextRun: Date): void {
    const timerId = `${config.userId}:${config.workflowId}`;
    const delay = nextRun.getTime() - Date.now();

    if (delay < 0) {
      // Already passed, calculate next occurrence
      const parsed = parseCronExpression(config.schedule);
      if (parsed.nextRun) {
        this.setupTimer(config, parsed.nextRun);
      }
      return;
    }

    // Max timeout is ~24.8 days (2^31-1 ms), so for longer delays we need to re-schedule
    const maxDelay = 2147483647;
    const effectiveDelay = Math.min(delay, maxDelay);

    const timer = setTimeout(async () => {
      if (effectiveDelay < delay) {
        // Re-schedule for remaining time
        this.setupTimer(config, nextRun);
        return;
      }

      // Execute the callback
      const callback = this.callbacks.get(timerId);
      if (callback) {
        try {
          await callback();
          log.debug({ workflowId: config.workflowId }, 'Scheduled workflow executed');
        } catch (error) {
          log.error({ error: String(error), workflowId: config.workflowId }, 'Scheduled workflow failed');
        }
      }

      // Schedule next run
      const parsed = parseCronExpression(config.schedule);
      if (parsed.nextRun) {
        this.setupTimer(config, parsed.nextRun);
      }
    }, effectiveDelay);

    this.activeTimers.set(timerId, timer);
  }

  /**
   * Get all active schedules
   */
  getActiveScheduleCount(): number {
    return this.activeTimers.size;
  }

  /**
   * Clear all timers (for cleanup)
   */
  clearAll(): void {
    for (const timer of this.activeTimers.values()) {
      clearTimeout(timer);
    }
    this.activeTimers.clear();
    this.callbacks.clear();
    log.info('All schedules cleared');
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let schedulerServiceInstance: SchedulerService | null = null;

export function getSchedulerService(): SchedulerService {
  if (!schedulerServiceInstance) {
    schedulerServiceInstance = new SchedulerService();
  }
  return schedulerServiceInstance;
}

export function resetSchedulerService(): void {
  if (schedulerServiceInstance) {
    schedulerServiceInstance.clearAll();
  }
  schedulerServiceInstance = null;
}

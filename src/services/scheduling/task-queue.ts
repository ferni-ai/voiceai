/**
 * Task Queue Service
 *
 * Handles background task operations:
 * - Task creation and management
 * - Priority-based queue processing
 * - Task execution with retry logic
 * - Scheduled jobs
 *
 * Part of the background tasks system, split for maintainability.
 */

import { EventEmitter } from 'events';

import { clearNamedInterval, registerInterval } from '../../utils/interval-manager.js';
import { getLogger } from '../../utils/safe-logger.js';
import { MAX_RETRIES } from '../../config/resilience-config.js';

import type {
  BackgroundData,
  BackgroundTask,
  PendingAction,
  ScheduledJob,
  TaskHandler,
  TaskPriority,
  TaskStatus,
} from './background-types.js';

// ============================================================================
// TASK HANDLERS REGISTRY
// ============================================================================

const taskHandlers = new Map<string, TaskHandler>();

/**
 * Register a handler for a task type
 */
export function registerTaskHandler(taskType: string, handler: TaskHandler): void {
  taskHandlers.set(taskType, handler);
}

/**
 * Get a registered task handler
 */
export function getTaskHandler(taskType: string): TaskHandler | undefined {
  return taskHandlers.get(taskType);
}

// ============================================================================
// TASK QUEUE SERVICE
// ============================================================================

export class TaskQueueService extends EventEmitter {
  private taskQueue: BackgroundTask[] = [];
  private isProcessing = false;
  private processorInterval: string | null = null;

  constructor(
    private getUserData: (userId: string) => Promise<BackgroundData>,
    private markDirty: (userId: string) => void
  ) {
    super();
  }

  // ============================================================================
  // TASK OPERATIONS
  // ============================================================================

  /**
   * Create a new background task
   */
  async createTask(params: {
    userId: string;
    type: string;
    description: string;
    parameters?: Record<string, unknown>;
    priority?: TaskPriority;
    scheduledFor?: Date;
    createdBy?: string;
    workflowId?: string;
  }): Promise<BackgroundTask> {
    const task: BackgroundTask = {
      id: `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      userId: params.userId,
      type: params.type,
      description: params.description,
      parameters: params.parameters ?? {},
      priority: params.priority ?? 'medium',
      scheduledFor: params.scheduledFor,
      retryCount: 0,
      maxRetries: MAX_RETRIES,
      status: 'pending',
      createdBy: params.createdBy ?? 'system',
      parentWorkflowId: params.workflowId,
      createdAt: new Date(),
    };

    // Add to queue
    this.taskQueue.push(task);

    // Store in user data
    const userData = await this.getUserData(params.userId);
    userData.tasks.push(task);
    this.markDirty(params.userId);

    getLogger().info({ taskId: task.id, type: task.type }, '📋 Background task created');

    this.emit('task_created', task);
    return task;
  }

  /**
   * Get task by ID from all user data
   */
  getTaskFromData(
    allData: Map<string, BackgroundData>,
    taskId: string
  ): BackgroundTask | undefined {
    for (const data of allData.values()) {
      const task = data.tasks.find((t) => t.id === taskId);
      if (task) return task;
    }
    return undefined;
  }

  /**
   * Update task status
   */
  updateTaskStatus(
    task: BackgroundTask,
    status: TaskStatus,
    result?: unknown,
    error?: string
  ): void {
    task.status = status;
    if (result !== undefined) task.result = result;
    if (error) task.error = error;
    if (status === 'running') task.startedAt = new Date();
    if (status === 'completed' || status === 'failed') task.completedAt = new Date();

    this.markDirty(task.userId);
    this.emit('task_updated', task);
  }

  /**
   * Get user's tasks
   */
  async getUserTasks(userId: string, status?: TaskStatus): Promise<BackgroundTask[]> {
    const userData = await this.getUserData(userId);
    if (status) {
      return userData.tasks.filter((t) => t.status === status);
    }
    return userData.tasks;
  }

  // ============================================================================
  // SCHEDULED JOBS
  // ============================================================================

  /**
   * Create a scheduled job
   */
  async createScheduledJob(params: {
    userId: string;
    name: string;
    schedule: 'daily' | 'weekly' | 'monthly' | 'custom';
    customCron?: string;
    timezone?: string;
    jobType: string;
    parameters?: Record<string, unknown>;
  }): Promise<ScheduledJob> {
    const job: ScheduledJob = {
      id: `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      userId: params.userId,
      name: params.name,
      schedule: params.schedule,
      customCron: params.customCron,
      timezone: params.timezone ?? 'Etc/UTC',
      jobType: params.jobType,
      parameters: params.parameters ?? {},
      isActive: true,
      runCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      nextRunAt: this.calculateNextRun(params.schedule),
    };

    const userData = await this.getUserData(params.userId);
    userData.scheduledJobs.push(job);
    this.markDirty(params.userId);

    getLogger().info(
      { jobId: job.id, name: job.name, schedule: job.schedule },
      '⏰ Scheduled job created'
    );

    this.emit('scheduled_job_created', job);
    return job;
  }

  // ============================================================================
  // PENDING ACTIONS
  // ============================================================================

  /**
   * Create a pending action (waiting for external event)
   */
  async createPendingAction(params: {
    userId: string;
    waitingFor: string;
    description: string;
    triggerType: 'webhook' | 'polling' | 'time' | 'manual';
    triggerConfig: Record<string, unknown>;
    actionType: string;
    actionParameters?: Record<string, unknown>;
    notifyUser?: boolean;
    notifyMethod?: 'sms' | 'email' | 'push' | 'next_conversation';
    expiresAt?: Date;
    createdBy?: string;
  }): Promise<PendingAction> {
    const action: PendingAction = {
      id: `pending_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      userId: params.userId,
      waitingFor: params.waitingFor,
      description: params.description,
      triggerType: params.triggerType,
      triggerConfig: params.triggerConfig,
      actionType: params.actionType,
      actionParameters: params.actionParameters ?? {},
      notifyUser: params.notifyUser ?? true,
      notifyMethod: params.notifyMethod,
      status: 'watching',
      expiresAt: params.expiresAt,
      createdBy: params.createdBy ?? 'system',
      createdAt: new Date(),
    };

    const userData = await this.getUserData(params.userId);
    userData.pendingActions.push(action);
    this.markDirty(params.userId);

    getLogger().info(
      { actionId: action.id, waitingFor: action.waitingFor },
      '👀 Pending action created'
    );

    this.emit('pending_action_created', action);
    return action;
  }

  /**
   * Trigger a pending action
   */
  async triggerPendingAction(
    allData: Map<string, BackgroundData>,
    actionId: string,
    triggerData?: unknown
  ): Promise<void> {
    let foundAction: PendingAction | undefined;
    let userId: string | undefined;

    for (const [uid, data] of allData.entries()) {
      const action = data.pendingActions.find((a) => a.id === actionId);
      if (action) {
        foundAction = action;
        userId = uid;
        break;
      }
    }

    if (!foundAction || !userId) return;

    foundAction.status = 'triggered';
    foundAction.triggeredAt = new Date();

    try {
      await this.createTask({
        userId,
        type: foundAction.actionType,
        description: `Triggered: ${foundAction.description}`,
        parameters: { ...foundAction.actionParameters, triggerData },
        priority: 'high',
        createdBy: foundAction.createdBy,
      });

      foundAction.status = 'completed';
      foundAction.completedAt = new Date();

      if (foundAction.notifyUser) {
        this.emit('notify_user', {
          userId,
          method: foundAction.notifyMethod ?? 'next_conversation',
          message: `Your pending action "${foundAction.description}" has been triggered!`,
          data: { actionId, triggerData },
        });
      }
    } catch (error) {
      getLogger().error({ error, actionId }, 'Failed to execute pending action');
    }

    this.markDirty(userId);
    this.emit('pending_action_triggered', foundAction);
  }

  // ============================================================================
  // TASK EXECUTION
  // ============================================================================

  /**
   * Execute a single task
   */
  async executeTask(task: BackgroundTask): Promise<unknown> {
    const handler = taskHandlers.get(task.type);
    if (!handler) {
      throw new Error(`No handler registered for task type: ${task.type}`);
    }

    task.status = 'running';
    task.startedAt = new Date();
    this.emit('task_started', task);

    try {
      const result = await handler(task);
      task.status = 'completed';
      task.result = result;
      task.completedAt = new Date();
      this.emit('task_completed', task);
      return result;
    } catch (error) {
      task.retryCount++;
      if (task.retryCount < task.maxRetries) {
        task.status = 'pending';
        task.error = `Attempt ${task.retryCount} failed: ${error}`;
        this.taskQueue.push(task);
      } else {
        task.status = 'failed';
        task.error = String(error);
        task.completedAt = new Date();
        this.emit('task_failed', task);
      }
      throw error;
    }
  }

  // ============================================================================
  // QUEUE PROCESSING
  // ============================================================================

  /**
   * Start the task queue processor
   */
  startProcessor(): void {
    const processQueue = async () => {
      if (this.isProcessing || this.taskQueue.length === 0) return;

      this.isProcessing = true;

      // Sort by priority
      this.taskQueue.sort((a, b) => {
        const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });

      // Process tasks that are ready
      const now = new Date();
      const readyTasks = this.taskQueue.filter(
        (t) => t.status === 'pending' && (!t.scheduledFor || t.scheduledFor <= now)
      );

      for (const task of readyTasks.slice(0, 5)) {
        try {
          await this.executeTask(task);
        } catch {
          // Error already handled in executeTask
        }

        // Remove from queue
        const index = this.taskQueue.indexOf(task);
        if (index >= 0) this.taskQueue.splice(index, 1);
      }

      this.isProcessing = false;
    };

    this.processorInterval = 'task-queue-processor';
    registerInterval(this.processorInterval, () => void processQueue(), 10000);
  }

  /**
   * Stop the task queue processor
   */
  stopProcessor(): void {
    if (this.processorInterval) {
      clearNamedInterval(this.processorInterval);
      this.processorInterval = null;
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private calculateNextRun(schedule: string): Date {
    const now = new Date();

    switch (schedule) {
      case 'daily':
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
      case 'weekly':
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      case 'monthly': {
        const next = new Date(now);
        next.setMonth(next.getMonth() + 1);
        return next;
      }
      default:
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    }
  }
}

// ============================================================================
// BUILT-IN TASK HANDLERS
// ============================================================================

// Register some basic handlers
registerTaskHandler('send_sms', async (task) => {
  const { sendSMS } = await import('../communication-service.js');
  const { to, message } = task.parameters as { to: string; message: string };
  return sendSMS(to, message);
});

registerTaskHandler('send_email', async (task) => {
  const { sendEmail } = await import('../communication-service.js');
  const { to, subject, body } = task.parameters as { to: string; subject: string; body: string };
  return sendEmail(to, subject, body);
});

registerTaskHandler('daily_briefing', async (task) => {
  return { briefingScheduled: true, userId: task.userId };
});

registerTaskHandler('notify_user', async (task) => {
  const { message, method } = task.parameters as { message: string; method?: string };
  try {
    getLogger().info({ userId: task.userId, message, method }, 'User notification triggered');
  } catch {
    // Logger not available in test environment
  }
  return { notified: true, message };
});

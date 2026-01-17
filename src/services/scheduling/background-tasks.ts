/**
 * Background Tasks & Workflow System
 *
 * Unified coordinator for async operations, multi-step workflows,
 * and scheduled jobs that run outside of active conversations.
 *
 * Features:
 * - Task Queue: Async operations with status tracking
 * - Workflows: Multi-step processes with state machine
 * - Pending Actions: Events waiting on external triggers
 * - Scheduled Jobs: Recurring tasks (daily digest, check-ins)
 * - Delegation Tracking: Tasks handed off between personas
 *
 * This file orchestrates the modular services:
 * - TaskQueueService: Task creation, queue processing, scheduled jobs
 * - WorkflowEngine: Multi-step workflow execution
 * - DelegationService: Inter-persona task handoffs
 *
 * Persistence: Stored with user profile in Firestore
 */

import { EventEmitter } from 'events';

import { getDefaultStore } from '../../memory/index.js';
import type { UserProfile } from '../../types/user-profile.js';
import { clearNamedInterval, registerInterval } from '../../utils/interval-manager.js';
import { getLogger } from '../../utils/safe-logger.js';

import type {
  BackgroundData,
  BackgroundTask,
  Delegation,
  PendingAction,
  ScheduledJob,
  TaskPriority,
  TaskStatus,
  Workflow,
  WorkflowStep,
} from './background-types.js';
import { DelegationService } from './delegation-service.js';
import { TaskQueueService, registerTaskHandler } from './task-queue.js';
import { WorkflowEngine } from './workflow-engine.js';

// Re-export types for backward compatibility
export type {
  BackgroundData,
  BackgroundTask,
  Delegation,
  PendingAction,
  ScheduledJob,
  TaskPriority,
  TaskStatus,
  Workflow,
  WorkflowStep,
};

// Re-export registerTaskHandler for external use
export { registerTaskHandler };

// ============================================================================
// BACKGROUND TASK SERVICE (Coordinator)
// ============================================================================

class BackgroundTaskService extends EventEmitter {
  private data = new Map<string, BackgroundData>();
  private checkInterval: NodeJS.Timeout | null = null;
  private initialized = false;

  // Modular services
  private taskQueue: TaskQueueService;
  private workflowEngine: WorkflowEngine;
  private delegationService: DelegationService;

  constructor() {
    super();

    // Initialize modular services with shared state accessors
    const getUserData = this.getUserData.bind(this);
    const markDirty = this.markDirty.bind(this);

    this.taskQueue = new TaskQueueService(getUserData, markDirty);
    this.workflowEngine = new WorkflowEngine(getUserData, markDirty, this.taskQueue);
    this.delegationService = new DelegationService(getUserData, markDirty);

    // Forward events from sub-services
    this.forwardEvents(this.taskQueue);
    this.forwardEvents(this.workflowEngine);
    this.forwardEvents(this.delegationService);
  }

  private forwardEvents(emitter: EventEmitter): void {
    const events = [
      'task_created',
      'task_updated',
      'task_started',
      'task_completed',
      'task_failed',
      'workflow_created',
      'workflow_started',
      'workflow_paused',
      'workflow_completed',
      'delegation_created',
      'delegation_updated',
      'pending_action_created',
      'pending_action_triggered',
      'pending_action_expired',
      'scheduled_job_created',
      'notify_user',
    ];

    for (const event of events) {
      emitter.on(event, (...args: unknown[]) => this.emit(event, ...args));
    }
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    getLogger().info('🔄 Background task service initializing');

    // Start the task processor
    this.taskQueue.startProcessor();

    // Start the scheduler checker
    this.startScheduleChecker();
  }

  async shutdown(): Promise<void> {
    getLogger().info('🔄 Background task service shutting down');

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Stop task processor
    this.taskQueue.stopProcessor();

    // Clear the schedule checker interval
    clearNamedInterval('background-schedule-checker');

    // Persist all pending data
    for (const [userId, data] of this.data.entries()) {
      await this.persistUserData(userId, data);
    }

    this.initialized = false;
    getLogger().info('✅ Background task service shutdown complete');
  }

  // ============================================================================
  // TASK OPERATIONS (delegated to TaskQueueService)
  // ============================================================================

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
    return this.taskQueue.createTask(params);
  }

  getTask(taskId: string): BackgroundTask | undefined {
    return this.taskQueue.getTaskFromData(this.data, taskId);
  }

  async updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    result?: unknown,
    error?: string
  ): Promise<void> {
    const task = this.getTask(taskId);
    if (task) {
      this.taskQueue.updateTaskStatus(task, status, result, error);
    }
  }

  async getUserTasks(userId: string, status?: TaskStatus): Promise<BackgroundTask[]> {
    return this.taskQueue.getUserTasks(userId, status);
  }

  // ============================================================================
  // WORKFLOW OPERATIONS (delegated to WorkflowEngine)
  // ============================================================================

  async createWorkflow(params: {
    userId: string;
    name: string;
    description: string;
    steps: Array<Omit<WorkflowStep, 'status' | 'id'>>;
    createdBy?: string;
    context?: Record<string, unknown>;
  }): Promise<Workflow> {
    return this.workflowEngine.createWorkflow(params);
  }

  async runWorkflow(workflowId: string): Promise<void> {
    return this.workflowEngine.runWorkflow(this.data, workflowId);
  }

  pauseWorkflow(workflowId: string, reason: string, requiresInput?: string): void {
    this.workflowEngine.pauseWorkflow(this.data, workflowId, reason, requiresInput);
  }

  getWorkflow(workflowId: string): Workflow | undefined {
    return this.workflowEngine.getWorkflowFromData(this.data, workflowId);
  }

  async getUserWorkflows(userId: string, status?: Workflow['status']): Promise<Workflow[]> {
    return this.workflowEngine.getUserWorkflows(userId, status);
  }

  // ============================================================================
  // PENDING ACTIONS (delegated to TaskQueueService)
  // ============================================================================

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
    return this.taskQueue.createPendingAction(params);
  }

  async triggerPendingAction(actionId: string, triggerData?: unknown): Promise<void> {
    return this.taskQueue.triggerPendingAction(this.data, actionId, triggerData);
  }

  // ============================================================================
  // SCHEDULED JOBS (delegated to TaskQueueService)
  // ============================================================================

  async createScheduledJob(params: {
    userId: string;
    name: string;
    schedule: 'daily' | 'weekly' | 'monthly' | 'custom';
    customCron?: string;
    timezone?: string;
    jobType: string;
    parameters?: Record<string, unknown>;
  }): Promise<ScheduledJob> {
    return this.taskQueue.createScheduledJob(params);
  }

  // ============================================================================
  // DELEGATIONS (delegated to DelegationService)
  // ============================================================================

  async createDelegation(params: {
    userId: string;
    taskDescription: string;
    context: Record<string, unknown>;
    fromPersona: string;
    toPersona: string;
    originalRequest: string;
  }): Promise<Delegation> {
    return this.delegationService.createDelegation(params);
  }

  async updateDelegation(
    delegationId: string,
    update: {
      status?: Delegation['status'];
      message?: string;
      from?: string;
      outcome?: string;
    }
  ): Promise<void> {
    this.delegationService.updateDelegation(this.data, delegationId, update);
  }

  async getUserDelegations(
    userId: string,
    filter?: {
      status?: Delegation['status'];
      fromPersona?: string;
      toPersona?: string;
    }
  ): Promise<Delegation[]> {
    return this.delegationService.getUserDelegations(userId, filter);
  }

  // ============================================================================
  // INTERNAL STATE MANAGEMENT
  // ============================================================================

  private async getUserData(userId: string): Promise<BackgroundData> {
    if (this.data.has(userId)) {
      return this.data.get(userId)!;
    }

    // Try to load from storage
    const store = getDefaultStore();
    const profile = await store.getProfile(userId);

    const backgroundData: BackgroundData = (
      profile as UserProfile & { backgroundData?: BackgroundData }
    )?.backgroundData ?? {
      userId,
      tasks: [],
      workflows: [],
      pendingActions: [],
      scheduledJobs: [],
      delegations: [],
      lastUpdated: new Date(),
    };

    this.data.set(userId, backgroundData);
    return backgroundData;
  }

  private markDirty(userId: string): void {
    const userData = this.data.get(userId);
    if (userData) {
      userData.lastUpdated = new Date();
    }

    // Debounced persist
    this.schedulePersist(userId);
  }

  private persistTimers = new Map<string, NodeJS.Timeout>();

  private schedulePersist(userId: string): void {
    const existing = this.persistTimers.get(userId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      const userData = this.data.get(userId);
      if (userData) {
        void this.persistUserData(userId, userData);
      }
      this.persistTimers.delete(userId);
    }, 5000);

    this.persistTimers.set(userId, timer);
  }

  private async persistUserData(userId: string, data: BackgroundData): Promise<void> {
    try {
      const store = getDefaultStore();
      const profile = await store.getProfile(userId);
      if (profile) {
        (profile as UserProfile & { backgroundData?: BackgroundData }).backgroundData = data;
        await store.saveProfile(profile);
        getLogger().debug({ userId }, 'Persisted background data');
      }
    } catch (error) {
      getLogger().warn({ error, userId }, 'Failed to persist background data');
    }
  }

  // ============================================================================
  // SCHEDULE CHECKER & CLEANUP
  // ============================================================================

  /**
   * Clean up old completed/failed/cancelled items to prevent memory leaks
   */
  cleanupOldTasks(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): number {
    const cutoffTime = Date.now() - maxAgeMs;
    let cleanedCount = 0;
    const finishedStatuses: TaskStatus[] = ['completed', 'failed', 'cancelled'];

    for (const [userId, userData] of this.data.entries()) {
      // Clean up old tasks
      const origTaskCount = userData.tasks.length;
      userData.tasks = userData.tasks.filter((task) => {
        const isFinished = finishedStatuses.includes(task.status);
        const completedTime = task.completedAt?.getTime() ?? 0;
        return !(isFinished && completedTime > 0 && completedTime < cutoffTime);
      });
      cleanedCount += origTaskCount - userData.tasks.length;

      // Clean up old workflows
      const origWorkflowCount = userData.workflows.length;
      userData.workflows = userData.workflows.filter((workflow) => {
        const isFinished = workflow.status === 'completed' || workflow.status === 'failed';
        const completedTime = workflow.completedAt?.getTime() ?? 0;
        return !(isFinished && completedTime > 0 && completedTime < cutoffTime);
      });
      cleanedCount += origWorkflowCount - userData.workflows.length;

      // Clean up old pending actions
      const origActionCount = userData.pendingActions.length;
      userData.pendingActions = userData.pendingActions.filter((action) => {
        const isFinished =
          action.status === 'completed' ||
          action.status === 'expired' ||
          action.status === 'cancelled';
        const completedTime = action.completedAt?.getTime() ?? 0;
        return !(isFinished && completedTime > 0 && completedTime < cutoffTime);
      });
      cleanedCount += origActionCount - userData.pendingActions.length;

      // Mark dirty if anything was cleaned
      if (
        userData.tasks.length !== origTaskCount ||
        userData.workflows.length !== origWorkflowCount ||
        userData.pendingActions.length !== origActionCount
      ) {
        this.markDirty(userId);
      }
    }

    if (cleanedCount > 0) {
      getLogger().info({ cleanedCount }, '🧹 Cleaned up old background tasks');
    }

    return cleanedCount;
  }

  private startScheduleChecker(): void {
    let cleanupCounter = 0;
    const CLEANUP_EVERY_N_CHECKS = 60; // Run cleanup every 60 minutes

    const checkSchedules = async () => {
      const now = new Date();

      // Periodic cleanup to prevent memory leaks
      cleanupCounter++;
      if (cleanupCounter >= CLEANUP_EVERY_N_CHECKS) {
        cleanupCounter = 0;
        this.cleanupOldTasks();
      }

      for (const [userId, data] of this.data.entries()) {
        // Check scheduled jobs
        for (const job of data.scheduledJobs) {
          if (job.isActive && job.nextRunAt && job.nextRunAt <= now) {
            try {
              await this.createTask({
                userId,
                type: job.jobType,
                description: `Scheduled: ${job.name}`,
                parameters: job.parameters,
                priority: 'medium',
              });

              job.lastRunAt = now;
              job.runCount++;
              job.nextRunAt = this.calculateNextRun(job.schedule);
              this.markDirty(userId);
            } catch (error) {
              getLogger().error({ error, jobId: job.id }, 'Failed to run scheduled job');
            }
          }
        }

        // Check expired pending actions
        for (const action of data.pendingActions) {
          if (action.status === 'watching' && action.expiresAt && action.expiresAt <= now) {
            action.status = 'expired';
            this.markDirty(userId);
            this.emit('pending_action_expired', action);
          }
        }
      }
    };

    // Use registerInterval for consistent cleanup
    registerInterval('background-schedule-checker', () => void checkSchedules(), 60000);
  }

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
// SINGLETON & EXPORTS
// ============================================================================

let instance: BackgroundTaskService | null = null;

export function getBackgroundTaskService(): BackgroundTaskService {
  if (!instance) {
    instance = new BackgroundTaskService();
  }
  return instance;
}

export async function initializeBackgroundTasks(): Promise<BackgroundTaskService> {
  const service = getBackgroundTaskService();
  await service.initialize();
  return service;
}

export async function shutdownBackgroundTasks(): Promise<void> {
  if (instance) {
    await instance.shutdown();
    instance = null;
  }
}

export default BackgroundTaskService;

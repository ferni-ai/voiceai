/**
 * Background Tasks & Workflow System
 *
 * Manages async operations, multi-step workflows, and scheduled jobs
 * that run outside of active conversations.
 *
 * Features:
 * - Task Queue: Async operations with status tracking
 * - Workflows: Multi-step processes with state machine
 * - Pending Actions: Events waiting on external triggers
 * - Scheduled Jobs: Recurring tasks (daily digest, check-ins)
 * - Delegation Tracking: Tasks handed off between personas
 *
 * Persistence: Stored with user profile in Firestore
 */

import { getLogger } from '../../utils/safe-logger.js';
import { EventEmitter } from 'events';
import { getDefaultStore } from '../../memory/index.js';
import type { UserProfile } from '../../types/user-profile.js';

// ============================================================================
// TYPES
// ============================================================================

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'waiting';

/**
 * Background task - single async operation
 */
export interface BackgroundTask {
  id: string;
  userId: string;

  // What to do
  type: string; // e.g., 'send_email', 'book_flight', 'check_package'
  description: string;
  parameters: Record<string, unknown>;

  // When/how
  priority: TaskPriority;
  scheduledFor?: Date; // If scheduled for later
  retryCount: number;
  maxRetries: number;

  // Status
  status: TaskStatus;
  result?: unknown;
  error?: string;

  // Context
  createdBy: string; // Persona that created it
  conversationId?: string;
  parentWorkflowId?: string;

  // Timestamps
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

/**
 * Workflow - multi-step process
 */
export interface Workflow {
  id: string;
  userId: string;

  // Definition
  name: string;
  description: string;
  steps: WorkflowStep[];

  // State
  currentStepIndex: number;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  context: Record<string, unknown>; // Shared data between steps

  // Control
  pauseReason?: string;
  canResume: boolean;
  requiresUserInput?: string;

  // Persona
  createdBy: string;
  handledBy?: string; // May be different persona

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface WorkflowStep {
  id: string;
  name: string;
  taskType: string;
  parameters?: Record<string, unknown>;
  status: TaskStatus;
  result?: unknown;
  error?: string;

  // Conditionals
  condition?: string; // JS expression to evaluate
  onSuccess?: string; // Step ID to go to on success
  onFailure?: string; // Step ID to go to on failure
}

/**
 * Pending Action - waiting for external event
 */
export interface PendingAction {
  id: string;
  userId: string;

  // What we're waiting for
  waitingFor: string; // e.g., 'package_delivered', 'flight_status_change'
  description: string;

  // Trigger conditions
  triggerType: 'webhook' | 'polling' | 'time' | 'manual';
  triggerConfig: Record<string, unknown>;

  // What to do when triggered
  actionType: string;
  actionParameters: Record<string, unknown>;
  notifyUser: boolean;
  notifyMethod?: 'sms' | 'email' | 'push' | 'next_conversation';

  // Status
  status: 'watching' | 'triggered' | 'completed' | 'expired' | 'cancelled';
  expiresAt?: Date;

  // Context
  createdBy: string;

  // Timestamps
  createdAt: Date;
  triggeredAt?: Date;
  completedAt?: Date;
}

/**
 * Scheduled Job - recurring task
 */
export interface ScheduledJob {
  id: string;
  userId: string;

  // Schedule
  name: string;
  schedule: 'daily' | 'weekly' | 'monthly' | 'custom';
  customCron?: string;
  timezone: string;

  // What to do
  jobType: string;
  parameters: Record<string, unknown>;

  // Status
  isActive: boolean;
  lastRunAt?: Date;
  nextRunAt?: Date;
  runCount: number;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Delegation - task handed between personas
 */
export interface Delegation {
  id: string;
  userId: string;

  // What
  taskDescription: string;
  context: Record<string, unknown>;

  // Who
  fromPersona: string;
  toPersona: string;

  // Status
  status: 'delegated' | 'accepted' | 'in_progress' | 'completed' | 'returned';
  outcome?: string;

  // Communication
  originalRequest: string;
  updates: Array<{
    timestamp: Date;
    from: string;
    message: string;
  }>;

  // Timestamps
  createdAt: Date;
  acceptedAt?: Date;
  completedAt?: Date;
}

/**
 * Full background data for a user
 */
export interface BackgroundData {
  userId: string;
  tasks: BackgroundTask[];
  workflows: Workflow[];
  pendingActions: PendingAction[];
  scheduledJobs: ScheduledJob[];
  delegations: Delegation[];
  lastUpdated: Date;
}

// ============================================================================
// TASK HANDLERS REGISTRY
// ============================================================================

type TaskHandler = (task: BackgroundTask) => Promise<unknown>;
const taskHandlers = new Map<string, TaskHandler>();

/**
 * Register a handler for a task type
 */
export function registerTaskHandler(taskType: string, handler: TaskHandler): void {
  taskHandlers.set(taskType, handler);
  // Debug logging deferred to avoid module-load logger issues
}

// ============================================================================
// BACKGROUND TASK SERVICE
// ============================================================================

class BackgroundTaskService extends EventEmitter {
  private data = new Map<string, BackgroundData>();
  private taskQueue: BackgroundTask[] = [];
  private isProcessing = false;
  private checkInterval: NodeJS.Timeout | null = null;
  // FIX: Track initialization to prevent double-init
  private initialized = false;

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    getLogger().info('🔄 Background task service initializing');

    // Start the task processor
    this.startProcessor();

    // Start the scheduler checker
    this.startScheduleChecker();
  }

  async shutdown(): Promise<void> {
    getLogger().info('🔄 Background task service shutting down');

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Persist all pending data
    for (const [userId, data] of this.data.entries()) {
      await this.persistUserData(userId, data);
    }

    this.initialized = false;
    getLogger().info('✅ Background task service shutdown complete');
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
      parameters: params.parameters || {},
      priority: params.priority || 'medium',
      scheduledFor: params.scheduledFor,
      retryCount: 0,
      maxRetries: 3,
      status: params.scheduledFor ? 'pending' : 'pending',
      createdBy: params.createdBy || 'system',
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
   * Get task by ID
   */
  getTask(taskId: string): BackgroundTask | undefined {
    for (const data of this.data.values()) {
      const task = data.tasks.find((t) => t.id === taskId);
      if (task) return task;
    }
    return undefined;
  }

  /**
   * Update task status
   */
  async updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    result?: unknown,
    error?: string
  ): Promise<void> {
    const task = this.getTask(taskId);
    if (!task) return;

    task.status = status;
    if (result !== undefined) task.result = result;
    if (error) task.error = error;
    if (status === 'running') task.startedAt = new Date();
    if (status === 'completed' || status === 'failed') task.completedAt = new Date();

    this.markDirty(task.userId);
    this.emit('task_updated', task);
  }

  /**
   * Get user's pending tasks
   */
  async getUserTasks(userId: string, status?: TaskStatus): Promise<BackgroundTask[]> {
    const userData = await this.getUserData(userId);
    if (status) {
      return userData.tasks.filter((t) => t.status === status);
    }
    return userData.tasks;
  }

  // ============================================================================
  // WORKFLOW OPERATIONS
  // ============================================================================

  /**
   * Create a new workflow
   */
  async createWorkflow(params: {
    userId: string;
    name: string;
    description: string;
    steps: Array<Omit<WorkflowStep, 'status' | 'id'>>;
    createdBy?: string;
    context?: Record<string, unknown>;
  }): Promise<Workflow> {
    const workflow: Workflow = {
      id: `workflow_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      userId: params.userId,
      name: params.name,
      description: params.description,
      steps: params.steps.map((step, i) => ({
        ...step,
        id: `step_${i}`,
        status: 'pending',
      })),
      currentStepIndex: 0,
      status: 'pending',
      context: params.context || {},
      canResume: true,
      createdBy: params.createdBy || 'system',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const userData = await this.getUserData(params.userId);
    userData.workflows.push(workflow);
    this.markDirty(params.userId);

    getLogger().info({ workflowId: workflow.id, name: workflow.name }, '🔄 Workflow created');

    this.emit('workflow_created', workflow);
    return workflow;
  }

  /**
   * Start or resume a workflow
   */
  async runWorkflow(workflowId: string): Promise<void> {
    const workflow = this.getWorkflow(workflowId);
    if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);

    workflow.status = 'running';
    workflow.updatedAt = new Date();
    this.emit('workflow_started', workflow);

    // Execute steps
    while (workflow.currentStepIndex < workflow.steps.length && workflow.status === 'running') {
      const step = workflow.steps[workflow.currentStepIndex];

      try {
        // Check condition if present
        if (step.condition) {
          const shouldRun = this.evaluateCondition(step.condition, workflow.context);
          if (!shouldRun) {
            step.status = 'completed';
            step.result = { skipped: true, reason: 'condition not met' };
            workflow.currentStepIndex++;
            continue;
          }
        }

        // Create task for this step
        const task = await this.createTask({
          userId: workflow.userId,
          type: step.taskType,
          description: step.name,
          parameters: { ...step.parameters, workflowContext: workflow.context },
          priority: 'high',
          createdBy: workflow.handledBy || workflow.createdBy,
          workflowId: workflow.id,
        });

        // Execute task
        step.status = 'running';
        const result = await this.executeTask(task);

        step.status = 'completed';
        step.result = result;

        // Update workflow context with step result
        workflow.context[`step_${workflow.currentStepIndex}_result`] = result;

        workflow.currentStepIndex++;
        workflow.updatedAt = new Date();
        this.markDirty(workflow.userId);
      } catch (error) {
        step.status = 'failed';
        step.error = String(error);

        if (step.onFailure) {
          // Jump to failure step
          const failureIndex = workflow.steps.findIndex((s) => s.id === step.onFailure);
          if (failureIndex >= 0) {
            workflow.currentStepIndex = failureIndex;
            continue;
          }
        }

        workflow.status = 'failed';
        break;
      }
    }

    if (workflow.currentStepIndex >= workflow.steps.length) {
      workflow.status = 'completed';
      workflow.completedAt = new Date();
    }

    workflow.updatedAt = new Date();
    this.markDirty(workflow.userId);
    this.emit('workflow_completed', workflow);
  }

  /**
   * Pause a workflow (e.g., waiting for user input)
   */
  pauseWorkflow(workflowId: string, reason: string, requiresInput?: string): void {
    const workflow = this.getWorkflow(workflowId);
    if (!workflow) return;

    workflow.status = 'paused';
    workflow.pauseReason = reason;
    workflow.requiresUserInput = requiresInput;
    workflow.updatedAt = new Date();
    this.markDirty(workflow.userId);

    this.emit('workflow_paused', workflow);
  }

  getWorkflow(workflowId: string): Workflow | undefined {
    for (const data of this.data.values()) {
      const workflow = data.workflows.find((w) => w.id === workflowId);
      if (workflow) return workflow;
    }
    return undefined;
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
      actionParameters: params.actionParameters || {},
      notifyUser: params.notifyUser ?? true,
      notifyMethod: params.notifyMethod,
      status: 'watching',
      expiresAt: params.expiresAt,
      createdBy: params.createdBy || 'system',
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
   * Trigger a pending action (when condition is met)
   */
  async triggerPendingAction(actionId: string, triggerData?: unknown): Promise<void> {
    let foundAction: PendingAction | undefined;
    let userId: string | undefined;

    for (const [uid, data] of this.data.entries()) {
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

    // Execute the action
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

      // Notify user if requested
      if (foundAction.notifyUser) {
        this.emit('notify_user', {
          userId,
          method: foundAction.notifyMethod || 'next_conversation',
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
      timezone: params.timezone || 'America/New_York',
      jobType: params.jobType,
      parameters: params.parameters || {},
      isActive: true,
      runCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      nextRunAt: this.calculateNextRun(params.schedule, params.timezone || 'America/New_York'),
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
  // DELEGATIONS
  // ============================================================================

  /**
   * Delegate a task to another persona
   */
  async createDelegation(params: {
    userId: string;
    taskDescription: string;
    context: Record<string, unknown>;
    fromPersona: string;
    toPersona: string;
    originalRequest: string;
  }): Promise<Delegation> {
    const delegation: Delegation = {
      id: `delegation_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      userId: params.userId,
      taskDescription: params.taskDescription,
      context: params.context,
      fromPersona: params.fromPersona,
      toPersona: params.toPersona,
      status: 'delegated',
      originalRequest: params.originalRequest,
      updates: [
        {
          timestamp: new Date(),
          from: params.fromPersona,
          message: `Delegated to ${params.toPersona}: ${params.taskDescription}`,
        },
      ],
      createdAt: new Date(),
    };

    const userData = await this.getUserData(params.userId);
    userData.delegations.push(delegation);
    this.markDirty(params.userId);

    getLogger().info(
      {
        delegationId: delegation.id,
        from: params.fromPersona,
        to: params.toPersona,
      },
      '🤝 Task delegated'
    );

    this.emit('delegation_created', delegation);
    return delegation;
  }

  /**
   * Update delegation status
   */
  async updateDelegation(
    delegationId: string,
    update: {
      status?: Delegation['status'];
      message?: string;
      from?: string;
      outcome?: string;
    }
  ): Promise<void> {
    let foundDelegation: Delegation | undefined;
    let userId: string | undefined;

    for (const [uid, data] of this.data.entries()) {
      const delegation = data.delegations.find((d) => d.id === delegationId);
      if (delegation) {
        foundDelegation = delegation;
        userId = uid;
        break;
      }
    }

    if (!foundDelegation || !userId) return;

    if (update.status) {
      foundDelegation.status = update.status;
      if (update.status === 'accepted') foundDelegation.acceptedAt = new Date();
      if (update.status === 'completed') foundDelegation.completedAt = new Date();
    }

    if (update.outcome) foundDelegation.outcome = update.outcome;

    if (update.message && update.from) {
      foundDelegation.updates.push({
        timestamp: new Date(),
        from: update.from,
        message: update.message,
      });
    }

    this.markDirty(userId);
    this.emit('delegation_updated', foundDelegation);
  }

  // ============================================================================
  // INTERNAL METHODS
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
    )?.backgroundData || {
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

  private async executeTask(task: BackgroundTask): Promise<unknown> {
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

  private startProcessor(): void {
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
        // Process up to 5 at a time
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

    // Process queue every 10 seconds
    setInterval(() => {
      void processQueue();
    }, 10000);
  }

  /**
   * Clean up old completed/failed/cancelled tasks to prevent memory leaks
   * Removes items older than maxAgeMs (default 7 days)
   */
  cleanupOldTasks(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): number {
    const cutoffTime = Date.now() - maxAgeMs;
    let cleanedCount = 0;

    for (const [userId, userData] of this.data.entries()) {
      const finishedStatuses: TaskStatus[] = ['completed', 'failed', 'cancelled'];

      // Clean up old tasks
      const tasksToKeep = userData.tasks.filter((task) => {
        const isFinished = finishedStatuses.includes(task.status);
        const completedTime = task.completedAt?.getTime() ?? 0;
        const isOld = completedTime > 0 && completedTime < cutoffTime;

        if (isFinished && isOld) {
          cleanedCount++;
          return false; // Remove this task
        }
        return true; // Keep this task
      });

      if (tasksToKeep.length !== userData.tasks.length) {
        userData.tasks = tasksToKeep;
        this.markDirty(userId);
      }

      // Clean up old workflows
      const workflowsToKeep = userData.workflows.filter((workflow) => {
        const isFinished = workflow.status === 'completed' || workflow.status === 'failed';
        const completedTime = workflow.completedAt?.getTime() ?? 0;
        const isOld = completedTime > 0 && completedTime < cutoffTime;

        if (isFinished && isOld) {
          cleanedCount++;
          return false;
        }
        return true;
      });

      if (workflowsToKeep.length !== userData.workflows.length) {
        userData.workflows = workflowsToKeep;
        this.markDirty(userId);
      }

      // Clean up old pending actions
      const actionsToKeep = userData.pendingActions.filter((action) => {
        const isFinished =
          action.status === 'completed' ||
          action.status === 'expired' ||
          action.status === 'cancelled';
        const completedTime = action.completedAt?.getTime() ?? 0;
        const isOld = completedTime > 0 && completedTime < cutoffTime;

        if (isFinished && isOld) {
          cleanedCount++;
          return false;
        }
        return true;
      });

      if (actionsToKeep.length !== userData.pendingActions.length) {
        userData.pendingActions = actionsToKeep;
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
    const CLEANUP_EVERY_N_CHECKS = 60; // Run cleanup every 60 minutes (checks run every minute)

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
              job.nextRunAt = this.calculateNextRun(job.schedule, job.timezone);
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

    this.checkInterval = setInterval(() => {
      void checkSchedules();
    }, 60000); // Every minute
  }

  private calculateNextRun(schedule: string, timezone: string): Date {
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

  private evaluateCondition(condition: string, context: Record<string, unknown>): boolean {
    try {
      // Simple condition evaluation (in production, use a proper expression evaluator)
      const fn = new Function(...Object.keys(context), `return ${condition}`);
      return Boolean(fn(...Object.values(context)));
    } catch {
      return true; // Default to true if condition can't be evaluated
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
  // Daily briefing is handled via the LLM tools
  // Just mark as complete - the actual briefing happens in conversation
  return { briefingScheduled: true, userId: task.userId };
});

registerTaskHandler('notify_user', async (task) => {
  const { message, method } = task.parameters as { message: string; method?: string };
  // Logging done at runtime when handler executes (logger available then)
  try {
    getLogger().info({ userId: task.userId, message, method }, 'User notification triggered');
  } catch {
    // Logger not available in test environment
  }
  // In a full implementation, this would send SMS/email/push
  return { notified: true, message };
});

export default BackgroundTaskService;

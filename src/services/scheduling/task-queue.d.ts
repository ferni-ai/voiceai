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
import type { BackgroundData, BackgroundTask, PendingAction, ScheduledJob, TaskHandler, TaskPriority, TaskStatus } from './background-types.js';
/**
 * Register a handler for a task type
 */
export declare function registerTaskHandler(taskType: string, handler: TaskHandler): void;
/**
 * Get a registered task handler
 */
export declare function getTaskHandler(taskType: string): TaskHandler | undefined;
export declare class TaskQueueService extends EventEmitter {
    private getUserData;
    private markDirty;
    private taskQueue;
    private isProcessing;
    private processorInterval;
    constructor(getUserData: (userId: string) => Promise<BackgroundData>, markDirty: (userId: string) => void);
    /**
     * Create a new background task
     */
    createTask(params: {
        userId: string;
        type: string;
        description: string;
        parameters?: Record<string, unknown>;
        priority?: TaskPriority;
        scheduledFor?: Date;
        createdBy?: string;
        workflowId?: string;
    }): Promise<BackgroundTask>;
    /**
     * Get task by ID from all user data
     */
    getTaskFromData(allData: Map<string, BackgroundData>, taskId: string): BackgroundTask | undefined;
    /**
     * Update task status
     */
    updateTaskStatus(task: BackgroundTask, status: TaskStatus, result?: unknown, error?: string): void;
    /**
     * Get user's tasks
     */
    getUserTasks(userId: string, status?: TaskStatus): Promise<BackgroundTask[]>;
    /**
     * Create a scheduled job
     */
    createScheduledJob(params: {
        userId: string;
        name: string;
        schedule: 'daily' | 'weekly' | 'monthly' | 'custom';
        customCron?: string;
        timezone?: string;
        jobType: string;
        parameters?: Record<string, unknown>;
    }): Promise<ScheduledJob>;
    /**
     * Create a pending action (waiting for external event)
     */
    createPendingAction(params: {
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
    }): Promise<PendingAction>;
    /**
     * Trigger a pending action
     */
    triggerPendingAction(allData: Map<string, BackgroundData>, actionId: string, triggerData?: unknown): Promise<void>;
    /**
     * Execute a single task
     */
    executeTask(task: BackgroundTask): Promise<unknown>;
    /**
     * Start the task queue processor
     */
    startProcessor(): void;
    /**
     * Stop the task queue processor
     */
    stopProcessor(): void;
    private calculateNextRun;
}
//# sourceMappingURL=task-queue.d.ts.map
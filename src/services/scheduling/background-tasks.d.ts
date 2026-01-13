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
import type { BackgroundData, BackgroundTask, Delegation, PendingAction, ScheduledJob, TaskPriority, TaskStatus, Workflow, WorkflowStep } from './background-types.js';
import { registerTaskHandler } from './task-queue.js';
export type { BackgroundData, BackgroundTask, Delegation, PendingAction, ScheduledJob, TaskPriority, TaskStatus, Workflow, WorkflowStep, };
export { registerTaskHandler };
declare class BackgroundTaskService extends EventEmitter {
    private data;
    private checkInterval;
    private initialized;
    private taskQueue;
    private workflowEngine;
    private delegationService;
    constructor();
    private forwardEvents;
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
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
    getTask(taskId: string): BackgroundTask | undefined;
    updateTaskStatus(taskId: string, status: TaskStatus, result?: unknown, error?: string): Promise<void>;
    getUserTasks(userId: string, status?: TaskStatus): Promise<BackgroundTask[]>;
    createWorkflow(params: {
        userId: string;
        name: string;
        description: string;
        steps: Array<Omit<WorkflowStep, 'status' | 'id'>>;
        createdBy?: string;
        context?: Record<string, unknown>;
    }): Promise<Workflow>;
    runWorkflow(workflowId: string): Promise<void>;
    pauseWorkflow(workflowId: string, reason: string, requiresInput?: string): void;
    getWorkflow(workflowId: string): Workflow | undefined;
    getUserWorkflows(userId: string, status?: Workflow['status']): Promise<Workflow[]>;
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
    triggerPendingAction(actionId: string, triggerData?: unknown): Promise<void>;
    createScheduledJob(params: {
        userId: string;
        name: string;
        schedule: 'daily' | 'weekly' | 'monthly' | 'custom';
        customCron?: string;
        timezone?: string;
        jobType: string;
        parameters?: Record<string, unknown>;
    }): Promise<ScheduledJob>;
    createDelegation(params: {
        userId: string;
        taskDescription: string;
        context: Record<string, unknown>;
        fromPersona: string;
        toPersona: string;
        originalRequest: string;
    }): Promise<Delegation>;
    updateDelegation(delegationId: string, update: {
        status?: Delegation['status'];
        message?: string;
        from?: string;
        outcome?: string;
    }): Promise<void>;
    getUserDelegations(userId: string, filter?: {
        status?: Delegation['status'];
        fromPersona?: string;
        toPersona?: string;
    }): Promise<Delegation[]>;
    private getUserData;
    private markDirty;
    private persistTimers;
    private schedulePersist;
    private persistUserData;
    /**
     * Clean up old completed/failed/cancelled items to prevent memory leaks
     */
    cleanupOldTasks(maxAgeMs?: number): number;
    private startScheduleChecker;
    private calculateNextRun;
}
export declare function getBackgroundTaskService(): BackgroundTaskService;
export declare function initializeBackgroundTasks(): Promise<BackgroundTaskService>;
export declare function shutdownBackgroundTasks(): Promise<void>;
export default BackgroundTaskService;
//# sourceMappingURL=background-tasks.d.ts.map
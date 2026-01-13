/**
 * Workflow Engine
 *
 * Manages multi-step workflow processes:
 * - Workflow creation and management
 * - Step execution with conditionals
 * - State machine transitions
 * - Pause/resume functionality
 *
 * Part of the background tasks system, split for maintainability.
 */
import { EventEmitter } from 'events';
import type { BackgroundData, Workflow, WorkflowStep } from './background-types.js';
import type { TaskQueueService } from './task-queue.js';
export declare class WorkflowEngine extends EventEmitter {
    private getUserData;
    private markDirty;
    private taskQueue;
    constructor(getUserData: (userId: string) => Promise<BackgroundData>, markDirty: (userId: string) => void, taskQueue: TaskQueueService);
    /**
     * Create a new workflow
     */
    createWorkflow(params: {
        userId: string;
        name: string;
        description: string;
        steps: Array<Omit<WorkflowStep, 'status' | 'id'>>;
        createdBy?: string;
        context?: Record<string, unknown>;
    }): Promise<Workflow>;
    /**
     * Get workflow by ID from all user data
     */
    getWorkflowFromData(allData: Map<string, BackgroundData>, workflowId: string): Workflow | undefined;
    /**
     * Start or resume a workflow
     */
    runWorkflow(allData: Map<string, BackgroundData>, workflowId: string): Promise<void>;
    /**
     * Pause a workflow (e.g., waiting for user input)
     */
    pauseWorkflow(allData: Map<string, BackgroundData>, workflowId: string, reason: string, requiresInput?: string): void;
    /**
     * Resume a paused workflow
     */
    resumeWorkflow(allData: Map<string, BackgroundData>, workflowId: string, userInput?: Record<string, unknown>): Promise<void>;
    /**
     * Get user's workflows
     */
    getUserWorkflows(userId: string, status?: Workflow['status']): Promise<Workflow[]>;
    private executeWorkflowTask;
    private evaluateCondition;
}
//# sourceMappingURL=workflow-engine.d.ts.map
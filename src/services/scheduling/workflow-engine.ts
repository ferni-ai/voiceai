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

import { getLogger } from '../../utils/safe-logger.js';

import type { BackgroundData, BackgroundTask, Workflow, WorkflowStep } from './background-types.js';
import type { TaskQueueService } from './task-queue.js';

// ============================================================================
// WORKFLOW ENGINE
// ============================================================================

export class WorkflowEngine extends EventEmitter {
  constructor(
    private getUserData: (userId: string) => Promise<BackgroundData>,
    private markDirty: (userId: string) => void,
    private taskQueue: TaskQueueService
  ) {
    super();
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
        status: 'pending' as const,
      })),
      currentStepIndex: 0,
      status: 'pending',
      context: params.context ?? {},
      canResume: true,
      createdBy: params.createdBy ?? 'system',
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
   * Get workflow by ID from all user data
   */
  getWorkflowFromData(
    allData: Map<string, BackgroundData>,
    workflowId: string
  ): Workflow | undefined {
    for (const data of allData.values()) {
      const workflow = data.workflows.find((w) => w.id === workflowId);
      if (workflow) return workflow;
    }
    return undefined;
  }

  /**
   * Start or resume a workflow
   */
  async runWorkflow(allData: Map<string, BackgroundData>, workflowId: string): Promise<void> {
    const workflow = this.getWorkflowFromData(allData, workflowId);
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
        const task = await this.taskQueue.createTask({
          userId: workflow.userId,
          type: step.taskType,
          description: step.name,
          parameters: { ...step.parameters, workflowContext: workflow.context },
          priority: 'high',
          createdBy: workflow.handledBy ?? workflow.createdBy,
          workflowId: workflow.id,
        });

        // Execute task
        step.status = 'running';
        const result = await this.executeWorkflowTask(task);

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
  pauseWorkflow(
    allData: Map<string, BackgroundData>,
    workflowId: string,
    reason: string,
    requiresInput?: string
  ): void {
    const workflow = this.getWorkflowFromData(allData, workflowId);
    if (!workflow) return;

    workflow.status = 'paused';
    workflow.pauseReason = reason;
    workflow.requiresUserInput = requiresInput;
    workflow.updatedAt = new Date();
    this.markDirty(workflow.userId);

    this.emit('workflow_paused', workflow);
  }

  /**
   * Resume a paused workflow
   */
  async resumeWorkflow(
    allData: Map<string, BackgroundData>,
    workflowId: string,
    userInput?: Record<string, unknown>
  ): Promise<void> {
    const workflow = this.getWorkflowFromData(allData, workflowId);
    if (!workflow || workflow.status !== 'paused') return;

    // Add user input to context
    if (userInput) {
      workflow.context.userInput = userInput;
    }

    workflow.requiresUserInput = undefined;
    workflow.pauseReason = undefined;

    await this.runWorkflow(allData, workflowId);
  }

  /**
   * Get user's workflows
   */
  async getUserWorkflows(userId: string, status?: Workflow['status']): Promise<Workflow[]> {
    const userData = await this.getUserData(userId);
    if (status) {
      return userData.workflows.filter((w) => w.status === status);
    }
    return userData.workflows;
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private async executeWorkflowTask(task: BackgroundTask): Promise<unknown> {
    return this.taskQueue.executeTask(task);
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

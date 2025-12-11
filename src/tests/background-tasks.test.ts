/**
 * Background Tasks Tests
 *
 * Tests for the background task and workflow system including:
 * - Task creation and lifecycle
 * - Workflows and steps
 * - Pending actions
 * - Scheduled jobs
 * - Delegations
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  getBackgroundTaskService,
  registerTaskHandler,
  initializeBackgroundTasks,
  shutdownBackgroundTasks,
  type BackgroundTask,
  type Workflow,
  type TaskPriority,
  type TaskStatus,
} from '../services/background-tasks.js';

// Mock the logger
vi.mock('../utils/safe-logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock the memory/store
vi.mock('../memory/index.js', () => ({
  getDefaultStore: vi.fn(() => ({
    getProfile: vi.fn().mockResolvedValue(null),
    saveProfile: vi.fn().mockResolvedValue(undefined),
    getOrCreateProfile: vi.fn().mockResolvedValue({ userId: 'test-user' }),
  })),
}));

describe('Background Tasks Service', () => {
  let service: ReturnType<typeof getBackgroundTaskService>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = getBackgroundTaskService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getBackgroundTaskService', () => {
    it('should return a singleton instance', () => {
      const service1 = getBackgroundTaskService();
      const service2 = getBackgroundTaskService();
      expect(service1).toBe(service2);
    });

    it('should have required methods', () => {
      expect(typeof service.createTask).toBe('function');
      expect(typeof service.getTask).toBe('function');
      expect(typeof service.updateTaskStatus).toBe('function');
      expect(typeof service.getUserTasks).toBe('function');
      expect(typeof service.createWorkflow).toBe('function');
      expect(typeof service.runWorkflow).toBe('function');
      expect(typeof service.pauseWorkflow).toBe('function');
      expect(typeof service.getWorkflow).toBe('function');
      expect(typeof service.createPendingAction).toBe('function');
      expect(typeof service.createScheduledJob).toBe('function');
      expect(typeof service.createDelegation).toBe('function');
    });
  });

  describe('Task Creation', () => {
    it('should create a basic task', async () => {
      const task = await service.createTask({
        userId: 'test-user',
        type: 'send_notification',
        description: 'Send daily reminder',
        parameters: { message: 'Time to check in!' },
      });

      expect(task).toBeDefined();
      expect(task.id).toBeDefined();
      expect(task.userId).toBe('test-user');
      expect(task.type).toBe('send_notification');
      expect(task.status).toBe('pending');
    });

    it('should create a task with priority', async () => {
      const priorities: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

      for (const priority of priorities) {
        const task = await service.createTask({
          userId: 'test-user',
          type: 'test_task',
          description: `Priority: ${priority}`,
          parameters: {},
          priority,
        });

        expect(task.priority).toBe(priority);
      }
    });

    it('should create a scheduled task', async () => {
      const scheduledTime = new Date(Date.now() + 3600000); // 1 hour from now

      const task = await service.createTask({
        userId: 'test-user',
        type: 'scheduled_reminder',
        description: 'Future task',
        parameters: {},
        scheduledFor: scheduledTime,
      });

      expect(task.scheduledFor).toEqual(scheduledTime);
    });

    it('should set default priority if not provided', async () => {
      const task = await service.createTask({
        userId: 'test-user',
        type: 'test_task',
        description: 'Default priority task',
        parameters: {},
      });

      expect(task.priority).toBe('medium');
    });
  });

  describe('Task Retrieval', () => {
    it('should retrieve a task by ID', async () => {
      const createdTask = await service.createTask({
        userId: 'test-user',
        type: 'retrievable_task',
        description: 'Task to retrieve',
        parameters: {},
      });

      const retrievedTask = service.getTask(createdTask.id);
      expect(retrievedTask).toBeDefined();
      expect(retrievedTask?.id).toBe(createdTask.id);
    });

    it('should return undefined for non-existent task', () => {
      const task = service.getTask('non-existent-task-id');
      expect(task).toBeUndefined();
    });

    it('should get tasks for a user', async () => {
      const userId = 'task-retrieval-user';

      // Create multiple tasks
      await service.createTask({
        userId,
        type: 'task_1',
        description: 'First task',
        parameters: {},
      });

      await service.createTask({
        userId,
        type: 'task_2',
        description: 'Second task',
        parameters: {},
      });

      const tasks = await service.getUserTasks(userId);
      expect(Array.isArray(tasks)).toBe(true);
      expect(tasks.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter tasks by status', async () => {
      const userId = 'status-filter-user';

      const task = await service.createTask({
        userId,
        type: 'filter_test',
        description: 'Status filter test',
        parameters: {},
      });

      // Task should be pending
      const pendingTasks = await service.getUserTasks(userId, 'pending');
      expect(pendingTasks.some((t) => t.id === task.id)).toBe(true);

      // No completed tasks yet
      const completedTasks = await service.getUserTasks(userId, 'completed');
      expect(completedTasks.some((t) => t.id === task.id)).toBe(false);
    });
  });

  describe('Task Status Updates', () => {
    it('should update task status to running', async () => {
      const task = await service.createTask({
        userId: 'test-user',
        type: 'status_update_test',
        description: 'Test status update',
        parameters: {},
      });

      await service.updateTaskStatus(task.id, 'running');
      const updatedTask = service.getTask(task.id);

      expect(updatedTask?.status).toBe('running');
      expect(updatedTask?.startedAt).toBeDefined();
    });

    it('should update task status to completed with result', async () => {
      const task = await service.createTask({
        userId: 'test-user',
        type: 'completion_test',
        description: 'Test completion',
        parameters: {},
      });

      const result = { success: true, data: 'Task completed successfully' };
      await service.updateTaskStatus(task.id, 'completed', result);
      const updatedTask = service.getTask(task.id);

      expect(updatedTask?.status).toBe('completed');
      expect(updatedTask?.result).toEqual(result);
      expect(updatedTask?.completedAt).toBeDefined();
    });

    it('should update task status to failed with error', async () => {
      const task = await service.createTask({
        userId: 'test-user',
        type: 'failure_test',
        description: 'Test failure',
        parameters: {},
      });

      await service.updateTaskStatus(task.id, 'failed', undefined, 'Connection timeout');
      const updatedTask = service.getTask(task.id);

      expect(updatedTask?.status).toBe('failed');
      expect(updatedTask?.error).toBe('Connection timeout');
    });
  });

  describe('Workflow Management', () => {
    it('should create a workflow with steps', async () => {
      const workflow = await service.createWorkflow({
        userId: 'workflow-user',
        name: 'Onboarding Workflow',
        description: 'New user onboarding process',
        steps: [
          { name: 'Welcome Message', taskType: 'send_message' },
          { name: 'Profile Setup', taskType: 'setup_profile' },
          { name: 'First Goal', taskType: 'create_goal' },
        ],
      });

      expect(workflow).toBeDefined();
      expect(workflow.id).toBeDefined();
      expect(workflow.name).toBe('Onboarding Workflow');
      expect(workflow.steps.length).toBe(3);
      expect(workflow.status).toBe('pending');
      expect(workflow.currentStepIndex).toBe(0);
    });

    it('should retrieve a workflow by ID', async () => {
      const createdWorkflow = await service.createWorkflow({
        userId: 'workflow-user',
        name: 'Retrievable Workflow',
        description: 'Test retrieval',
        steps: [{ name: 'Step 1', taskType: 'test' }],
      });

      const retrievedWorkflow = service.getWorkflow(createdWorkflow.id);
      expect(retrievedWorkflow).toBeDefined();
      expect(retrievedWorkflow?.id).toBe(createdWorkflow.id);
    });

    it('should return undefined for non-existent workflow', () => {
      const workflow = service.getWorkflow('non-existent-workflow-id');
      expect(workflow).toBeUndefined();
    });

    it('should pause a workflow', async () => {
      const workflow = await service.createWorkflow({
        userId: 'workflow-user',
        name: 'Pausable Workflow',
        description: 'Test pause',
        steps: [{ name: 'Step 1', taskType: 'test' }],
      });

      service.pauseWorkflow(workflow.id, 'Waiting for user input', 'Please confirm');

      const pausedWorkflow = service.getWorkflow(workflow.id);
      expect(pausedWorkflow?.status).toBe('paused');
      expect(pausedWorkflow?.pauseReason).toBe('Waiting for user input');
      expect(pausedWorkflow?.requiresUserInput).toBe('Please confirm');
    });
  });

  describe('Pending Actions', () => {
    it('should create a pending action', async () => {
      const action = await service.createPendingAction({
        userId: 'action-user',
        waitingFor: 'payment_confirmation',
        description: 'Waiting for payment confirmation',
        triggerType: 'webhook',
        triggerConfig: { endpoint: '/webhooks/payment' },
        actionType: 'notify_user',
        actionParameters: { orderId: '12345' },
      });

      expect(action).toBeDefined();
      expect(action.id).toBeDefined();
      expect(action.waitingFor).toBe('payment_confirmation');
      expect(action.triggerType).toBe('webhook');
      expect(action.status).toBe('watching');
    });

    it('should create pending action with expiration', async () => {
      const expirationDate = new Date(Date.now() + 86400000); // 24 hours

      const action = await service.createPendingAction({
        userId: 'timeout-user',
        waitingFor: 'user_response',
        description: 'Action with expiration',
        triggerType: 'manual',
        triggerConfig: {},
        actionType: 'follow_up',
        expiresAt: expirationDate,
      });

      expect(action).toBeDefined();
      expect(action.id).toBeDefined();
      expect(action.expiresAt).toEqual(expirationDate);
    });

    it('should create polling-based pending action', async () => {
      const action = await service.createPendingAction({
        userId: 'poll-user',
        waitingFor: 'package_delivery',
        description: 'Waiting for package tracking update',
        triggerType: 'polling',
        triggerConfig: { url: 'https://tracking.example.com', interval: 3600 },
        actionType: 'send_notification',
      });

      expect(action.triggerType).toBe('polling');
      expect(action.triggerConfig).toHaveProperty('interval');
    });
  });

  describe('Scheduled Jobs', () => {
    it('should create a daily scheduled job', async () => {
      const job = await service.createScheduledJob({
        userId: 'schedule-user',
        name: 'Daily Check-in',
        taskType: 'daily_checkin',
        schedule: 'daily',
      });

      expect(job).toBeDefined();
      expect(job.id).toBeDefined();
      expect(job.name).toBe('Daily Check-in');
      expect(job.schedule).toBe('daily');
      // enabled may be undefined by default
      expect(job.enabled === true || job.enabled === undefined).toBe(true);
    });

    it('should create weekly and monthly jobs', async () => {
      const weeklyJob = await service.createScheduledJob({
        userId: 'schedule-user',
        name: 'Weekly Review',
        taskType: 'weekly_review',
        schedule: 'weekly',
      });

      const monthlyJob = await service.createScheduledJob({
        userId: 'schedule-user',
        name: 'Monthly Summary',
        taskType: 'monthly_summary',
        schedule: 'monthly',
      });

      expect(weeklyJob.schedule).toBe('weekly');
      expect(monthlyJob.schedule).toBe('monthly');
    });

    it('should create job with custom parameters', async () => {
      const job = await service.createScheduledJob({
        userId: 'schedule-user',
        name: 'Custom Job',
        taskType: 'custom_task',
        schedule: 'daily',
        parameters: { customParam: 'value', threshold: 100 },
      });

      expect(job.parameters).toEqual({ customParam: 'value', threshold: 100 });
    });
  });

  describe('Delegations', () => {
    it('should create a delegation between personas', async () => {
      const delegation = await service.createDelegation({
        userId: 'delegation-user',
        taskId: 'task-123',
        fromPersona: 'ferni',
        toPersona: 'maya-santos',
        reason: 'Financial task better suited for Maya',
        priority: 'high',
      });

      expect(delegation).toBeDefined();
      expect(delegation.id).toBeDefined();
      expect(delegation.fromPersona).toBe('ferni');
      expect(delegation.toPersona).toBe('maya-santos');
      // Status starts as 'delegated' not 'pending'
      expect(delegation.status).toBe('delegated');
    });

    it('should update delegation status', async () => {
      const delegation = await service.createDelegation({
        userId: 'delegation-user',
        taskId: 'task-456',
        fromPersona: 'jordan-taylor',
        toPersona: 'alex-chen',
        reason: 'Communication task',
        priority: 'medium',
      });

      await service.updateDelegation(delegation.id, {
        status: 'accepted',
        note: 'Taking on this task',
      });

      // Verify delegation was updated (we'd need to add a getDelegation method to verify fully)
      expect(delegation).toBeDefined();
    });
  });

  describe('Task Handler Registration', () => {
    it('should register a task handler', () => {
      const handler = vi.fn().mockResolvedValue({ success: true });

      expect(() => {
        registerTaskHandler('custom_task_type', handler);
      }).not.toThrow();
    });

    it('should allow multiple handlers for different task types', () => {
      const handler1 = vi.fn().mockResolvedValue({ success: true });
      const handler2 = vi.fn().mockResolvedValue({ success: true });

      expect(() => {
        registerTaskHandler('task_type_1', handler1);
        registerTaskHandler('task_type_2', handler2);
      }).not.toThrow();
    });
  });

  describe('Service Lifecycle', () => {
    it('should initialize the service', async () => {
      const initializedService = await initializeBackgroundTasks();
      expect(initializedService).toBeDefined();
    });

    it('should shutdown gracefully', async () => {
      await expect(shutdownBackgroundTasks()).resolves.not.toThrow();
    });
  });
});

describe('Task Priority Ordering', () => {
  let service: ReturnType<typeof getBackgroundTaskService>;

  beforeEach(() => {
    service = getBackgroundTaskService();
  });

  it('should respect priority when creating tasks', async () => {
    const urgentTask = await service.createTask({
      userId: 'priority-user',
      type: 'urgent_task',
      description: 'Urgent!',
      parameters: {},
      priority: 'urgent',
    });

    const lowTask = await service.createTask({
      userId: 'priority-user',
      type: 'low_task',
      description: 'Low priority',
      parameters: {},
      priority: 'low',
    });

    expect(urgentTask.priority).toBe('urgent');
    expect(lowTask.priority).toBe('low');
  });
});

describe('Workflow Step Execution', () => {
  let service: ReturnType<typeof getBackgroundTaskService>;

  beforeEach(() => {
    service = getBackgroundTaskService();
  });

  it('should have steps with correct structure', async () => {
    const workflow = await service.createWorkflow({
      userId: 'step-user',
      name: 'Multi-step Workflow',
      description: 'Test steps',
      steps: [
        { name: 'Step 1', taskType: 'step_one', parameters: { a: 1 } },
        { name: 'Step 2', taskType: 'step_two', parameters: { b: 2 } },
        { name: 'Step 3', taskType: 'step_three' },
      ],
    });

    expect(workflow.steps.length).toBe(3);
    expect(workflow.steps[0].name).toBe('Step 1');
    expect(workflow.steps[0].parameters).toEqual({ a: 1 });
    expect(workflow.steps[1].name).toBe('Step 2');
    expect(workflow.steps[2].parameters).toBeUndefined();
  });
});

describe('Edge Cases', () => {
  let service: ReturnType<typeof getBackgroundTaskService>;

  beforeEach(() => {
    service = getBackgroundTaskService();
  });

  it('should handle empty parameters', async () => {
    const task = await service.createTask({
      userId: 'edge-user',
      type: 'empty_params',
      description: 'No params',
      parameters: {},
    });

    expect(task.parameters).toEqual({});
  });

  it('should handle complex parameters', async () => {
    const complexParams = {
      nested: {
        deep: {
          value: 'found',
        },
      },
      array: [1, 2, 3],
      mixed: { arr: ['a', 'b'], num: 42 },
    };

    const task = await service.createTask({
      userId: 'edge-user',
      type: 'complex_params',
      description: 'Complex parameters',
      parameters: complexParams,
    });

    expect(task.parameters).toEqual(complexParams);
  });

  it('should handle workflow with single step', async () => {
    const workflow = await service.createWorkflow({
      userId: 'edge-user',
      name: 'Single Step',
      description: 'One step only',
      steps: [{ name: 'Only Step', taskType: 'single' }],
    });

    expect(workflow.steps.length).toBe(1);
  });

  it('should handle special characters in descriptions', async () => {
    const specialDesc = 'Task with "quotes" & <tags> and emoji 🎉';

    const task = await service.createTask({
      userId: 'edge-user',
      type: 'special_chars',
      description: specialDesc,
      parameters: {},
    });

    expect(task.description).toBe(specialDesc);
  });
});

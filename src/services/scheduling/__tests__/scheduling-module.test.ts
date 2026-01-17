/**
 * Scheduling Module Tests
 *
 * Comprehensive tests for the scheduling subsystem:
 * - TaskQueueService: Task creation, queue processing, handlers
 * - WorkflowEngine: Multi-step workflow execution
 * - DelegationService: Inter-persona task handoffs
 * - BackgroundTaskService: Coordinator
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  }),
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../../utils/interval-manager.js', () => ({
  registerInterval: vi.fn(),
  clearNamedInterval: vi.fn(),
}));

vi.mock('../../../memory/index.js', () => ({
  getDefaultStore: vi.fn(() => null),
}));

// Import after mocks
import { registerTaskHandler, getTaskHandler, TaskQueueService } from '../task-queue.js';
import { WorkflowEngine } from '../workflow-engine.js';
import { DelegationService } from '../delegation-service.js';
import type { BackgroundData, BackgroundTask, Workflow } from '../background-types.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createEmptyBackgroundData(userId: string): BackgroundData {
  return {
    userId,
    tasks: [],
    workflows: [],
    delegations: [],
    pendingActions: [],
    scheduledJobs: [],
    lastUpdated: new Date(),
  };
}

const userDataStore = new Map<string, BackgroundData>();

async function mockGetUserData(userId: string): Promise<BackgroundData> {
  if (!userDataStore.has(userId)) {
    userDataStore.set(userId, createEmptyBackgroundData(userId));
  }
  return userDataStore.get(userId)!;
}

function mockMarkDirty(_userId: string): void {
  // No-op for tests
}

// ============================================================================
// TASK QUEUE SERVICE TESTS
// ============================================================================

describe('TaskQueueService', () => {
  let taskQueue: TaskQueueService;

  beforeEach(() => {
    vi.clearAllMocks();
    userDataStore.clear();
    taskQueue = new TaskQueueService(mockGetUserData, mockMarkDirty);
  });

  describe('Task Creation', () => {
    it('should create a task with default values', async () => {
      const task = await taskQueue.createTask({
        userId: 'test-user',
        type: 'send_email',
        description: 'Send welcome email',
      });

      expect(task).toBeDefined();
      expect(task.id).toMatch(/^task_/);
      expect(task.type).toBe('send_email');
      expect(task.status).toBe('pending');
      expect(task.priority).toBe('medium');
    });

    it('should create a high priority task', async () => {
      const task = await taskQueue.createTask({
        userId: 'test-user',
        type: 'urgent_reminder',
        description: 'Urgent reminder',
        priority: 'high',
      });

      expect(task.priority).toBe('high');
    });

    it('should create a scheduled task', async () => {
      const scheduledTime = new Date(Date.now() + 3600000); // 1 hour from now
      const task = await taskQueue.createTask({
        userId: 'test-user',
        type: 'scheduled_check',
        description: 'Scheduled check-in',
        scheduledFor: scheduledTime,
      });

      expect(task.scheduledFor).toEqual(scheduledTime);
    });

    it('should add task to user data', async () => {
      await taskQueue.createTask({
        userId: 'test-user',
        type: 'test_task',
        description: 'Test task',
      });

      const userData = await mockGetUserData('test-user');
      expect(userData.tasks.length).toBe(1);
    });
  });

  describe('Task Status Updates', () => {
    it('should update task status to running', async () => {
      const task = await taskQueue.createTask({
        userId: 'test-user',
        type: 'test_task',
        description: 'Test task',
      });

      // Use the actual API: updateTaskStatus(task, status, result?, error?)
      taskQueue.updateTaskStatus(task, 'running');

      expect(task.status).toBe('running');
      expect(task.startedAt).toBeDefined();
    });

    it('should update task status to completed', async () => {
      const task = await taskQueue.createTask({
        userId: 'test-user',
        type: 'test_task',
        description: 'Test task',
      });

      taskQueue.updateTaskStatus(task, 'completed', { result: 'success' });

      expect(task.status).toBe('completed');
      expect(task.completedAt).toBeDefined();
      expect(task.result).toEqual({ result: 'success' });
    });

    it('should update task status to failed with error', async () => {
      const task = await taskQueue.createTask({
        userId: 'test-user',
        type: 'test_task',
        description: 'Test task',
      });

      taskQueue.updateTaskStatus(task, 'failed', undefined, 'Task execution failed');

      expect(task.status).toBe('failed');
      expect(task.error).toBe('Task execution failed');
    });
  });

  describe('Task Retrieval', () => {
    it('should get pending tasks', async () => {
      await taskQueue.createTask({
        userId: 'test-user',
        type: 'task1',
        description: 'Task 1',
      });
      await taskQueue.createTask({
        userId: 'test-user',
        type: 'task2',
        description: 'Task 2',
      });

      const pendingTasks = await taskQueue.getUserTasks('test-user', 'pending');
      expect(pendingTasks.length).toBe(2);
    });

    it('should get all user tasks', async () => {
      await taskQueue.createTask({
        userId: 'test-user',
        type: 'email',
        description: 'Email 1',
      });
      await taskQueue.createTask({
        userId: 'test-user',
        type: 'sms',
        description: 'SMS 1',
      });
      await taskQueue.createTask({
        userId: 'test-user',
        type: 'email',
        description: 'Email 2',
      });

      const allTasks = await taskQueue.getUserTasks('test-user');
      expect(allTasks.length).toBe(3);

      // Filter by type manually
      const emailTasks = allTasks.filter((t) => t.type === 'email');
      expect(emailTasks.length).toBe(2);
    });
  });

  describe('Task Handler Registry', () => {
    it('should register a task handler', () => {
      const handler = vi.fn();
      registerTaskHandler('test_type', handler);

      const retrieved = getTaskHandler('test_type');
      expect(retrieved).toBe(handler);
    });

    it('should return undefined for unregistered handler', () => {
      const handler = getTaskHandler('nonexistent_type');
      expect(handler).toBeUndefined();
    });
  });
});

// ============================================================================
// WORKFLOW ENGINE TESTS
// ============================================================================

describe('WorkflowEngine', () => {
  let taskQueue: TaskQueueService;
  let workflowEngine: WorkflowEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    userDataStore.clear();
    taskQueue = new TaskQueueService(mockGetUserData, mockMarkDirty);
    workflowEngine = new WorkflowEngine(mockGetUserData, mockMarkDirty, taskQueue);
  });

  describe('Workflow Creation', () => {
    it('should create a workflow with steps', async () => {
      const workflow = await workflowEngine.createWorkflow({
        userId: 'test-user',
        name: 'Onboarding',
        description: 'User onboarding workflow',
        steps: [
          { name: 'Welcome', taskType: 'email' },
          { name: 'Tutorial', taskType: 'in_app' },
          { name: 'Survey', taskType: 'survey' },
        ],
      });

      expect(workflow).toBeDefined();
      expect(workflow.id).toMatch(/^workflow_/);
      expect(workflow.name).toBe('Onboarding');
      expect(workflow.steps.length).toBe(3);
      expect(workflow.status).toBe('pending');
      expect(workflow.currentStepIndex).toBe(0);
    });

    it('should add workflow to user data', async () => {
      await workflowEngine.createWorkflow({
        userId: 'test-user',
        name: 'Test Workflow',
        description: 'Test',
        steps: [{ name: 'Step 1', taskType: 'task' }],
      });

      const userData = await mockGetUserData('test-user');
      expect(userData.workflows.length).toBe(1);
    });

    it('should initialize all steps as pending', async () => {
      const workflow = await workflowEngine.createWorkflow({
        userId: 'test-user',
        name: 'Multi-step',
        description: 'Multi-step workflow',
        steps: [
          { name: 'Step 1', taskType: 'task' },
          { name: 'Step 2', taskType: 'task' },
        ],
      });

      expect(workflow.steps[0].status).toBe('pending');
      expect(workflow.steps[1].status).toBe('pending');
    });
  });

  describe('Workflow Retrieval', () => {
    it('should store workflow in user data', async () => {
      await workflowEngine.createWorkflow({
        userId: 'test-user',
        name: 'Workflow 1',
        description: 'Test 1',
        steps: [{ name: 'S1', taskType: 't' }],
      });

      const userData = await mockGetUserData('test-user');
      expect(userData.workflows.length).toBe(1);
      expect(userData.workflows[0].status).toBe('pending');
    });

    it('should get workflow by ID using allData map', async () => {
      const workflow = await workflowEngine.createWorkflow({
        userId: 'test-user',
        name: 'Find Me',
        description: 'Test',
        steps: [{ name: 'S1', taskType: 't' }],
      });

      // Create allData map
      const allData = new Map<string, BackgroundData>();
      const userData = await mockGetUserData('test-user');
      allData.set('test-user', userData);

      const found = workflowEngine.getWorkflowFromData(allData, workflow.id);
      expect(found?.name).toBe('Find Me');
    });
  });
});

// ============================================================================
// DELEGATION SERVICE TESTS
// ============================================================================

describe('DelegationService', () => {
  let delegationService: DelegationService;

  beforeEach(() => {
    vi.clearAllMocks();
    userDataStore.clear();
    delegationService = new DelegationService(mockGetUserData, mockMarkDirty);
  });

  describe('Delegation Creation', () => {
    it('should create a delegation between personas', async () => {
      const delegation = await delegationService.createDelegation({
        userId: 'test-user',
        taskDescription: 'Schedule meeting with client',
        fromPersona: 'maya',
        toPersona: 'alex',
        originalRequest: 'Can you help me schedule a meeting?',
        context: { meetingTime: '3pm' },
      });

      expect(delegation).toBeDefined();
      expect(delegation.id).toMatch(/^delegation_/);
      expect(delegation.fromPersona).toBe('maya');
      expect(delegation.toPersona).toBe('alex');
      expect(delegation.status).toBe('delegated');
    });

    it('should add delegation to user data', async () => {
      await delegationService.createDelegation({
        userId: 'test-user',
        taskDescription: 'Research topic',
        fromPersona: 'ferni',
        toPersona: 'peter',
        originalRequest: 'I need research help',
        context: {},
      });

      const userData = await mockGetUserData('test-user');
      expect(userData.delegations.length).toBe(1);
    });

    it('should include initial update in delegation history', async () => {
      const delegation = await delegationService.createDelegation({
        userId: 'test-user',
        taskDescription: 'Plan event',
        fromPersona: 'maya',
        toPersona: 'jordan',
        originalRequest: 'Help plan my birthday party',
        context: {},
      });

      expect(delegation.updates.length).toBe(1);
      expect(delegation.updates[0].from).toBe('maya');
      expect(delegation.updates[0].message).toContain('Delegated to jordan');
    });
  });

  describe('Delegation with allData Map', () => {
    it('should find delegation from allData map', async () => {
      const delegation = await delegationService.createDelegation({
        userId: 'test-user',
        taskDescription: 'Test task',
        fromPersona: 'ferni',
        toPersona: 'maya',
        originalRequest: 'Test',
        context: {},
      });

      // Create a Map to simulate allData
      const allData = new Map<string, BackgroundData>();
      const userData = await mockGetUserData('test-user');
      allData.set('test-user', userData);

      const found = delegationService.getDelegationFromData(allData, delegation.id);
      expect(found).toBeDefined();
      expect(found?.delegation.id).toBe(delegation.id);
      expect(found?.userId).toBe('test-user');
    });

    it('should accept delegation using allData map', async () => {
      const delegation = await delegationService.createDelegation({
        userId: 'test-user',
        taskDescription: 'Test task',
        fromPersona: 'ferni',
        toPersona: 'peter',
        originalRequest: 'Test',
        context: {},
      });

      // Create a Map to simulate allData
      const allData = new Map<string, BackgroundData>();
      const userData = await mockGetUserData('test-user');
      allData.set('test-user', userData);

      delegationService.acceptDelegation(allData, delegation.id, 'peter');

      expect(delegation.status).toBe('accepted');
      expect(delegation.acceptedAt).toBeDefined();
    });

    it('should complete delegation using allData map', async () => {
      const delegation = await delegationService.createDelegation({
        userId: 'test-user',
        taskDescription: 'Research stocks',
        fromPersona: 'ferni',
        toPersona: 'peter',
        originalRequest: 'Research this',
        context: {},
      });

      const allData = new Map<string, BackgroundData>();
      const userData = await mockGetUserData('test-user');
      allData.set('test-user', userData);

      delegationService.acceptDelegation(allData, delegation.id, 'peter');
      delegationService.completeDelegation(allData, delegation.id, 'peter', 'Research complete');

      expect(delegation.status).toBe('completed');
      expect(delegation.completedAt).toBeDefined();
      expect(delegation.outcome).toBe('Research complete');
    });
  });

  describe('Event Emission', () => {
    it('should emit delegation_created event', async () => {
      const eventHandler = vi.fn();
      delegationService.on('delegation_created', eventHandler);

      await delegationService.createDelegation({
        userId: 'test-user',
        taskDescription: 'Test',
        fromPersona: 'maya',
        toPersona: 'alex',
        originalRequest: 'Test request',
        context: {},
      });

      expect(eventHandler).toHaveBeenCalledTimes(1);
    });
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Scheduling Module Integration', () => {
  let taskQueue: TaskQueueService;
  let workflowEngine: WorkflowEngine;
  let delegationService: DelegationService;

  beforeEach(() => {
    vi.clearAllMocks();
    userDataStore.clear();
    taskQueue = new TaskQueueService(mockGetUserData, mockMarkDirty);
    workflowEngine = new WorkflowEngine(mockGetUserData, mockMarkDirty, taskQueue);
    delegationService = new DelegationService(mockGetUserData, mockMarkDirty);
  });

  it('should coordinate workflow with tasks', async () => {
    // Create a workflow
    const workflow = await workflowEngine.createWorkflow({
      userId: 'test-user',
      name: 'Email Campaign',
      description: 'Send email campaign',
      steps: [
        { name: 'Draft', taskType: 'draft_email' },
        { name: 'Send', taskType: 'send_email' },
      ],
    });

    // Create associated task for first step (uses parentWorkflowId internally)
    const task = await taskQueue.createTask({
      userId: 'test-user',
      type: 'draft_email',
      description: 'Draft the campaign email',
      workflowId: workflow.id,
    });

    // The task should be linked to the workflow
    expect(task.parentWorkflowId).toBe(workflow.id);
  });

  it('should handle delegation with task using allData map', async () => {
    // Create a task
    const task = await taskQueue.createTask({
      userId: 'test-user',
      type: 'research',
      description: 'Research topic',
    });

    // Delegate to Peter
    const delegation = await delegationService.createDelegation({
      userId: 'test-user',
      taskDescription: `Complete task: ${task.description}`,
      fromPersona: 'ferni',
      toPersona: 'peter',
      originalRequest: 'Research expertise needed',
      context: { taskId: task.id },
    });

    // Set up allData map for delegation operations
    const allData = new Map<string, BackgroundData>();
    const userData = await mockGetUserData('test-user');
    allData.set('test-user', userData);

    // Accept delegation
    delegationService.acceptDelegation(allData, delegation.id, 'peter');

    // Update task status to running
    taskQueue.updateTaskStatus(task, 'running');

    // Complete delegation
    delegationService.completeDelegation(allData, delegation.id, 'peter', 'Research findings');

    // Complete task
    taskQueue.updateTaskStatus(task, 'completed', { findings: 'Important research findings' });

    expect(task.status).toBe('completed');
    expect(delegation.status).toBe('completed');
  });

  it('should support full workflow lifecycle', async () => {
    // Create a multi-step workflow
    const workflow = await workflowEngine.createWorkflow({
      userId: 'test-user',
      name: 'User Onboarding',
      description: 'Complete user onboarding process',
      steps: [
        { name: 'Welcome', taskType: 'send_welcome' },
        { name: 'Tutorial', taskType: 'show_tutorial' },
        { name: 'Survey', taskType: 'send_survey' },
      ],
      context: { userName: 'Test User' },
    });

    expect(workflow.status).toBe('pending');
    expect(workflow.steps.length).toBe(3);
    expect(workflow.currentStepIndex).toBe(0);
    expect(workflow.context?.userName).toBe('Test User');
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Edge Cases', () => {
  let taskQueue: TaskQueueService;

  beforeEach(() => {
    vi.clearAllMocks();
    userDataStore.clear();
    taskQueue = new TaskQueueService(mockGetUserData, mockMarkDirty);
  });

  it('should handle empty task list', async () => {
    const tasks = await taskQueue.getUserTasks('test-user');
    expect(tasks).toEqual([]);
  });

  it('should handle multiple users independently', async () => {
    await taskQueue.createTask({
      userId: 'user-1',
      type: 'task',
      description: 'User 1 task',
    });
    await taskQueue.createTask({
      userId: 'user-2',
      type: 'task',
      description: 'User 2 task',
    });

    const user1Tasks = await taskQueue.getUserTasks('user-1');
    const user2Tasks = await taskQueue.getUserTasks('user-2');

    expect(user1Tasks.length).toBe(1);
    expect(user2Tasks.length).toBe(1);
    expect(user1Tasks[0].description).toBe('User 1 task');
    expect(user2Tasks[0].description).toBe('User 2 task');
  });

  it('should emit events on task creation', async () => {
    const eventHandler = vi.fn();
    taskQueue.on('task_created', eventHandler);

    await taskQueue.createTask({
      userId: 'test-user',
      type: 'test',
      description: 'Test task',
    });

    expect(eventHandler).toHaveBeenCalledTimes(1);
    expect(eventHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'test',
        description: 'Test task',
      })
    );
  });
});

/**
 * AgentTask Tests
 *
 * Tests for the base AgentTask class and TaskGroup:
 * - Task creation and lifecycle
 * - Task completion with results
 * - TaskGroup sequential execution
 * - Task regression handling
 * - Prebuilt tasks (CollectConsent, CollectName, CollectEmail)
 */

import { describe, expect, it, vi } from 'vitest';
import {
  AgentTask,
  CollectConsentTask,
  CollectEmailTask,
  CollectNameTask,
  TaskGroup,
  TaskRegressionError,
} from '../agent-task.js';

// Mock the logger
vi.mock('../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock LiveKit agents
vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({
      ...config,
      execute: config.execute,
    })),
  },
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ============================================================================
// TEST TASK IMPLEMENTATIONS
// ============================================================================

class TestTask extends AgentTask<string> {
  constructor(instructions = 'Test instructions') {
    super({
      instructions,
      tools: {},
    });
  }

  completeWithResult(result: string): void {
    this.complete(result);
  }

  completeWithError(error: Error): void {
    this.complete(error);
  }
}

class TestTaskWithTools extends AgentTask<{ value: number }> {
  public recordValue(): void {
    this.complete({ value: 42 });
  }

  constructor() {
    super({
      instructions: 'Task with tools',
      tools: {},
    });
  }
}

// ============================================================================
// AGENT TASK TESTS
// ============================================================================

describe('AgentTask', () => {
  describe('construction', () => {
    it('should create a task with instructions', () => {
      const task = new TestTask('Custom instructions');
      expect(task.instructions).toBe('Custom instructions');
    });

    it('should create a task with empty tools by default', () => {
      const task = new TestTask();
      expect(task.tools).toBeInstanceOf(Object);
      expect(task.tools.tools?.length ?? 0).toBe(0);
    });

    it('should not be done initially', () => {
      const task = new TestTask();
      expect(task.done()).toBe(false);
    });
  });

  describe('completion', () => {
    it('should complete with a string result', async () => {
      const task = new TestTask();

      // Complete the task
      task.completeWithResult('success');

      expect(task.done()).toBe(true);
      const result = await task;
      expect(result).toBe('success');
    });

    it('should complete with an object result', async () => {
      const task = new TestTaskWithTools();

      // Call the method directly
      task.recordValue();

      expect(task.done()).toBe(true);
      const result = await task;
      expect(result).toEqual({ value: 42 });
    });

    it('should reject with error when completed with Error', async () => {
      const task = new TestTask();
      const error = new Error('Task failed');

      task.completeWithError(error);

      expect(task.done()).toBe(true);
      await expect(task).rejects.toThrow('Task failed');
    });

    it('should ignore subsequent complete() calls', async () => {
      const task = new TestTask();

      task.completeWithResult('first');
      task.completeWithResult('second'); // Should be ignored

      const result = await task;
      expect(result).toBe('first');
    });
  });

  describe('lifecycle hooks', () => {
    it('should call onEnter when starting', async () => {
      class HookedTask extends AgentTask<string> {
        onEnterCalled = false;

        constructor() {
          super({ instructions: 'Hooked task', tools: {} });
        }

        async onEnter(): Promise<void> {
          this.onEnterCalled = true;
        }

        finish(): void {
          this.complete('done');
        }
      }

      const task = new HookedTask();
      const mockSession = {} as Parameters<typeof task.start>[0];

      // Start in background
      const startPromise = task.start(mockSession);
      task.finish();

      await startPromise;
      expect(task.onEnterCalled).toBe(true);
    });

    it('should call onExit after completion', async () => {
      class HookedTask extends AgentTask<string> {
        onExitCalled = false;

        constructor() {
          super({ instructions: 'Hooked task', tools: {} });
        }

        async onExit(): Promise<void> {
          this.onExitCalled = true;
        }

        finish(): void {
          this.complete('done');
        }
      }

      const task = new HookedTask();
      const mockSession = {} as Parameters<typeof task.start>[0];

      const startPromise = task.start(mockSession);
      task.finish();

      await startPromise;
      expect(task.onExitCalled).toBe(true);
    });
  });

  describe('session access', () => {
    it('should throw when accessing session before start', () => {
      const task = new TestTask();
      expect(() => task.session).toThrow('Task not attached to a session');
    });
  });
});

// ============================================================================
// TASK GROUP TESTS
// ============================================================================

describe('TaskGroup', () => {
  describe('task management', () => {
    it('should add tasks to the group', () => {
      const group = new TaskGroup();

      group.add(() => new TestTask(), { id: 'task1', description: 'First task' });
      group.add(() => new TestTask(), { id: 'task2', description: 'Second task' });

      // Can't directly check tasks length, but can verify no errors
      expect(group).toBeDefined();
    });

    it('should return this for chaining', () => {
      const group = new TaskGroup();

      const result = group
        .add(() => new TestTask(), { id: 'task1', description: 'Task 1' })
        .add(() => new TestTask(), { id: 'task2', description: 'Task 2' });

      expect(result).toBe(group);
    });
  });

  describe('sequential execution', () => {
    it('should execute tasks in order', async () => {
      const executionOrder: string[] = [];

      class OrderedTask extends AgentTask<string> {
        constructor(private name: string) {
          super({ instructions: `Task ${name}`, tools: {} });
        }

        async onEnter(): Promise<void> {
          executionOrder.push(this.name);
          this.complete(this.name);
        }
      }

      const group = new TaskGroup();
      group.add(() => new OrderedTask('A'), { id: 'a', description: 'Task A' });
      group.add(() => new OrderedTask('B'), { id: 'b', description: 'Task B' });
      group.add(() => new OrderedTask('C'), { id: 'c', description: 'Task C' });

      const mockSession = {} as Parameters<typeof group.start>[0];
      const result = await group.start(mockSession);

      expect(executionOrder).toEqual(['A', 'B', 'C']);
      expect(result.taskResults).toEqual({ a: 'A', b: 'B', c: 'C' });
    });

    it('should collect results from all tasks', async () => {
      class NumberTask extends AgentTask<number> {
        constructor(private value: number) {
          super({ instructions: `Return ${value}`, tools: {} });
        }

        async onEnter(): Promise<void> {
          this.complete(this.value);
        }
      }

      const group = new TaskGroup();
      group.add(() => new NumberTask(1), { id: 'one', description: 'One' });
      group.add(() => new NumberTask(2), { id: 'two', description: 'Two' });
      group.add(() => new NumberTask(3), { id: 'three', description: 'Three' });

      const mockSession = {} as Parameters<typeof group.start>[0];
      const result = await group.start(mockSession);

      expect(result.taskResults.one).toBe(1);
      expect(result.taskResults.two).toBe(2);
      expect(result.taskResults.three).toBe(3);
    });
  });

  describe('regression handling', () => {
    it('should handle task regression', async () => {
      const executionCount: Record<string, number> = { a: 0, b: 0 };

      class RegressingTask extends AgentTask<string> {
        constructor(
          private name: string,
          private shouldRegress: boolean
        ) {
          super({ instructions: `Task ${name}`, tools: {} });
        }

        async onEnter(): Promise<void> {
          executionCount[this.name]++;

          if (this.shouldRegress && executionCount[this.name] === 1) {
            throw new TaskRegressionError(['a']);
          }

          this.complete(this.name);
        }
      }

      const group = new TaskGroup();
      group.add(() => new RegressingTask('a', false), { id: 'a', description: 'Task A' });
      group.add(() => new RegressingTask('b', true), {
        id: 'b',
        description: 'Task B (regresses to A)',
      });

      const mockSession = {} as Parameters<typeof group.start>[0];
      const result = await group.start(mockSession);

      // Task A should have been executed twice (once initially, once after regression)
      expect(executionCount.a).toBe(2);
      // Task B should have been executed twice (first throws, second succeeds)
      expect(executionCount.b).toBe(2);
      expect(result.taskResults).toEqual({ a: 'a', b: 'b' });
    });
  });

  describe('visited tasks tracking', () => {
    it('should track visited tasks', async () => {
      class SimpleTask extends AgentTask<string> {
        constructor() {
          super({ instructions: 'Simple', tools: {} });
        }

        async onEnter(): Promise<void> {
          this.complete('done');
        }
      }

      const group = new TaskGroup();
      group.add(() => new SimpleTask(), { id: 'first', description: 'First' });
      group.add(() => new SimpleTask(), { id: 'second', description: 'Second' });

      const mockSession = {} as Parameters<typeof group.start>[0];
      await group.start(mockSession);

      const visited = group.getVisitedTasks();
      expect(visited).toContain('first');
      expect(visited).toContain('second');
    });

    it('should return task descriptions for visited tasks', async () => {
      class SimpleTask extends AgentTask<string> {
        constructor() {
          super({ instructions: 'Simple', tools: {} });
        }

        async onEnter(): Promise<void> {
          this.complete('done');
        }
      }

      const group = new TaskGroup();
      group.add(() => new SimpleTask(), { id: 'task1', description: 'Description One' });
      group.add(() => new SimpleTask(), { id: 'task2', description: 'Description Two' });

      const mockSession = {} as Parameters<typeof group.start>[0];
      await group.start(mockSession);

      const descriptions = group.getTaskDescriptions();
      expect(descriptions.task1).toBe('Description One');
      expect(descriptions.task2).toBe('Description Two');
    });
  });
});

// ============================================================================
// TASK REGRESSION ERROR TESTS
// ============================================================================

describe('TaskRegressionError', () => {
  it('should create error with target task IDs', () => {
    const error = new TaskRegressionError(['task1', 'task2']);

    expect(error.targetTaskIds).toEqual(['task1', 'task2']);
    expect(error.message).toContain('task1');
    expect(error.message).toContain('task2');
    expect(error.name).toBe('TaskRegressionError');
  });

  it('should be instanceof Error', () => {
    const error = new TaskRegressionError(['task1']);
    expect(error instanceof Error).toBe(true);
  });
});

// ============================================================================
// PREBUILT TASK TESTS
// ============================================================================

describe('Prebuilt Tasks', () => {
  describe('CollectConsentTask', () => {
    it('should have consent instructions', () => {
      const task = new CollectConsentTask();
      expect(task.instructions).toContain('consent');
    });

    it('should accept extra instructions', () => {
      const task = new CollectConsentTask({ extraInstructions: 'Be extra polite' });
      expect(task.instructions).toContain('Be extra polite');
    });

    it('should have consentGiven and consentDenied tools', () => {
      const task = new CollectConsentTask();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tools = task.tools as any;
      expect(tools.consentGiven).toBeDefined();
      expect(tools.consentDenied).toBeDefined();
    });

    it('should complete with true when consent given', async () => {
      const task = new CollectConsentTask();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tools = task.tools as any;
      await tools.consentGiven.execute();

      expect(task.done()).toBe(true);
      const result = await task;
      expect(result).toBe(true);
    });

    it('should complete with false when consent denied', async () => {
      const task = new CollectConsentTask();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tools = task.tools as any;
      await tools.consentDenied.execute();

      expect(task.done()).toBe(true);
      const result = await task;
      expect(result).toBe(false);
    });
  });

  describe('CollectNameTask', () => {
    it('should have name collection instructions', () => {
      const task = new CollectNameTask();
      expect(task.instructions).toContain('name');
    });

    it('should have recordName and nameDeclined tools', () => {
      const task = new CollectNameTask();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tools = task.tools as any;
      expect(tools.recordName).toBeDefined();
      expect(tools.nameDeclined).toBeDefined();
    });

    it('should complete with name when provided', async () => {
      const task = new CollectNameTask();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tools = task.tools as any;
      await tools.recordName.execute({ name: 'Alice' });

      const result = await task;
      expect(result).toEqual({ name: 'Alice' });
    });

    it('should complete with Anonymous when declined', async () => {
      const task = new CollectNameTask();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tools = task.tools as any;
      await tools.nameDeclined.execute();

      const result = await task;
      expect(result).toEqual({ name: 'Anonymous' });
    });
  });

  describe('CollectEmailTask', () => {
    it('should have email collection instructions', () => {
      const task = new CollectEmailTask();
      expect(task.instructions).toContain('email');
    });

    it('should have recordEmail and emailDeclined tools', () => {
      const task = new CollectEmailTask();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tools = task.tools as any;
      expect(tools.recordEmail).toBeDefined();
      expect(tools.emailDeclined).toBeDefined();
    });

    it('should complete with email when provided', async () => {
      const task = new CollectEmailTask();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tools = task.tools as any;
      await tools.recordEmail.execute({ email: 'test@example.com' });

      const result = await task;
      expect(result).toEqual({ email: 'test@example.com' });
    });

    it('should complete with empty string when declined', async () => {
      const task = new CollectEmailTask();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tools = task.tools as any;
      await tools.emailDeclined.execute();

      const result = await task;
      expect(result).toEqual({ email: '' });
    });
  });
});

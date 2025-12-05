/**
 * AgentTask Implementation for Node.js
 *
 * A simplified port of LiveKit's Python AgentTask for use in Node.js agents.
 * Tasks are focused, reusable units that perform a specific objective and return a typed result.
 *
 * Based on: https://docs.livekit.io/agents/build/tasks.md
 * Python source: https://github.com/livekit/agents
 */

import { llm, voice, log } from '@livekit/agents';
import { getLogger } from '../utils/safe-logger.js';
import { z } from 'zod';

/**
 * Base class for creating tasks that can be awaited for a typed result.
 *
 * @example
 * ```typescript
 * class CollectNameTask extends AgentTask<string> {
 *   constructor() {
 *     super({
 *       instructions: 'Ask for the user\'s name and confirm it.',
 *       tools: {
 *         recordName: llm.tool({
 *           description: 'Record the user\'s name',
 *           parameters: z.object({ name: z.string() }),
 *           execute: async ({ name }) => {
 *             this.complete(name);
 *             return `Recorded name: ${name}`;
 *           },
 *         }),
 *       },
 *     });
 *   }
 *
 *   async onEnter(): Promise<void> {
 *     await this.session.generateReply({
 *       instructions: 'Ask the user for their name.',
 *     });
 *   }
 * }
 * ```
 */
export abstract class AgentTask<TResult> {
  protected _instructions: string;
  protected _tools: llm.ToolContext<any>;
  private _promise: Promise<TResult>;
  private _resolve!: (value: TResult) => void;
  private _reject!: (reason: any) => void;
  private _completed = false;
  protected _session?: voice.AgentSession<any>;

  constructor(options: { instructions: string; tools?: llm.ToolContext<any> }) {
    this._instructions = options.instructions;
    this._tools = options.tools || {};

    // Create a promise that will be resolved when the task completes
    this._promise = new Promise<TResult>((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
  }

  /**
   * Get the task's instructions
   */
  get instructions(): string {
    return this._instructions;
  }

  /**
   * Get the task's tools
   */
  get tools(): llm.ToolContext<any> {
    return this._tools;
  }

  /**
   * Get the session (if attached)
   */
  get session(): voice.AgentSession<any> {
    if (!this._session) {
      throw new Error('Task not attached to a session');
    }
    return this._session;
  }

  /**
   * Check if the task is done
   */
  done(): boolean {
    return this._completed;
  }

  /**
   * Complete the task with a result or error
   */
  complete(result: TResult | Error): void {
    if (this._completed) {
      getLogger().warn('Task already completed, ignoring subsequent complete() call');
      return;
    }

    this._completed = true;

    if (result instanceof Error) {
      this._reject(result);
    } else {
      this._resolve(result);
    }

    getLogger().info(`Task completed with result: ${JSON.stringify(result)}`);
  }

  /**
   * Called when the task starts. Override to provide initial greeting or instructions.
   */
  async onEnter(): Promise<void> {
    // Override in subclass
  }

  /**
   * Called when the task exits. Override for cleanup.
   */
  async onExit(): Promise<void> {
    // Override in subclass
  }

  /**
   * Attach the task to a session and start it
   */
  async start(session: voice.AgentSession<any>): Promise<TResult> {
    this._session = session;

    getLogger().info(`Starting task: ${this.constructor.name}`);

    // Call onEnter
    await this.onEnter();

    // Wait for completion
    const result = await this._promise;

    // Call onExit
    await this.onExit();

    return result;
  }

  /**
   * Make the task awaitable
   */
  then<TResult1 = TResult, TResult2 = never>(
    onfulfilled?: ((value: TResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this._promise.then(onfulfilled, onrejected);
  }
}

/**
 * Result from a TaskGroup execution
 */
export interface TaskGroupResult {
  taskResults: Record<string, any>;
}

/**
 * Factory function type for creating tasks
 */
type TaskFactory<T> = () => AgentTask<T>;

/**
 * Task info stored in the group
 */
interface TaskInfo {
  factory: TaskFactory<any>;
  id: string;
  description: string;
}

/**
 * TaskGroup for executing multiple tasks in sequence with regression support.
 *
 * @example
 * ```typescript
 * const group = new TaskGroup();
 * group.add(() => new CollectEmailTask(), { id: 'email', description: 'Collect email' });
 * group.add(() => new CollectAddressTask(), { id: 'address', description: 'Collect address' });
 *
 * const results = await group.start(session);
 * console.log(results.taskResults.email); // email result
 * console.log(results.taskResults.address); // address result
 * ```
 */
export class TaskGroup {
  private _tasks: Map<string, TaskInfo> = new Map();
  private _taskOrder: string[] = [];
  private _visitedTasks: Set<string> = new Set();
  private _session?: voice.AgentSession<any>;

  /**
   * Add a task to the group
   */
  add<T>(factory: TaskFactory<T>, options: { id: string; description: string }): this {
    this._tasks.set(options.id, {
      factory,
      id: options.id,
      description: options.description,
    });
    this._taskOrder.push(options.id);
    return this;
  }

  /**
   * Execute all tasks in order
   */
  async start(session: voice.AgentSession<any>): Promise<TaskGroupResult> {
    this._session = session;
    const taskResults: Record<string, any> = {};
    const taskStack = [...this._taskOrder];

    while (taskStack.length > 0) {
      const taskId = taskStack.shift()!;
      const taskInfo = this._tasks.get(taskId);

      if (!taskInfo) {
        getLogger().error(`Task not found: ${taskId}`);
        continue;
      }

      getLogger().info(`TaskGroup: Starting task "${taskId}"`);

      // Create task instance
      const task = taskInfo.factory();
      this._visitedTasks.add(taskId);

      try {
        const result = await task.start(session);
        taskResults[taskId] = result;
        getLogger().info(`TaskGroup: Task "${taskId}" completed`);
      } catch (error) {
        // Check if it's a regression request
        if (error instanceof TaskRegressionError) {
          getLogger().info(
            `TaskGroup: Regression requested to tasks: ${error.targetTaskIds.join(', ')}`
          );
          // Re-add current task to front
          taskStack.unshift(taskId);
          // Add regression targets to front (in reverse order so they execute in order)
          for (const targetId of error.targetTaskIds.reverse()) {
            taskStack.unshift(targetId);
          }
          continue;
        }

        getLogger().error(`TaskGroup: Task "${taskId}" failed`, error);
        throw error;
      }
    }

    return { taskResults };
  }

  /**
   * Get visited task IDs (for building regression tools)
   */
  getVisitedTasks(): string[] {
    return Array.from(this._visitedTasks);
  }

  /**
   * Get task descriptions for building regression tools
   */
  getTaskDescriptions(): Record<string, string> {
    const descriptions: Record<string, string> = {};
    for (const [id, info] of this._tasks) {
      if (this._visitedTasks.has(id)) {
        descriptions[id] = info.description;
      }
    }
    return descriptions;
  }
}

/**
 * Error thrown to trigger task regression
 */
export class TaskRegressionError extends Error {
  constructor(public targetTaskIds: string[]) {
    super(`Regression requested to: ${targetTaskIds.join(', ')}`);
    this.name = 'TaskRegressionError';
  }
}

// ============================================================================
// PREBUILT TASKS
// ============================================================================

/**
 * Result from consent collection
 */
export type ConsentResult = boolean;

/**
 * Prebuilt task for collecting recording consent
 */
export class CollectConsentTask extends AgentTask<ConsentResult> {
  constructor(options?: { extraInstructions?: string }) {
    const baseInstructions = `Ask for recording consent and get a clear yes or no answer. Be polite and professional.`;

    super({
      instructions: options?.extraInstructions
        ? `${baseInstructions}\n\n${options.extraInstructions}`
        : baseInstructions,
      tools: {
        consentGiven: llm.tool({
          description: 'Use this when the user gives consent to record.',
          parameters: z.object({}),
          execute: async () => {
            this.complete(true);
            return 'Consent recorded.';
          },
        }),
        consentDenied: llm.tool({
          description: 'Use this when the user denies consent to record.',
          parameters: z.object({}),
          execute: async () => {
            this.complete(false);
            return 'Consent denied.';
          },
        }),
      },
    });
  }

  async onEnter(): Promise<void> {
    // The session.generateReply would be called by the parent agent
    // In our simplified version, we just log
    getLogger().info('CollectConsentTask: Waiting for consent response');
  }
}

/**
 * Result from name collection
 */
export interface NameResult {
  name: string;
}

/**
 * Prebuilt task for collecting a user's name
 */
export class CollectNameTask extends AgentTask<NameResult> {
  constructor(options?: { extraInstructions?: string }) {
    const baseInstructions = `Ask for the user's name. Confirm you heard it correctly.`;

    super({
      instructions: options?.extraInstructions
        ? `${baseInstructions}\n\n${options.extraInstructions}`
        : baseInstructions,
      tools: {
        recordName: llm.tool({
          description: "Record the user's name after they provide it.",
          parameters: z.object({
            name: z.string().describe("The user's name"),
          }),
          execute: async ({ name }) => {
            this.complete({ name });
            return `Recorded name: ${name}`;
          },
        }),
        nameDeclined: llm.tool({
          description: 'Use when the user declines to provide their name.',
          parameters: z.object({}),
          execute: async () => {
            this.complete({ name: 'Anonymous' });
            return 'User declined to provide name.';
          },
        }),
      },
    });
  }

  async onEnter(): Promise<void> {
    getLogger().info('CollectNameTask: Waiting for name');
  }
}

/**
 * Result from email collection
 */
export interface EmailResult {
  email: string;
}

/**
 * Prebuilt task for collecting an email address
 */
export class CollectEmailTask extends AgentTask<EmailResult> {
  constructor(options?: { extraInstructions?: string }) {
    const baseInstructions = `Collect the user's email address. Spell it back to confirm.`;

    super({
      instructions: options?.extraInstructions
        ? `${baseInstructions}\n\n${options.extraInstructions}`
        : baseInstructions,
      tools: {
        recordEmail: llm.tool({
          description: "Record the user's email address after confirmation.",
          parameters: z.object({
            email: z.string().email().describe("The user's email address"),
          }),
          execute: async ({ email }) => {
            this.complete({ email });
            return `Recorded email: ${email}`;
          },
        }),
        emailDeclined: llm.tool({
          description: 'Use when the user declines to provide an email.',
          parameters: z.object({}),
          execute: async () => {
            this.complete({ email: '' });
            return 'User declined to provide email.';
          },
        }),
      },
    });
  }

  async onEnter(): Promise<void> {
    getLogger().info('CollectEmailTask: Waiting for email');
  }
}

export default {
  AgentTask,
  TaskGroup,
  TaskRegressionError,
  CollectConsentTask,
  CollectNameTask,
  CollectEmailTask,
};

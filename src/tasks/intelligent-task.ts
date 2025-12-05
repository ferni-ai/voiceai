/**
 * Intelligent Task Base Class
 *
 * An enhanced AgentTask that integrates with the intelligence layer
 * for emotion-aware, context-aware, and adaptive task execution.
 */

import { llm, voice, log } from '@livekit/agents';
import { getLogger } from '../utils/safe-logger.js';
import { z } from 'zod';
import { AgentTask, TaskRegressionError } from './agent-task.js';
import type { SessionServices, ConversationAnalysis } from '../services/index.js';
import type { EmotionResult } from '../intelligence/emotion-detector.js';
import type { IntentResult } from '../intelligence/intent-classifier.js';
import type { ConversationState } from '../intelligence/conversation-state.js';

// ============================================================================
// TYPES
// ============================================================================

export interface TaskContext {
  services?: SessionServices;
  userId?: string;
  userName?: string;
  isReturningUser?: boolean;
  lastAnalysis?: ConversationAnalysis;
  turnCount?: number;
}

export interface AdaptiveInstructions {
  base: string;
  ifDistressed?: string;
  ifHappy?: string;
  ifReturning?: string;
  ifNew?: string;
  ifAnxious?: string;
  ifCurious?: string;
}

// ============================================================================
// INTELLIGENT TASK BASE CLASS
// ============================================================================

/**
 * IntelligentTask - A task that adapts to emotional and contextual signals.
 *
 * Features:
 * - Automatic instruction adaptation based on user emotion
 * - Integration with memory system
 * - Awareness of conversation phase
 * - Support for emotional state changes during task
 */
export abstract class IntelligentTask<TResult> extends AgentTask<TResult> {
  protected _context: TaskContext = {};
  protected _adaptiveInstructions: AdaptiveInstructions;
  protected _emotionThreshold: number = 0.5; // Distress level to trigger support mode
  protected _inSupportMode: boolean = false;

  constructor(options: {
    instructions: string | AdaptiveInstructions;
    tools?: llm.ToolContext<any>;
    emotionThreshold?: number;
  }) {
    // If string, convert to adaptive format
    const adaptive: AdaptiveInstructions =
      typeof options.instructions === 'string'
        ? { base: options.instructions }
        : options.instructions;

    super({
      instructions: adaptive.base,
      tools: options.tools,
    });

    this._adaptiveInstructions = adaptive;
    this._emotionThreshold = options.emotionThreshold ?? 0.5;
  }

  /**
   * Set the task context (called before start)
   */
  setContext(context: TaskContext): void {
    this._context = context;
    this._updateInstructions();
  }

  /**
   * Get current instructions based on context
   */
  protected _updateInstructions(): void {
    const ai = this._adaptiveInstructions;
    let instructions = ai.base;

    // Add returning user context
    if (this._context.isReturningUser && ai.ifReturning) {
      instructions += `\n\n${ai.ifReturning}`;
    } else if (!this._context.isReturningUser && ai.ifNew) {
      instructions += `\n\n${ai.ifNew}`;
    }

    // Check last emotional analysis
    const lastEmotion = this._context.lastAnalysis?.emotion;
    if (lastEmotion) {
      if (lastEmotion.distressLevel > this._emotionThreshold && ai.ifDistressed) {
        instructions += `\n\n${ai.ifDistressed}`;
        this._inSupportMode = true;
      } else if (lastEmotion.valence === 'positive' && ai.ifHappy) {
        instructions += `\n\n${ai.ifHappy}`;
      } else if (lastEmotion.primary === 'fear' && ai.ifAnxious) {
        instructions += `\n\n${ai.ifAnxious}`;
      } else if (lastEmotion.primary === 'anticipation' && ai.ifCurious) {
        instructions += `\n\n${ai.ifCurious}`;
      }
    }

    // Add user context
    if (this._context.userName) {
      instructions += `\n\nUser's name: ${this._context.userName}. Use their name warmly.`;
    }

    this._instructions = instructions;
  }

  /**
   * Analyze a user message during the task
   */
  protected analyzeMessage(message: string): ConversationAnalysis | null {
    if (this._context.services) {
      const analysis = this._context.services.analyze(message);
      this._context.lastAnalysis = analysis;

      // Check if we need to enter support mode
      if (analysis.emotion.distressLevel > this._emotionThreshold && !this._inSupportMode) {
        this._inSupportMode = true;
        getLogger().info('IntelligentTask: Entering support mode due to distress');

        // Capture this significant moment in the learning engine
        this._context.services.captureInsight(
          'emotional_pattern',
          'distress_during_task',
          { taskType: this.constructor.name, distressLevel: analysis.emotion.distressLevel },
          0.8
        );
      }

      return analysis;
    }
    return null;
  }

  /**
   * Remember something important about the user
   * Now actually captures to the learning engine
   */
  protected async remember(fact: string, category: string): Promise<void> {
    if (this._context.services) {
      getLogger().info(`Remembering: [${category}] ${fact}`);

      // Map category to learning insight type
      const typeMap: Record<string, string> = {
        personal: 'preference',
        family: 'relationship',
        goal: 'goal',
        concern: 'concern',
        topic: 'topic_interest',
        emotion: 'emotional_pattern',
        communication: 'communication_style',
      };

      const insightType = typeMap[category.toLowerCase()] || 'preference';
      this._context.services.captureInsight(insightType, `task_${category}`, fact, 0.7);
    }
  }

  /**
   * Get context for response generation
   */
  protected getPromptContext(): string {
    if (this._context.services) {
      return this._context.services.getPromptContext().formattedForPrompt;
    }
    return '';
  }

  /**
   * Check if user is in distress
   */
  protected isUserDistressed(): boolean {
    const emotion = this._context.lastAnalysis?.emotion;
    return emotion ? emotion.distressLevel > this._emotionThreshold : false;
  }

  /**
   * Get user's current emotion
   */
  protected getUserEmotion(): EmotionResult | null {
    return this._context.lastAnalysis?.emotion || null;
  }

  /**
   * Get user's intent
   */
  protected getUserIntent(): IntentResult | null {
    return this._context.lastAnalysis?.intent || null;
  }

  /**
   * Override start to set context
   */
  async start(session: voice.AgentSession<any>, context?: TaskContext): Promise<TResult> {
    if (context) {
      this.setContext(context);
    }
    return super.start(session);
  }
}

// ============================================================================
// INTELLIGENT TASK GROUP
// ============================================================================

/**
 * IntelligentTaskGroup - A task group that shares context across tasks
 * and can dynamically insert support tasks when needed.
 */
export class IntelligentTaskGroup {
  private _tasks: Map<
    string,
    {
      factory: () => IntelligentTask<any>;
      id: string;
      description: string;
      priority?: number;
      skipIfDistressed?: boolean;
      requiredIfDistressed?: boolean;
    }
  > = new Map();
  private _taskOrder: string[] = [];
  private _context: TaskContext = {};
  private _supportTaskFactory?: () => IntelligentTask<any>;

  /**
   * Set the shared context for all tasks
   */
  setContext(context: TaskContext): void {
    this._context = context;
  }

  /**
   * Set a support task to be triggered when user becomes distressed
   */
  setSupportTask(factory: () => IntelligentTask<any>): void {
    this._supportTaskFactory = factory;
  }

  /**
   * Add a task to the group
   */
  add<T>(
    factory: () => IntelligentTask<T>,
    options: {
      id: string;
      description: string;
      priority?: number;
      skipIfDistressed?: boolean;
      requiredIfDistressed?: boolean;
    }
  ): this {
    this._tasks.set(options.id, {
      factory,
      ...options,
    });
    this._taskOrder.push(options.id);
    return this;
  }

  /**
   * Execute all tasks with intelligent interruption handling
   */
  async start(session: voice.AgentSession<any>): Promise<Record<string, any>> {
    const results: Record<string, any> = {};
    const taskStack = [...this._taskOrder];
    let supportModeActive = false;

    while (taskStack.length > 0) {
      const taskId = taskStack.shift()!;
      const taskInfo = this._tasks.get(taskId);

      if (!taskInfo) continue;

      // Check if we should skip this task in distress mode
      if (supportModeActive && taskInfo.skipIfDistressed) {
        getLogger().info(`Skipping task "${taskId}" due to user distress`);
        continue;
      }

      // Create task with context
      const task = taskInfo.factory();
      task.setContext(this._context);

      getLogger().info(`IntelligentTaskGroup: Starting task "${taskId}"`);

      try {
        const result = await task.start(session);
        results[taskId] = result;

        // Check if emotional state changed
        if (
          this._context.lastAnalysis?.emotion?.distressLevel &&
          this._context.lastAnalysis.emotion.distressLevel > 0.6
        ) {
          if (!supportModeActive && this._supportTaskFactory) {
            getLogger().info('IntelligentTaskGroup: Triggering support task');
            supportModeActive = true;

            // Insert support task at front
            const supportTask = this._supportTaskFactory();
            supportTask.setContext(this._context);
            await supportTask.start(session);
          }
        }
      } catch (error) {
        if (error instanceof TaskRegressionError) {
          // Handle regression
          for (const targetId of error.targetTaskIds.reverse()) {
            taskStack.unshift(targetId);
          }
          taskStack.unshift(taskId);
          continue;
        }
        throw error;
      }
    }

    return results;
  }
}

// ============================================================================
// HELPER TYPES FOR TASK CREATION
// ============================================================================

/**
 * Options for creating adaptive tools
 */
export interface AdaptiveToolOptions {
  baseResponse: string;
  distressedResponse?: string;
  enthusiasticResponse?: string;
  getContext?: () => TaskContext;
}

/**
 * Create a tool response that adapts to emotional state
 */
export function createAdaptiveResponse(options: AdaptiveToolOptions, context: TaskContext): string {
  const emotion = context.lastAnalysis?.emotion;

  if (emotion) {
    if (emotion.distressLevel > 0.5 && options.distressedResponse) {
      return options.distressedResponse;
    }
    if (emotion.valence === 'positive' && options.enthusiasticResponse) {
      return options.enthusiasticResponse;
    }
  }

  return options.baseResponse;
}

export default {
  IntelligentTask,
  IntelligentTaskGroup,
  createAdaptiveResponse,
};

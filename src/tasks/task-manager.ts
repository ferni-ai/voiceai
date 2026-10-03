/**
 * Task Manager - Non-blocking task orchestration
 *
 * Instead of blocking the conversation with awaited tasks,
 * this manager:
 * 1. Detects when tasks should be activated based on conversation context
 * 2. Injects task wisdom/instructions into the LLM prompt
 * 3. Tracks task completion based on conversation analysis
 * 4. Manages task priority and transitions
 *
 * Task wisdom is now loaded from JSON files in ./wisdom/ directory,
 * making it easier to edit, localize, and A/B test task content.
 */

import { getLogger } from '../utils/safe-logger.js';
// Import directly from types to avoid circular dependency through services/index
import type { ConversationAnalysis } from '../services/types.js';
import {
  pickEntryTransition,
  pickExitTransition,
  scriptedTaskTransitionsEnabled,
} from './task-entry-transition.js';
import { getTaskWisdom, type TaskWisdom } from './wisdom/index.js';

// Re-export TaskWisdom type for consumers
export type { TaskWisdom } from './wisdom/index.js';

export interface ActiveTask {
  wisdom: TaskWisdom;
  startedAt: Date;
  turnCount: number;
  initialDistress: number;
}

// ============================================================================
// TASK WISDOM DATABASE
// ============================================================================

/**
 * Task wisdom is now loaded from JSON files in ./wisdom/ directory.
 * This makes it easier to edit, localize, and A/B test task content.
 *
 * Use getTaskWisdom() to get all tasks, or TASK_WISDOM for backwards compatibility.
 */
export const TASK_WISDOM: TaskWisdom[] = getTaskWisdom();

// Legacy inline tasks removed - now loaded from:
// - wisdom/micro-tasks.json
// - wisdom/support-tasks.json
// - wisdom/life-events.json
// - wisdom/advice-tasks.json
// - wisdom/relationship-tasks.json
// - wisdom/domain-tasks.json
// ============================================================================
// TASK MANAGER OPTIONS
// ============================================================================

/**
 * Options for creating a TaskManager instance.
 * Supports dependency injection for better testability.
 */
export interface TaskManagerOptions {
  /**
   * Custom task wisdom to use instead of the default.
   * Useful for testing or custom task sets.
   */
  wisdom?: TaskWisdom[];

  /**
   * Custom logger instance.
   */
  logger?: ReturnType<typeof getLogger>;

  /**
   * Initial insight callback.
   */
  insightCallback?: (type: string, key: string, value: unknown, confidence: number) => void;

  /**
   * Session ID for scoping task state.
   */
  sessionId?: string;
}

// ============================================================================
// TASK MANAGER
// ============================================================================

export class TaskManager {
  private activeTasks = new Map<string, ActiveTask>();
  private completedTasks = new Set<string>();
  private readonly logger: ReturnType<typeof getLogger>;
  private readonly wisdom: TaskWisdom[];
  private readonly sessionId?: string;

  // Callback for feeding task insights to the learning engine
  private insightCallback:
    | ((type: string, key: string, value: unknown, confidence: number) => void)
    | null = null;

  /**
   * Create a new TaskManager instance.
   *
   * @param options - Configuration options for dependency injection
   *
   * @example
   * // Default usage (uses global wisdom)
   * const manager = new TaskManager();
   *
   * @example
   * // With custom wisdom for testing
   * const manager = new TaskManager({
   *   wisdom: [customTask1, customTask2],
   *   sessionId: 'test-session',
   * });
   */
  constructor(options: TaskManagerOptions = {}) {
    this.wisdom = options.wisdom ?? TASK_WISDOM;
    this.logger = options.logger ?? getLogger();
    this.sessionId = options.sessionId;
    if (options.insightCallback) {
      this.insightCallback = options.insightCallback;
    }
  }

  /**
   * Set the callback for capturing task insights
   */
  setInsightCallback(
    callback: (type: string, key: string, value: unknown, confidence: number) => void
  ): void {
    this.insightCallback = callback;
  }

  private captureInsight(type: string, key: string, value: unknown, confidence: number): void {
    if (this.insightCallback) {
      this.insightCallback(type, key, value, confidence);
    }
  }

  /**
   * Process a turn and return context to inject
   */
  processUserTurn(
    analysis: ConversationAnalysis,
    userText: string,
    context?: { isReturningUser?: boolean; lastSummary?: string }
  ): string[] {
    const contextParts: string[] = [];

    // 1. Check for task triggers
    for (const taskWisdom of this.wisdom) {
      if (this.activeTasks.has(taskWisdom.id) || this.completedTasks.has(taskWisdom.id)) {
        continue;
      }

      if (this.shouldTrigger(taskWisdom, analysis, userText)) {
        this.activateTask(taskWisdom, analysis.emotion.distressLevel);
        this.logger.info({ taskId: taskWisdom.id }, `Task activated: ${taskWisdom.name}`);
      }
    }

    // 2. Check for task completions
    for (const [taskId, activeTask] of this.activeTasks) {
      activeTask.turnCount++;

      if (this.isTaskComplete(activeTask, analysis, userText)) {
        this.completedTasks.add(taskId);
        this.activeTasks.delete(taskId);
        this.logger.info({ taskId }, `Task completed: ${activeTask.wisdom.name}`);

        // Capture task completion as an insight for learning
        const distressImprovement = activeTask.initialDistress - analysis.emotion.distressLevel;
        this.captureInsight(
          'emotional_pattern',
          `task_${taskId}_completed`,
          {
            taskName: activeTask.wisdom.name,
            category: activeTask.wisdom.category,
            turnsToComplete: activeTask.turnCount,
            distressImprovement: distressImprovement > 0 ? distressImprovement : 0,
            wasEffective: distressImprovement > 0.1,
          },
          0.8
        );

        // Canned exit line, off unless FERNI_TASK_SCRIPTED_TRANSITIONS=on.
        const exitPhrase = scriptedTaskTransitionsEnabled()
          ? pickExitTransition(activeTask.wisdom)
          : undefined;
        if (exitPhrase) contextParts.push(`[TRANSITION] Consider saying: "${exitPhrase}"`);
      }
    }

    // 3. Build context from active tasks (sorted by priority)
    const sortedTasks = Array.from(this.activeTasks.values()).sort(
      (a, b) => b.wisdom.priority - a.wisdom.priority
    );

    for (const activeTask of sortedTasks) {
      const { wisdom } = activeTask;
      let instructions = wisdom.instructions.base;

      // Add conditional instructions
      if (analysis.emotion.distressLevel > 0.5 && wisdom.instructions.ifDistressed) {
        instructions += `\n\n${wisdom.instructions.ifDistressed}`;
      } else if (analysis.emotion.valence === 'positive' && wisdom.instructions.ifPositive) {
        instructions += `\n\n${wisdom.instructions.ifPositive}`;
      }
      if (context?.isReturningUser && wisdom.instructions.ifReturning) {
        instructions += `\n\n${wisdom.instructions.ifReturning}`;
      }

      // Canned entry line on first turn, off unless FERNI_TASK_SCRIPTED_TRANSITIONS=on.
      if (activeTask.turnCount === 1 && scriptedTaskTransitionsEnabled()) {
        const entryPhrase = pickEntryTransition(wisdom, analysis);
        instructions = `[TRANSITION] Start with: "${entryPhrase}"\n\n${instructions}`;
      }

      contextParts.push(instructions);
    }

    return contextParts;
  }

  /**
   * Check if a task should be triggered
   */
  private shouldTrigger(
    wisdom: TaskWisdom,
    analysis: ConversationAnalysis,
    userText: string
  ): boolean {
    const { triggers } = wisdom;

    // Celebrations need the caller to have said what happened ("I got the job"),
    // not just sound upbeat: "It's pretty good." scored joy and fired two
    // celebration tasks on the 2026-10-03 call. FERNI_TASK_MOOD_ALONE_TRIGGERS=on
    // restores mood-only triggering.
    if (
      triggers.keywordsRequired &&
      process.env.FERNI_TASK_MOOD_ALONE_TRIGGERS !== 'on' &&
      !triggers.keywords?.test(userText)
    ) {
      return false;
    }

    // Check distress threshold
    if (triggers.distressThreshold !== undefined) {
      if (analysis.emotion.distressLevel > triggers.distressThreshold) {
        return true;
      }
    }

    // Check emotions
    if (triggers.emotions?.includes(analysis.emotion.primary)) {
      return true;
    }

    // Check intents
    if (triggers.intents?.includes(analysis.intent.primary)) {
      return true;
    }

    // Check keywords
    if (triggers.keywords?.test(userText)) {
      return true;
    }

    // Check phases
    if (triggers.phases?.includes(analysis.state.phase)) {
      return true;
    }

    // Check custom function
    if (triggers.custom?.(analysis, userText)) {
      return true;
    }

    return false;
  }

  /**
   * Activate a task
   */
  private activateTask(wisdom: TaskWisdom, initialDistress: number): void {
    // Deactivate lower priority tasks in same category if this is higher priority
    for (const [taskId, activeTask] of this.activeTasks) {
      if (
        activeTask.wisdom.category === wisdom.category &&
        activeTask.wisdom.priority < wisdom.priority
      ) {
        this.activeTasks.delete(taskId);
        this.logger.debug({ taskId }, 'Deactivated lower priority task');
      }
    }

    this.activeTasks.set(wisdom.id, {
      wisdom,
      startedAt: new Date(),
      turnCount: 0,
      initialDistress,
    });
  }

  /**
   * Check if a task is complete
   */
  private isTaskComplete(
    activeTask: ActiveTask,
    analysis: ConversationAnalysis,
    userText: string
  ): boolean {
    const { completion } = activeTask.wisdom;
    if (!completion) return false;

    // Check turn count
    if (completion.afterTurns && activeTask.turnCount >= completion.afterTurns) {
      return true;
    }

    // Check emotion change (distress improved significantly)
    if (completion.onEmotionChange) {
      if (analysis.emotion.distressLevel < activeTask.initialDistress - 0.2) {
        return true;
      }
    }

    // Check keywords
    if (completion.onKeywords?.test(userText)) {
      return true;
    }

    // Check custom function
    if (completion.custom?.(analysis, userText)) {
      return true;
    }

    return false;
  }

  /**
   * Manually trigger a specific task
   */
  triggerTask(taskId: string, analysis: ConversationAnalysis): boolean {
    const taskWisdom = this.wisdom.find((w) => w.id === taskId);
    if (!taskWisdom) {
      this.logger.warn({ taskId }, 'Task not found');
      return false;
    }

    if (this.activeTasks.has(taskId) || this.completedTasks.has(taskId)) {
      return false;
    }

    this.activateTask(taskWisdom, analysis.emotion.distressLevel);
    return true;
  }

  /**
   * Get active task IDs
   */
  getActiveTasks(): string[] {
    return Array.from(this.activeTasks.keys());
  }

  /**
   * Reset the task manager (new session)
   */
  reset(): void {
    this.activeTasks.clear();
    this.completedTasks.clear();
    this.insightCallback = null;
  }
}

// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================

// Default singleton instance for backward compatibility
let taskManagerInstance: TaskManager | null = null;

/**
 * Get the default TaskManager singleton.
 * For new code, prefer creating instances with `new TaskManager(options)`.
 *
 * @param options - Optional configuration (only used on first call)
 */
export function getTaskManager(options?: TaskManagerOptions): TaskManager {
  if (!taskManagerInstance) {
    taskManagerInstance = new TaskManager(options);
  }
  return taskManagerInstance;
}

/**
 * Reset the default TaskManager singleton.
 * The next call to getTaskManager() will create a new instance.
 */
export function resetTaskManager(): void {
  if (taskManagerInstance) {
    taskManagerInstance.reset();
  }
  taskManagerInstance = null;
}

/**
 * Create a new TaskManager with custom options.
 * Use this for testing or when you need isolated task state.
 *
 * @param options - Configuration options
 * @returns New TaskManager instance (not the singleton)
 *
 * @example
 * const testManager = createTaskManager({
 *   wisdom: [customTask],
 *   sessionId: 'test-123',
 * });
 */
export function createTaskManager(options?: TaskManagerOptions): TaskManager {
  return new TaskManager(options);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  TaskManager,
  getTaskManager,
  resetTaskManager,
  createTaskManager,
  TASK_WISDOM,
};

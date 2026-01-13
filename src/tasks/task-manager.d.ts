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
import type { ConversationAnalysis } from '../services/types.js';
import { type TaskWisdom } from './wisdom/index.js';
export type { TaskWisdom } from './wisdom/index.js';
export interface ActiveTask {
    wisdom: TaskWisdom;
    startedAt: Date;
    turnCount: number;
    initialDistress: number;
}
/**
 * Task wisdom is now loaded from JSON files in ./wisdom/ directory.
 * This makes it easier to edit, localize, and A/B test task content.
 *
 * Use getTaskWisdom() to get all tasks, or TASK_WISDOM for backwards compatibility.
 */
export declare const TASK_WISDOM: TaskWisdom[];
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
export declare class TaskManager {
    private activeTasks;
    private completedTasks;
    private readonly logger;
    private readonly wisdom;
    private readonly sessionId?;
    private insightCallback;
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
    constructor(options?: TaskManagerOptions);
    /**
     * Set the callback for capturing task insights
     */
    setInsightCallback(callback: (type: string, key: string, value: unknown, confidence: number) => void): void;
    private captureInsight;
    /**
     * Process a turn and return context to inject
     */
    processUserTurn(analysis: ConversationAnalysis, userText: string, context?: {
        isReturningUser?: boolean;
        lastSummary?: string;
    }): string[];
    /**
     * Get a contextually-appropriate entry transition for a task
     */
    private getSmartEntryTransition;
    /**
     * Determine mood from analysis
     */
    private getMoodFromAnalysis;
    /**
     * Determine target mood for a task category
     */
    private getTargetMoodForCategory;
    /**
     * Check if a task should be triggered
     */
    private shouldTrigger;
    /**
     * Activate a task
     */
    private activateTask;
    /**
     * Check if a task is complete
     */
    private isTaskComplete;
    /**
     * Manually trigger a specific task
     */
    triggerTask(taskId: string, analysis: ConversationAnalysis): boolean;
    /**
     * Get active task IDs
     */
    getActiveTasks(): string[];
    /**
     * Reset the task manager (new session)
     */
    reset(): void;
}
/**
 * Get the default TaskManager singleton.
 * For new code, prefer creating instances with `new TaskManager(options)`.
 *
 * @param options - Optional configuration (only used on first call)
 */
export declare function getTaskManager(options?: TaskManagerOptions): TaskManager;
/**
 * Reset the default TaskManager singleton.
 * The next call to getTaskManager() will create a new instance.
 */
export declare function resetTaskManager(): void;
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
export declare function createTaskManager(options?: TaskManagerOptions): TaskManager;
declare const _default: {
    TaskManager: typeof TaskManager;
    getTaskManager: typeof getTaskManager;
    resetTaskManager: typeof resetTaskManager;
    createTaskManager: typeof createTaskManager;
    TASK_WISDOM: TaskWisdom[];
};
export default _default;
//# sourceMappingURL=task-manager.d.ts.map
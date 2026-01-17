// Types restored - context builder properly typed
/**
 * Task Manager Context Builder
 *
 * Handles task-based context:
 * - Process user turn through task manager
 * - Add task-generated context
 *
 * The task manager orchestrates background tasks based on conversation.
 *
 * Extracted from jack-bogle.ts lines 538-558
 */
import { getLogger } from '../../../utils/safe-logger.js';
import {
  registerContextBuilder,
  createHintInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';
import { getTaskManager } from '../../../tasks/task-manager.js';
import type { ConversationAnalysis as TaskManagerAnalysis } from '../../../services/index.js';

// ============================================================================
// TASKS CONTEXT BUILDER
// ============================================================================
/**
 * Build task-related context injections
 */
function buildTasksContext(input: ContextBuilderInput): ContextInjection[] {
  const { userText, analysis, userData } = input;
  const injections: ContextInjection[] = [];
  const turnCount = userData.turnCount || 0;
  // Skip on first turn
  if (turnCount === 0) {
    return injections;
  }
  try {
    const taskManager = getTaskManager();
    // -----------------------------------------------
    // PROCESS USER TURN THROUGH TASK MANAGER
    // -----------------------------------------------
    // Cast to TaskManagerAnalysis - the task manager only uses common fields
    const taskContext = taskManager.processUserTurn(
      analysis as unknown as TaskManagerAnalysis,
      userText,
      { isReturningUser: userData.isReturningUser }
    );
    // -----------------------------------------------
    // ADD TASK-GENERATED CONTEXT
    // -----------------------------------------------
    if (taskContext && taskContext.length > 0) {
      // Format task context for injection
      const taskContextFormatted = taskContext.map((ctx) => `• ${ctx}`).join('\n');
      injections.push(
        createHintInjection(
          'task_context',
          `[TASK MANAGER CONTEXT]
${taskContextFormatted}`
        )
      );
      getLogger().debug({ taskCount: taskContext.length }, 'Task manager context added');
    }
  } catch (error) {
    // Task manager errors are non-blocking
    getLogger().warn(`Task manager error (non-blocking): ${error}`);
  }
  return injections;
}
// ============================================================================
// REGISTER BUILDER
// ============================================================================
registerContextBuilder('tasks', buildTasksContext);
export { buildTasksContext };

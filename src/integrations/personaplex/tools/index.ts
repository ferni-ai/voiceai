/**
 * PersonaPlex Tool Integration
 *
 * Tool execution outside the voice loop with semantic routing.
 */

export {
  PersonaPlexToolExecutor,
  createToolExecutor,
  mapIntentToTool,
  type ToolTrigger,
  type ToolTriggerContext,
  type ToolExecutionResult,
  type PendingToolExecution,
} from './tool-executor.js';

/**
 * Action Tracker Module
 *
 * Tracks high-impact actions Ferni takes on behalf of users.
 * Provides full lifecycle visibility: request → execution → result.
 *
 * Usage:
 * ```typescript
 * import { getActionTracker } from '../services/action-tracker/index.js';
 *
 * const tracker = getActionTracker();
 *
 * // When user makes a request
 * const action = await tracker.createAction({
 *   userId: 'user_123',
 *   type: 'call',
 *   description: 'Call my mom',
 *   target: 'Mom',
 * });
 *
 * // When tool starts executing
 * await tracker.startExecution(action.id, {
 *   toolId: 'callAndConverse',
 *   toolArgs: { contact: 'Mom' },
 * });
 *
 * // When tool completes
 * await tracker.completeExecution(action.id, {
 *   success: true,
 *   resultSummary: 'Left voicemail - mom did not answer after 4 rings',
 * });
 * ```
 *
 * @module services/action-tracker
 */

// Types
export type {
  ActionType,
  ActionStatus,
  ActionEventType,
  ActionEvent,
  ActionRequest,
  ActionExecution,
  FerniAction,
  CreateActionOptions,
  StartExecutionOptions,
  CompleteExecutionOptions,
  ActionFilter,
  ActionStats,
  ActionChangeEvent,
} from './types.js';

// Type helpers
export {
  TOOL_TO_ACTION_TYPE,
  TRACKABLE_TOOLS,
  isTrackableTool,
  getActionTypeForTool,
} from './types.js';

// Main service
export { ActionTracker, getActionTracker, resetActionTracker } from './tracker.js';

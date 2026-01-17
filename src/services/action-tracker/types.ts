/**
 * Action Tracker Types
 *
 * Types for tracking high-impact actions Ferni takes on behalf of users.
 * Tracks the full lifecycle: request → execution → result.
 *
 * @module services/action-tracker/types
 */

// ============================================================================
// ACTION TYPES
// ============================================================================

/**
 * Types of high-impact actions we track.
 * These are the actions users commonly ask about: "Did you call mom?"
 */
export type ActionType = 'call' | 'text' | 'email' | 'calendar' | 'reminder';

/**
 * Action lifecycle status.
 */
export type ActionStatus =
  | 'requested' // User asked for something
  | 'in_progress' // Tool is executing
  | 'completed' // Successfully finished
  | 'failed' // Execution failed
  | 'cancelled'; // User or system cancelled

/**
 * Event types for action lifecycle tracking.
 */
export type ActionEventType =
  | 'requested'
  | 'started'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'retried';

// ============================================================================
// CORE ENTITIES
// ============================================================================

/**
 * A single event in an action's lifecycle.
 */
export interface ActionEvent {
  type: ActionEventType;
  timestamp: Date;
  /** Optional details about the event */
  details?: string;
  /** Error message if type is 'failed' */
  error?: string;
}

/**
 * Details about the original request.
 */
export interface ActionRequest {
  /** What the user asked for, in natural language */
  description: string;
  /** Who/what the action is directed at (e.g., "Mom", "John", "Dr. Smith") */
  target?: string;
  /** Phone number, email, or other contact info */
  targetContact?: string;
  /** When the user made the request */
  requestedAt: Date;
  /** Session where request was made */
  sessionId?: string;
  /** Linked commitment ID if this came from a commitment */
  commitmentId?: string;
  /** Original user message that triggered this */
  userMessage?: string;
}

/**
 * Details about the execution of the action.
 */
export interface ActionExecution {
  /** Tool/function that was executed (e.g., "callAndConverse", "sendText") */
  toolId: string;
  /** Arguments passed to the tool */
  toolArgs?: Record<string, unknown>;
  /** When execution started */
  startedAt: Date;
  /** When execution completed (success or failure) */
  completedAt?: Date;
  /** Whether the execution succeeded */
  success?: boolean;
  /** Human-readable summary of what happened */
  resultSummary?: string;
  /** Duration in milliseconds */
  durationMs?: number;
  /** For calls: call duration in seconds */
  callDurationSeconds?: number;
  /** For messages: delivery status */
  deliveryStatus?: 'sent' | 'delivered' | 'read' | 'failed';
  /** Raw result from tool execution */
  rawResult?: unknown;
}

/**
 * A Ferni Action - the main entity tracking an action taken on behalf of a user.
 */
export interface FerniAction {
  /** Unique action ID (format: act_timestamp_random) */
  id: string;
  /** User who requested this action */
  userId: string;
  /** Type of action */
  type: ActionType;
  /** Current status */
  status: ActionStatus;
  /** Request details */
  request: ActionRequest;
  /** Execution details (populated when tool runs) */
  execution?: ActionExecution;
  /** Event timeline */
  events: ActionEvent[];
  /** When the action was created */
  createdAt: Date;
  /** Last update time */
  updatedAt: Date;
  /** When action was completed (for TTL queries) */
  completedAt?: Date;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// API TYPES
// ============================================================================

/**
 * Options for creating a new action.
 */
export interface CreateActionOptions {
  userId: string;
  type: ActionType;
  description: string;
  target?: string;
  targetContact?: string;
  sessionId?: string;
  commitmentId?: string;
  userMessage?: string;
}

/**
 * Options for starting execution of an action.
 */
export interface StartExecutionOptions {
  toolId: string;
  toolArgs?: Record<string, unknown>;
}

/**
 * Options for completing an action.
 */
export interface CompleteExecutionOptions {
  success: boolean;
  resultSummary: string;
  callDurationSeconds?: number;
  deliveryStatus?: 'sent' | 'delivered' | 'read' | 'failed';
  rawResult?: unknown;
}

/**
 * Filter options for querying actions.
 */
export interface ActionFilter {
  /** Filter by action type */
  type?: ActionType | ActionType[];
  /** Filter by status */
  status?: ActionStatus | ActionStatus[];
  /** Only actions after this date */
  since?: Date;
  /** Only actions before this date */
  until?: Date;
  /** Maximum number of results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Summary statistics for actions.
 */
export interface ActionStats {
  total: number;
  byType: Record<ActionType, number>;
  byStatus: Record<ActionStatus, number>;
  completedToday: number;
  inProgress: number;
  failedLast24h: number;
}

// ============================================================================
// EVENT TYPES
// ============================================================================

/**
 * Event emitted when action state changes.
 * Used for WebSocket real-time updates.
 */
export interface ActionChangeEvent {
  type: 'action_created' | 'action_updated' | 'action_completed' | 'action_failed';
  actionId: string;
  userId: string;
  action: FerniAction;
  timestamp: Date;
}

// ============================================================================
// TOOL MAPPING
// ============================================================================

/**
 * Mapping of tool IDs to action types.
 * Used to determine which tools trigger action tracking.
 */
export const TOOL_TO_ACTION_TYPE: Record<string, ActionType> = {
  // Call tools
  callandconverse: 'call',
  callonbehalf: 'call',
  makephonecall: 'call',
  // Text/SMS tools
  sendtext: 'text',
  sendsms: 'text',
  sendmessage: 'text',
  // Email tools
  sendemail: 'email',
  // Calendar tools
  scheduleevent: 'calendar',
  createcalendarevent: 'calendar',
  addtask: 'calendar', // Tasks with due dates go to calendar
  // Reminder tools
  setreminder: 'reminder',
  createreminder: 'reminder',
};

/**
 * Set of tool IDs that should trigger action tracking.
 */
export const TRACKABLE_TOOLS = new Set(Object.keys(TOOL_TO_ACTION_TYPE));

/**
 * Check if a tool should be tracked.
 */
export function isTrackableTool(toolId: string): boolean {
  return TRACKABLE_TOOLS.has(toolId.toLowerCase());
}

/**
 * Get the action type for a tool.
 */
export function getActionTypeForTool(toolId: string): ActionType | undefined {
  return TOOL_TO_ACTION_TYPE[toolId.toLowerCase()];
}

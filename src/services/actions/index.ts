/**
 * Action Engine
 *
 * Two-phase transactional execution engine for life automation actions.
 *
 * @module services/actions
 */

// Types
export type {
  ActionType,
  ActionStatus,
  ActionPriority,
  ActionPayload,
  UberRidePayload,
  LyftRidePayload,
  GroceryOrderPayload,
  EmailPayload,
  SmsPayload,
  CalendarEventPayload,
  CustomActionPayload,
  Action,
  ActionResult,
  ActionConfirmationDetails,
  ActionConfirmation,
  ActionExecutionContext,
  ActionExecutor,
  ActionTypeConfig,
  ActionAuditEntry,
} from './action-types.js';

// Action Engine
export {
  ActionEngine,
  getActionEngine,
  resetActionEngine,
  registerActionType,
  getActionTypeConfig,
  formatActionForVoice,
  actionNeedsAttention,
} from './action-engine.js';

// Action Store
export {
  ActionStore,
  getActionStore,
  resetActionStore,
} from './action-store.js';

// Action Retry Service
export {
  ActionRetryService,
  getActionRetryService,
  resetActionRetryService,
  type RetryPolicy,
  type RetryState,
  type CircuitBreakerState,
} from './action-retry.js';

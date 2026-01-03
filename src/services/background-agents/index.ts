/**
 * Background Agents Module
 *
 * Central module for all background agent functionality.
 * "BETTER THAN HUMAN" - We work for you even when you're not watching.
 *
 * Features:
 * - Unified result capture and notification
 * - Background task executors (calls, research, reservations, etc.)
 * - "While you were away" context injection
 * - Cross-channel notification delivery
 */

// Result types
export {
  BackgroundResultTypeSchema,
  ResultPrioritySchema,
  OutcomeStatusSchema,
  BackgroundResultSchema,
  createBackgroundResult,
  getResultTypeDescription,
  sortResultsForDisplay,
  type BackgroundResult,
  type BackgroundResultType,
  type ResultPriority,
  type OutcomeStatus,
  type CallResult,
  type ResearchResult as BackgroundResearchResult,
  type ReservationResult as BackgroundReservationResult,
  type FollowUpResult,
  type CommitmentCheckResult,
  type AnyBackgroundResult,
} from './result-types.js';

// Unified capture
export {
  captureBackgroundResult,
  getPendingResults,
  markResultsDelivered,
  buildPendingResultsContext,
} from './unified-result-capture.js';

// Task executors
export {
  // Research (Peter's domain)
  executeResearchTask,
  queueResearchTask,
  type ResearchRequest,
  type ResearchResult as ExecutorResearchResult,
  type ResearchFinding,
  // Reservations (Jordan's domain)
  executeReservationTask,
  queueReservationTask,
  type ReservationRequest,
  type ReservationResult as ExecutorReservationResult,
} from './executors/index.js';

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
/**
 * Initialize delivery services for background agents.
 * This is a lightweight init that only enables push/email delivery,
 * NOT the full outreach decision engine.
 */
export declare function initializeBackgroundDelivery(): Promise<void>;
export { BackgroundResultTypeSchema, ResultPrioritySchema, OutcomeStatusSchema, BackgroundResultSchema, createBackgroundResult, getResultTypeDescription, sortResultsForDisplay, type BackgroundResult, type BackgroundResultType, type ResultPriority, type OutcomeStatus, type CallResult, type ResearchResult as BackgroundResearchResult, type ReservationResult as BackgroundReservationResult, type FollowUpResult, type CommitmentCheckResult, type AnyBackgroundResult, } from './result-types.js';
export { captureBackgroundResult, getPendingResults, markResultsDelivered, buildPendingResultsContext, } from './unified-result-capture.js';
export { executeResearchTask, queueResearchTask, type ResearchRequest, type ResearchResult as ExecutorResearchResult, type ResearchFinding, executeReservationTask, queueReservationTask, type ReservationRequest, type ReservationResult as ExecutorReservationResult, } from './executors/index.js';
//# sourceMappingURL=index.d.ts.map
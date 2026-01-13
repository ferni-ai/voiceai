/**
 * Unified Background Result Capture
 *
 * Central system for capturing, storing, and notifying about all background
 * agent task results. This is the "BETTER THAN HUMAN" engine - we never
 * forget to follow up on what we did while you were away.
 *
 * Features:
 * - Stores results in Firestore for persistence
 * - Sends real-time notifications via LiveKit (if connected)
 * - Sends push/email notifications (if disconnected)
 * - Provides context injection for "while you were away" greetings
 * - Marks results as delivered to avoid repetition
 */
import type { BackgroundResult, BackgroundResultType, ResultPriority, OutcomeStatus } from './result-types.js';
/**
 * Get pending (undelivered) results for a user
 */
export declare function getPendingResults(userId: string, options?: {
    maxAge?: number;
    limit?: number;
    types?: BackgroundResultType[];
}): Promise<BackgroundResult[]>;
/**
 * Mark results as delivered
 */
export declare function markResultsDelivered(userId: string, resultIds: string[], deliveryMethod?: 'voice' | 'push' | 'email' | 'sms'): Promise<void>;
/**
 * Capture a background result
 *
 * This is the main entry point for recording any background task completion.
 * It handles:
 * 1. Storing the result for history
 * 2. Sending to active session (if connected)
 * 3. Sending push/email notifications (if disconnected)
 * 4. Ensuring the user will be told about it on reconnect
 */
export declare function captureBackgroundResult(params: {
    userId: string;
    type: BackgroundResultType;
    status: OutcomeStatus;
    summary: string;
    priority?: ResultPriority;
    initiatedBy: string;
    sessionId?: string;
    contactName?: string;
    contactId?: string;
    details?: string;
    actionItems?: string[];
    requiresCallback?: boolean;
    callbackTime?: string;
    relatedTaskId?: string;
    specificData?: Record<string, unknown>;
}): Promise<BackgroundResult>;
/**
 * Build context injection for pending background results.
 *
 * Returns a string to inject into the agent's system prompt that tells them
 * what background tasks completed while the user was away.
 */
export declare function buildPendingResultsContext(userId: string): Promise<string | null>;
/**
 * Get result history for a user (including delivered results)
 */
export declare function getResultHistory(userId: string, limit?: number, type?: string): Promise<BackgroundResult[]>;
export type { BackgroundResult, BackgroundResultType, ResultPriority, OutcomeStatus };
//# sourceMappingURL=unified-result-capture.d.ts.map
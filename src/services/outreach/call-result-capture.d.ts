/**
 * Call Result Capture Service
 *
 * Handles capturing and storing the outcomes of on-behalf calls:
 * - Stores results in Firestore for history
 * - Notifies the original session of the outcome
 * - Creates follow-up actions if needed
 *
 * @module services/outreach/call-result-capture
 */
import type { CallOutcome, OnBehalfCallRequest } from '../../tools/domains/telephony/call-on-behalf.js';
export interface StoredCallResult {
    callId: string;
    userId: string;
    outcome: CallOutcome;
    request: {
        contactQuery: string;
        contactName?: string;
        contactPhone?: string;
        purpose: string;
        objective: string;
        callType: string;
    };
    capturedAt: string;
}
export interface FollowUpAction {
    id: string;
    callId: string;
    userId: string;
    type: 'callback' | 'reminder' | 'notification';
    description: string;
    scheduledFor?: string;
    createdAt: string;
}
/**
 * Get a stored call result
 */
export declare function getCallResult(callId: string, userId: string): Promise<StoredCallResult | null>;
/**
 * Capture the result of an on-behalf call
 *
 * This is the main entry point called by the orchestrator when a call completes.
 * It handles:
 * 1. Storing the result for history
 * 2. Notifying the original session (for active sessions)
 * 3. Sending push notification (for disconnected users)
 * 4. Creating follow-up actions
 */
export declare function captureCallResult(callId: string, outcome: CallOutcome, request: OnBehalfCallRequest): Promise<void>;
/**
 * Get recent call results for a user
 */
export declare function getRecentCallResults(userId: string, limit?: number): Promise<StoredCallResult[]>;
/**
 * Get pending follow-up actions for a user
 */
export declare function getPendingFollowUps(userId: string): Promise<FollowUpAction[]>;
//# sourceMappingURL=call-result-capture.d.ts.map
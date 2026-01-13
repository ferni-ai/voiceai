/**
 * Pending Background Results Context Builder
 *
 * "BETTER THAN HUMAN" - When you reconnect, Ferni remembers what happened
 * while you were away and tells you like a friend would: "Oh! I called your
 * mom while you were gone - she said she loved hearing from you!"
 *
 * This builder:
 * 1. Checks for recent background results (calls, research, reservations, etc.)
 * 2. Injects them into the agent's first turn context
 * 3. Marks them as delivered so they're not repeated
 *
 * WHY THIS MATTERS:
 * - Push notifications are easy to miss
 * - Email feels impersonal
 * - Ferni TELLING you feels like a real relationship
 * - "Better than human" - friends forget to follow up, Ferni doesn't
 *
 * EVOLUTION:
 * - Originally just for calls (pending-call-results.ts)
 * - Now unified to handle ALL background agent tasks
 * - Uses unified-result-capture.ts for storage/retrieval
 */
interface PendingCallResult {
    callId: string;
    contactName: string;
    status: 'completed' | 'voicemail' | 'no_answer' | 'busy' | 'failed';
    outcome: string;
    objectiveAchieved: boolean;
    callbackRequired: boolean;
    actionItems?: string[];
    capturedAt: string;
    delivered?: boolean;
}
/**
 * Get recent call results that haven't been delivered to the user yet.
 * Only returns results from the last 24 hours to avoid overwhelming.
 */
export declare function getPendingCallResults(userId: string): Promise<PendingCallResult[]>;
/**
 * Mark call results as delivered so they won't be repeated.
 */
export declare function markCallResultsDelivered(userId: string, callIds: string[]): Promise<void>;
/**
 * Build context injection for pending call results.
 *
 * Returns a string to inject into the agent's system prompt that tells them
 * what calls completed while the user was away. The agent will naturally
 * mention these in their greeting.
 */
export declare function buildPendingCallResultsContext(userId: string): Promise<string | null>;
/**
 * Build context for ALL pending background results (not just calls).
 * This is the "WHILE YOU WERE AWAY" moment that makes Ferni superhuman.
 */
export declare function buildPendingBackgroundResultsContext(userId: string): Promise<string | null>;
/**
 * Combined context builder that gets BOTH legacy call results AND new unified results.
 * Use this during the transition period to ensure nothing is missed.
 */
export declare function buildAllPendingResultsContext(userId: string): Promise<string | null>;
export type { PendingCallResult };
//# sourceMappingURL=pending-call-results.d.ts.map
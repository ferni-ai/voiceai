/**
 * Action History Tracker
 *
 * Tracks what tools/actions have been executed in a session.
 * Used for honest capability responses - when a user asks "did you do X?",
 * Ferni should answer honestly based on actual execution history.
 *
 * CRITICAL FOR TRUST: Ferni must never imply she did something she didn't do.
 *
 * @module agents/shared/action-history
 */
export interface ActionRecord {
    /** Tool/function that was executed */
    toolId: string;
    /** Arguments passed to the tool */
    args: Record<string, unknown>;
    /** When the action was executed */
    timestamp: Date;
    /** Whether the action succeeded */
    success: boolean;
    /** Brief description for human-readable summary */
    description?: string;
    /** Result summary (for reference in honesty checks) */
    resultSummary?: string;
}
export interface ActionHistorySummary {
    /** Total actions executed in session */
    totalActions: number;
    /** Actions by tool type */
    byTool: Record<string, number>;
    /** High-impact actions (calls, messages, etc.) */
    highImpactActions: ActionRecord[];
    /** Recent actions (last 5) */
    recentActions: ActionRecord[];
}
/**
 * Record that an action was executed.
 * Called by the JSON function executor after tool execution.
 */
export declare function recordAction(sessionId: string, toolId: string, args: Record<string, unknown>, success: boolean, resultSummary?: string): void;
/**
 * Check if a specific type of action was executed in this session.
 * Used for honest capability responses.
 */
export declare function wasActionExecuted(sessionId: string, toolId: string, filter?: {
    /** Only successful executions */
    successOnly?: boolean;
    /** Filter by argument values */
    args?: Record<string, unknown>;
    /** Only within last N minutes */
    withinMinutes?: number;
}): {
    executed: boolean;
    record?: ActionRecord;
};
/**
 * Check if any high-impact action matching a description was executed.
 * Used when user asks "did you call/text/email X?"
 */
export declare function wasHighImpactActionExecuted(sessionId: string, query: {
    /** Action type: 'call', 'text', 'email', 'message' */
    actionType?: 'call' | 'text' | 'email' | 'message' | 'event';
    /** Target contact (e.g., "mom", "John") */
    contact?: string;
}): {
    executed: boolean;
    record?: ActionRecord;
    explanation: string;
};
/**
 * Get summary of all actions in a session.
 */
export declare function getActionSummary(sessionId: string): ActionHistorySummary;
/**
 * Clear action history for a session.
 * Called on session end.
 */
export declare function clearSessionHistory(sessionId: string): void;
/**
 * Get a human-readable summary of what Ferni has done this session.
 * Used for honest capability context injection.
 */
export declare function getHumanReadableSummary(sessionId: string): string;
//# sourceMappingURL=action-history.d.ts.map
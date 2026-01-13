/**
 * Tool Usage Analytics
 *
 * Tracks tool usage for monitoring, debugging, and optimization.
 * Designed to be lightweight and non-blocking.
 *
 * PERSISTENCE: Uses Firestore for analytics storage with in-memory caching.
 *
 * USAGE:
 *   import { trackToolUsage, getToolMetrics } from '../shared/analytics.js';
 *
 *   execute: async (params, { ctx: toolCtx }) => {
 *     const tracker = trackToolUsage('logExercise', 'health');
 *     try {
 *       // ... tool logic
 *       tracker.success();
 *     } catch (error) {
 *       tracker.error(error);
 *       throw error;
 *     }
 *   }
 */
export interface ToolUsageEvent {
    toolId: string;
    domain: string;
    success: boolean;
    durationMs: number;
    timestamp: Date;
    userId?: string;
    agentId?: string;
    error?: string;
    metadata?: Record<string, unknown>;
}
export interface ToolMetrics {
    toolId: string;
    domain: string;
    totalCalls: number;
    successCount: number;
    errorCount: number;
    avgDurationMs: number;
    lastCalled: Date | null;
    errorRate: number;
}
export interface DomainMetrics {
    domain: string;
    totalCalls: number;
    toolBreakdown: Record<string, number>;
    avgDurationMs: number;
    errorRate: number;
}
/**
 * Start tracking a tool execution
 * Returns a tracker object with success/error methods
 */
export declare function trackToolUsage(toolId: string, domain: string, options?: {
    userId?: string;
    agentId?: string;
    metadata?: Record<string, unknown>;
}): {
    success: (metadata?: Record<string, unknown>) => void;
    error: (error: Error | string, metadata?: Record<string, unknown>) => void;
};
/**
 * Simple one-line tracking for successful executions
 */
export declare function trackToolSuccess(toolId: string, domain: string, durationMs: number, metadata?: Record<string, unknown>): void;
/**
 * Simple one-line tracking for failed executions
 */
export declare function trackToolError(toolId: string, domain: string, error: string, durationMs: number, metadata?: Record<string, unknown>): void;
/**
 * Get metrics for a specific tool
 */
export declare function getToolMetrics(toolId: string): ToolMetrics | null;
/**
 * Get metrics for a domain
 */
export declare function getDomainMetrics(domain: string): DomainMetrics | null;
/**
 * Get all domain metrics
 */
export declare function getAllDomainMetrics(): DomainMetrics[];
/**
 * Get most used tools
 */
export declare function getMostUsedTools(limit?: number): ToolMetrics[];
/**
 * Get tools with highest error rates
 */
export declare function getProblematicTools(minCalls?: number): ToolMetrics[];
/**
 * Get recent errors for debugging
 */
export declare function getRecentErrors(limit?: number): ToolUsageEvent[];
/**
 * Check if a tool has concerning error rate
 */
export declare function hasHighErrorRate(toolId: string, threshold?: number): boolean;
/**
 * Check if any crisis tools have errors (critical alert)
 */
export declare function hasCrisisToolErrors(): boolean;
/**
 * Get crisis tool health status
 */
export declare function getCrisisToolHealth(): {
    healthy: boolean;
    errorCount: number;
    lastError: ToolUsageEvent | null;
};
/**
 * Clear all stored events (for testing)
 */
export declare function clearAnalytics(): void;
/**
 * Get raw event count
 */
export declare function getEventCount(): number;
/**
 * Export events for external analysis
 */
export declare function exportEvents(since?: Date): ToolUsageEvent[];
/**
 * Load metrics from Firestore (for dashboard/admin)
 */
export declare function loadMetricsFromFirestore(): Promise<ToolMetrics[]>;
/**
 * Query recent events from Firestore
 */
export declare function queryEventsFromFirestore(options: {
    toolId?: string;
    domain?: string;
    limit?: number;
    since?: Date;
}): Promise<ToolUsageEvent[]>;
declare const _default: {
    trackToolUsage: typeof trackToolUsage;
    trackToolSuccess: typeof trackToolSuccess;
    trackToolError: typeof trackToolError;
    getToolMetrics: typeof getToolMetrics;
    getDomainMetrics: typeof getDomainMetrics;
    getAllDomainMetrics: typeof getAllDomainMetrics;
    getMostUsedTools: typeof getMostUsedTools;
    getProblematicTools: typeof getProblematicTools;
    getRecentErrors: typeof getRecentErrors;
    hasHighErrorRate: typeof hasHighErrorRate;
    hasCrisisToolErrors: typeof hasCrisisToolErrors;
    getCrisisToolHealth: typeof getCrisisToolHealth;
    clearAnalytics: typeof clearAnalytics;
    getEventCount: typeof getEventCount;
    exportEvents: typeof exportEvents;
    loadMetricsFromFirestore: typeof loadMetricsFromFirestore;
    queryEventsFromFirestore: typeof queryEventsFromFirestore;
};
export default _default;
//# sourceMappingURL=analytics.d.ts.map
/**
 * Tool Usage Analytics Service
 *
 * Tracks tool usage across sessions to identify:
 * - Tools that are never used (candidates for removal)
 * - Most frequently used tools (ensure always loaded)
 * - Tool confusion patterns (consolidation candidates)
 * - Tool performance metrics (latency, success rate)
 *
 * Data is persisted to Firestore for historical analysis.
 */
interface FirestoreDB {
    collection: (path: string) => CollectionRef;
    runTransaction: <T>(fn: (transaction: Transaction) => Promise<T>) => Promise<T>;
}
interface CollectionRef {
    doc: (id: string) => DocumentRef;
    get: () => Promise<QuerySnapshot>;
    orderBy: (field: string, direction?: 'asc' | 'desc') => CollectionRef;
    limit: (count: number) => CollectionRef;
    where: (field: string, op: string, value: unknown) => CollectionRef;
}
interface DocumentRef {
    get: () => Promise<DocumentSnapshot>;
    set: (data: unknown, options?: {
        merge?: boolean;
    }) => Promise<void>;
    update: (data: unknown) => Promise<void>;
}
interface DocumentSnapshot {
    exists: boolean;
    data: () => unknown | undefined;
    id: string;
}
interface QuerySnapshot {
    docs: DocumentSnapshot[];
    empty: boolean;
}
interface Transaction {
    get: (ref: DocumentRef) => Promise<DocumentSnapshot>;
    set: (ref: DocumentRef, data: unknown, options?: {
        merge?: boolean;
    }) => void;
    update: (ref: DocumentRef, data: unknown) => void;
}
/**
 * Tool usage record for a single call
 */
export interface ToolCallRecord {
    toolId: string;
    agentId: string;
    userId: string;
    sessionId: string;
    timestamp: Date;
    latencyMs: number;
    success: boolean;
    errorType?: string;
    domain: string;
}
/**
 * Aggregated tool stats
 */
export interface ToolStats {
    toolId: string;
    domain: string;
    totalCalls: number;
    successCount: number;
    failureCount: number;
    avgLatencyMs: number;
    lastUsed: Date;
    usedByAgents: string[];
    usedByUserCount: number;
}
/**
 * Tool usage report for analysis
 */
export interface ToolUsageReport {
    timestamp: Date;
    totalTools: number;
    unusedTools: string[];
    topTools: Array<{
        toolId: string;
        calls: number;
    }>;
    slowTools: Array<{
        toolId: string;
        avgLatencyMs: number;
    }>;
    errorProneTools: Array<{
        toolId: string;
        errorRate: number;
    }>;
    recommendations: string[];
}
declare class ToolUsageAnalyticsService {
    private db;
    private initialized;
    private readonly TOOL_CALLS;
    private readonly TOOL_STATS;
    private readonly TOOL_REPORTS;
    /**
     * Initialize with Firestore connection
     */
    initialize(db?: FirestoreDB): Promise<void>;
    /**
     * Shutdown and flush remaining data
     */
    shutdown(): Promise<void>;
    /**
     * Record a tool call
     */
    recordToolCall(record: ToolCallRecord): void;
    /**
     * Quick helper to record a tool call with timing
     */
    trackToolExecution<T>(toolId: string, domain: string, agentId: string, userId: string, sessionId: string, executeFn: () => Promise<T>): Promise<T>;
    /**
     * Get stats for a specific tool
     */
    getToolStats(toolId: string): ToolStats | undefined;
    /**
     * Get all tool stats
     */
    getAllStats(): ToolStats[];
    /**
     * Get top tools by usage
     */
    getTopTools(limit?: number): Array<{
        toolId: string;
        calls: number;
    }>;
    /**
     * Get unused tools (zero calls)
     */
    getUnusedTools(): string[];
    /**
     * Get slowest tools
     */
    getSlowestTools(limit?: number): Array<{
        toolId: string;
        avgLatencyMs: number;
    }>;
    /**
     * Get tools with high error rates
     */
    getErrorProneTools(minCalls?: number, minErrorRate?: number): Array<{
        toolId: string;
        errorRate: number;
    }>;
    /**
     * Generate a usage report with recommendations
     */
    generateReport(): Promise<ToolUsageReport>;
    /**
     * Update in-memory stats cache
     */
    private updateStatsCache;
    /**
     * Load existing stats from Firestore into cache
     */
    private loadStatsCache;
    /**
     * Flush buffer to Firestore
     */
    private flushBuffer;
}
export declare const toolUsageAnalytics: ToolUsageAnalyticsService;
/**
 * Quick helper to record a tool call (for use in tool executors)
 */
export declare function recordToolUsage(toolId: string, domain: string, ctx: {
    agentId?: string;
    userId?: string;
    sessionId?: string;
}, latencyMs: number, success: boolean, errorType?: string): void;
export default toolUsageAnalytics;
//# sourceMappingURL=tool-usage-analytics.d.ts.map
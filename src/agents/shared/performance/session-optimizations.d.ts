/**
 * Session Performance Optimizations
 *
 * Implements four key optimizations for the voice agent critical path:
 *
 * 1. PRE-WARM USER MEMORY EMBEDDINGS - Generate embeddings at session start
 * 2. TOOL EXECUTION PARALLELIZATION - Execute independent tools concurrently
 * 3. MEMORY DEDUPLICATION CACHE - Prevent redundant memory lookups
 * 4. SPECULATIVE CONTEXT PREFETCH - Start context building during user speech
 *
 * @module agents/shared/performance/session-optimizations
 */
interface PrewarmConfig {
    maxTopics?: number;
    maxPhrases?: number;
    timeoutMs?: number;
}
/**
 * Pre-warm embeddings for a user's common topics and phrases
 * Run at session start to eliminate cold-start latency
 */
export declare function prewarmUserEmbeddings(userId: string, config?: PrewarmConfig): Promise<{
    warmedCount: number;
    durationMs: number;
}>;
interface ToolCall {
    fn: string;
    args: Record<string, unknown>;
}
interface ParallelToolResult {
    fn: string;
    result: unknown;
    success: boolean;
    error?: string;
    durationMs: number;
}
/**
 * Execute multiple tool calls with intelligent parallelization
 * Read-only tools run in parallel, write tools run sequentially
 */
export declare function executeToolsParallel(toolCalls: ToolCall[], executor: (fn: string, args: Record<string, unknown>) => Promise<unknown>): Promise<ParallelToolResult[]>;
interface CachedMemoryResult {
    result: unknown;
    timestamp: number;
    query: string;
}
/**
 * Check if a memory query result is cached
 */
export declare function getCachedMemoryResult(sessionId: string, query: string): CachedMemoryResult | null;
/**
 * Cache a memory query result
 */
export declare function cacheMemoryResult(sessionId: string, query: string, result: unknown): void;
/**
 * Clear memory cache for a session (call on session end)
 */
export declare function clearSessionMemoryCache(sessionId: string): void;
/**
 * Get cache statistics
 */
export declare function getMemoryCacheStats(): {
    sessionCount: number;
    totalEntries: number;
};
/**
 * Start speculative context prefetch based on partial user speech
 * Non-blocking - runs in background
 */
export declare function startSpeculativePrefetch(sessionId: string, partialText: string, prefetchFn: (text: string) => Promise<unknown>): void;
/**
 * Get prefetched context if available and relevant
 */
export declare function getSpeculativePrefetch<T>(sessionId: string, finalText: string): T | null;
/**
 * Clear prefetch state for a session
 */
export declare function clearSpeculativePrefetch(sessionId: string): void;
/**
 * Run all session start optimizations
 * Call this when a session begins
 */
export declare function optimizeSessionStart(sessionId: string, userId: string): Promise<{
    embeddingsWarmed: number;
    durationMs: number;
}>;
/**
 * Clean up all optimizations for a session
 * Call this when a session ends
 */
export declare function cleanupSessionOptimizations(sessionId: string): void;
export {};
//# sourceMappingURL=session-optimizations.d.ts.map
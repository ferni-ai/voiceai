/**
 * Source Prioritizer
 *
 * Intelligently prioritizes and orchestrates multiple data sources:
 * - Tracks latency and reliability per source
 * - Runs fast sources first, slow sources as backup
 * - Returns as soon as we have "enough" data
 * - Doesn't wait for slow sources if fast ones succeed
 *
 * Philosophy: Get data to the user ASAP. Don't wait for the slowest source
 * when faster ones have already delivered good results.
 */
import type { SourceConfig } from './types.js';
interface SourceMetrics {
    avgLatency: number;
    successRate: number;
    lastUsed: number;
    totalRequests: number;
}
/**
 * Update metrics for a source after a request
 */
declare function updateMetrics(sourceId: string, latencyMs: number, success: boolean): void;
export interface FetchWithPriorityOptions<T> {
    /** All available sources */
    sources: SourceConfig[];
    /** The query to send to sources */
    query: string;
    /** Minimum number of results before returning early */
    minResults?: number;
    /** Maximum time to wait for any source (ms) */
    maxWait?: number;
    /** How long to delay slow sources (ms) */
    slowSourceDelay?: number;
    /** Threshold for "slow" source (ms) */
    slowThreshold?: number;
    /** Transform results from source format */
    transformResult?: (data: unknown, sourceId: string) => T[];
}
/**
 * Fetch from multiple sources with intelligent prioritization
 *
 * Strategy:
 * 1. Sort sources by effective priority (fast + reliable first)
 * 2. Start fast sources immediately
 * 3. Start slow sources after a delay (if fast sources haven't delivered)
 * 4. Return as soon as we have enough results
 * 5. Don't wait for slow sources if we already have data
 */
export declare function fetchWithPriority<T>(options: FetchWithPriorityOptions<T>): Promise<{
    results: T[];
    sources: string[];
    latency: number;
    complete: boolean;
}>;
/**
 * Get current metrics for all sources
 */
export declare function getSourceMetrics(): Map<string, SourceMetrics>;
/**
 * Reset metrics for testing
 */
export declare function resetMetrics(): void;
/**
 * Create a source config with defaults
 */
export declare function createSource(id: string, name: string, fetch: (query: string) => Promise<unknown>, options?: Partial<Omit<SourceConfig, 'id' | 'name' | 'fetch'>>): SourceConfig;
export { updateMetrics };
//# sourceMappingURL=source-prioritizer.d.ts.map
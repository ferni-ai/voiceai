/**
 * Tool Execution Types
 *
 * Type definitions for the progressive tool execution system.
 * Enables "better than human" UX by providing feedback during slow operations.
 */
/**
 * Configuration for progressive feedback during tool execution
 */
export interface ProgressiveExecutionConfig {
    /** Duration to wait silently before any feedback (ms) - fast responses need none */
    silentWindow: number;
    /** When to send first acknowledgment "Checking..." (ms) */
    acknowledgmentAt: number;
    /** When to send update "Still looking..." (ms) */
    updateAt: number;
    /** Hard timeout - return fallback/cached data (ms) */
    hardTimeout: number;
    /** Strategy when hard timeout is reached */
    fallbackStrategy: 'cache' | 'partial' | 'apologize';
    /** Maximum age of cached data to accept as fallback (ms) */
    cacheMaxAge: number;
}
/**
 * Result of a progressive execution
 */
export interface ProgressiveResult<T> {
    /** Whether the execution completed successfully */
    success: boolean;
    /** The result data (if successful) */
    data?: T;
    /** Error message (if failed) */
    error?: string;
    /** How long the execution took (ms) */
    latency: number;
    /** Whether cached/fallback data was used */
    usedFallback: boolean;
    /** Source of the data */
    source: 'live' | 'cache' | 'partial' | 'fallback';
    /** Freshness indicator for cached data */
    freshness?: 'fresh' | 'stale' | 'expired';
}
/**
 * Feedback types during execution
 */
export type FeedbackType = 'acknowledgment' | 'update' | 'apology';
/**
 * Callback to send feedback to the user
 */
export type FeedbackCallback = (message: string, type: FeedbackType) => void;
/**
 * Cached tool result with metadata
 */
export interface CachedToolResult<T> {
    /** The cached data */
    data: T;
    /** When this was cached */
    timestamp: number;
    /** Source that provided this data */
    source: string;
    /** Cache key */
    key: string;
    /** Freshness based on TTL */
    freshness: 'fresh' | 'stale' | 'expired';
    /** Time-to-live for this entry (ms) */
    ttl: number;
}
/**
 * Cache configuration per tool/data type
 */
export interface CacheConfig {
    /** Time-to-live for fresh data (ms) */
    ttl: number;
    /** Maximum age to serve as stale fallback (ms) */
    maxStaleAge: number;
    /** Whether to refresh in background after serving stale */
    staleWhileRevalidate: boolean;
}
/**
 * Default cache configurations by data category
 */
export declare const DEFAULT_CACHE_CONFIGS: Record<string, CacheConfig>;
/**
 * State of a circuit breaker
 */
export type CircuitState = 'closed' | 'open' | 'half-open';
/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
    /** Number of failures before opening circuit */
    failureThreshold: number;
    /** Time window to count failures (ms) */
    failureWindow: number;
    /** Time to wait before trying again (ms) */
    resetTimeout: number;
    /** Latency threshold to count as "slow" (ms) */
    slowThreshold: number;
    /** Number of slow responses before opening */
    slowThreshold_count: number;
}
/**
 * Circuit state for a service
 */
export interface ServiceCircuit {
    /** Service identifier */
    service: string;
    /** Current circuit state */
    state: CircuitState;
    /** Recent failures */
    failures: number;
    /** Timestamp of last failure */
    lastFailure: number;
    /** Rolling average latency (ms) */
    avgLatency: number;
    /** Number of requests tracked */
    requestCount: number;
    /** Success rate (0-1) */
    successRate: number;
}
/**
 * Default circuit breaker configuration
 */
export declare const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig;
/**
 * Configuration for a data source
 */
export interface SourceConfig {
    /** Source identifier */
    id: string;
    /** Human-readable name */
    name: string;
    /** Fetch function */
    fetch: (query: string) => Promise<unknown>;
    /** Expected latency (updated dynamically) */
    avgLatency: number;
    /** Success rate (0-1, updated dynamically) */
    reliability: number;
    /** Base priority (lower = higher priority) */
    basePriority: number;
    /** Whether this is a fallback-only source */
    fallbackOnly: boolean;
}
/**
 * Result from a source fetch
 */
export interface SourceResult<T> {
    /** Source that provided this result */
    source: string;
    /** The data */
    data: T;
    /** How long it took (ms) */
    latency: number;
    /** Whether this succeeded */
    success: boolean;
    /** Error if failed */
    error?: string;
}
/**
 * Per-tool timeout overrides
 */
export interface ToolTimeoutConfig {
    /** Hard timeout for this tool (ms) */
    hardTimeout: number;
    /** When to acknowledge (ms) */
    acknowledgmentAt: number;
    /** When to update (ms) */
    updateAt: number;
    /** Cache category for this tool */
    cacheCategory?: string;
}
/**
 * Default tool timeout configurations
 */
export declare const TOOL_TIMEOUT_CONFIGS: Record<string, ToolTimeoutConfig>;
/**
 * Get timeout config for a tool, with defaults
 */
export declare function getToolTimeoutConfig(toolName: string): ToolTimeoutConfig;
//# sourceMappingURL=types.d.ts.map
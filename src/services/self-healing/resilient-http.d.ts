/**
 * Resilient HTTP Client
 *
 * Unified HTTP client combining circuit breaker + retry logic for all external APIs.
 * "Better than human" means our API calls self-heal.
 *
 * Features:
 * - Circuit breaker to prevent cascading failures
 * - Exponential backoff with jitter
 * - Automatic retry for transient errors
 * - Human-friendly error messages
 * - Centralized health monitoring
 *
 * @example
 * ```typescript
 * const stocksClient = createResilientClient('yahoo-finance');
 * const data = await stocksClient.get<StockData>('https://api.yahoo.com/...');
 * ```
 */
import { type HumanizedError } from './error-humanizer.js';
export interface ResilientClientOptions {
    /** Number of failures before circuit opens (default: 5) */
    failureThreshold?: number;
    /** Time in ms to wait before trying half-open (default: 30000) */
    recoveryTimeout?: number;
    /** Maximum retry attempts (default: 3) */
    maxRetries?: number;
    /** Request timeout in ms (default: 10000) */
    timeout?: number;
    /** Base delay for retry backoff in ms (default: 1000) */
    baseDelay?: number;
    /** Maximum delay between retries in ms (default: 10000) */
    maxDelay?: number;
    /** Default headers to include in all requests */
    defaultHeaders?: Record<string, string>;
    /** Custom function to determine if error is retryable */
    shouldRetry?: (error: Error, statusCode?: number) => boolean;
    /** Callback when circuit state changes */
    onCircuitStateChange?: (oldState: string, newState: string) => void;
    /** Callback on each request for logging/metrics */
    onRequest?: (url: string, method: string) => void;
    /** Callback on response for logging/metrics */
    onResponse?: (url: string, statusCode: number, durationMs: number) => void;
}
export interface ResilientResponse<T> {
    /** The response data (null if error) */
    data: T | null;
    /** Error details if request failed */
    error: ResilientError | null;
    /** HTTP status code (null if network error) */
    status: number | null;
    /** Whether this was served from circuit breaker (failed fast) */
    circuitBroken: boolean;
    /** Number of retry attempts made */
    retries: number;
    /** Total request duration in ms */
    durationMs: number;
}
export interface ResilientError {
    /** Technical error message */
    message: string;
    /** Error code for categorization */
    code: 'NETWORK_ERROR' | 'TIMEOUT' | 'HTTP_ERROR' | 'CIRCUIT_OPEN' | 'PARSE_ERROR' | 'UNKNOWN';
    /** HTTP status code if applicable */
    statusCode?: number;
    /** Human-friendly explanation for user communication */
    humanized: HumanizedError;
}
export interface ResilientClient {
    /** Service name for this client */
    name: string;
    /** Make a GET request */
    get: <T>(url: string, options?: RequestInit) => Promise<ResilientResponse<T>>;
    /** Make a POST request */
    post: <T>(url: string, body?: unknown, options?: RequestInit) => Promise<ResilientResponse<T>>;
    /** Make a PUT request */
    put: <T>(url: string, body?: unknown, options?: RequestInit) => Promise<ResilientResponse<T>>;
    /** Make a DELETE request */
    delete: <T>(url: string, options?: RequestInit) => Promise<ResilientResponse<T>>;
    /** Make a generic request */
    fetch: <T>(url: string, options?: RequestInit) => Promise<ResilientResponse<T>>;
    /** Get circuit breaker stats */
    getStats: () => CircuitStats;
    /** Check if circuit is healthy (closed) */
    isHealthy: () => boolean;
    /** Manually reset the circuit breaker */
    reset: () => void;
}
export interface CircuitStats {
    name: string;
    state: 'closed' | 'open' | 'half_open';
    failures: number;
    successes: number;
    totalRequests: number;
    totalFailures: number;
    totalSuccesses: number;
    lastStateChange: number;
}
/**
 * Create a resilient HTTP client for a specific service.
 *
 * Each service should have its own client with independent circuit breaker.
 *
 * @example
 * ```typescript
 * const yahooClient = createResilientClient('yahoo-finance', {
 *   timeout: 8000,
 *   maxRetries: 2,
 * });
 *
 * const { data, error } = await yahooClient.get<StockData>(url);
 * if (data) {
 *   // Use data
 * } else {
 *   log.warn(error?.humanized.technicalSummary);
 * }
 * ```
 */
export declare function createResilientClient(serviceName: string, options?: ResilientClientOptions): ResilientClient;
/**
 * Get health stats for all registered resilient clients
 */
export declare function getAllClientStats(): CircuitStats[];
/**
 * Get a specific client by name
 */
export declare function getClient(serviceName: string): ResilientClient | undefined;
/**
 * Check if all clients are healthy
 */
export declare function areAllClientsHealthy(): boolean;
/**
 * Get list of unhealthy clients
 */
export declare function getUnhealthyClients(): string[];
export declare function getYahooFinanceClient(): ResilientClient;
export declare function getAlphaVantageClient(): ResilientClient;
export declare function getGoogleApisClient(): ResilientClient;
export declare function getWikipediaClient(): ResilientClient;
export declare function getHomeAssistantClient(): ResilientClient;
export declare function getHueClient(): ResilientClient;
export declare function getLifxClient(): ResilientClient;
export declare function getSmartThingsClient(): ResilientClient;
//# sourceMappingURL=resilient-http.d.ts.map
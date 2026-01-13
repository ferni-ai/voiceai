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
import { createLogger } from '../../utils/safe-logger.js';
import { createCircuitBreaker, CircuitBreakerError } from './circuit-breaker.js';
import { withResilience } from './resilient-executor.js';
import { humanizeError } from './error-humanizer.js';
const log = createLogger({ module: 'resilient-http' });
// Lazy import anomaly detection to avoid circular deps
let anomalyMonitor = null;
// Initialize anomaly detection lazily
async function initAnomalyDetection() {
    if (anomalyMonitor)
        return;
    try {
        const { recordLatency, recordSuccessRate } = await import('./anomaly-detection.js');
        anomalyMonitor = { recordLatency, recordSuccessRate };
    }
    catch {
        // Anomaly detection not available
    }
}
// Trigger initialization (non-blocking)
initAnomalyDetection().catch((err) => {
    log.warn({ error: String(err) }, 'Resilient HTTP anomaly detection init failed (non-critical)');
});
// Track success/failure for anomaly detection
const requestStats = new Map();
const STATS_REPORT_INTERVAL_MS = 10000; // Report every 10 seconds
function recordRequestResult(serviceName, success, durationMs) {
    // Record latency for anomaly detection
    anomalyMonitor?.recordLatency(serviceName, durationMs);
    // Track success/failure rate
    let stats = requestStats.get(serviceName);
    if (!stats) {
        stats = { successes: 0, failures: 0, lastReport: Date.now() };
        requestStats.set(serviceName, stats);
    }
    if (success) {
        stats.successes++;
    }
    else {
        stats.failures++;
    }
    // Periodically report success rate
    const now = Date.now();
    if (now - stats.lastReport > STATS_REPORT_INTERVAL_MS) {
        const total = stats.successes + stats.failures;
        if (total > 0) {
            const successRate = (stats.successes / total) * 100;
            anomalyMonitor?.recordSuccessRate(serviceName, successRate);
        }
        // Reset for next interval
        stats.successes = 0;
        stats.failures = 0;
        stats.lastReport = now;
    }
}
// ============================================================================
// DEFAULT RETRY LOGIC
// ============================================================================
// HTTP status codes that should trigger a retry
const RETRYABLE_STATUS_CODES = new Set([
    408, // Request Timeout
    429, // Too Many Requests
    500, // Internal Server Error
    502, // Bad Gateway
    503, // Service Unavailable
    504, // Gateway Timeout
]);
// Error patterns that indicate transient failures
const RETRYABLE_ERROR_PATTERNS = [
    /ECONNRESET/i,
    /ETIMEDOUT/i,
    /ENOTFOUND/i,
    /socket hang up/i,
    /network/i,
    /timeout/i,
    /temporarily unavailable/i,
    /fetch failed/i,
    /aborted/i,
];
function isRetryableError(error, statusCode) {
    // Check status code first
    if (statusCode && RETRYABLE_STATUS_CODES.has(statusCode)) {
        return true;
    }
    // Check error message patterns
    const errorStr = `${error.name} ${error.message}`;
    return RETRYABLE_ERROR_PATTERNS.some((pattern) => pattern.test(errorStr));
}
// ============================================================================
// ERROR CLASSIFICATION
// ============================================================================
function classifyError(error, statusCode) {
    if (error instanceof CircuitBreakerError) {
        return 'CIRCUIT_OPEN';
    }
    const errorStr = `${error.name} ${error.message}`.toLowerCase();
    if (errorStr.includes('timeout') || errorStr.includes('aborted')) {
        return 'TIMEOUT';
    }
    if (errorStr.includes('network') ||
        errorStr.includes('fetch') ||
        errorStr.includes('econnreset') ||
        errorStr.includes('enotfound')) {
        return 'NETWORK_ERROR';
    }
    if (errorStr.includes('json') || errorStr.includes('parse')) {
        return 'PARSE_ERROR';
    }
    if (statusCode && statusCode >= 400) {
        return 'HTTP_ERROR';
    }
    return 'UNKNOWN';
}
function createResilientError(error, statusCode) {
    return {
        message: error.message,
        code: classifyError(error, statusCode),
        statusCode,
        humanized: humanizeError(error),
    };
}
// ============================================================================
// CLIENT FACTORY
// ============================================================================
const DEFAULT_OPTIONS = {
    failureThreshold: 5,
    recoveryTimeout: 30000,
    maxRetries: 3,
    timeout: 10000,
    baseDelay: 1000,
    maxDelay: 10000,
};
// Registry of all clients for health dashboard
const clientRegistry = new Map();
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
export function createResilientClient(serviceName, options = {}) {
    // Return existing client if already created
    if (clientRegistry.has(serviceName)) {
        return clientRegistry.get(serviceName);
    }
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const shouldRetry = options.shouldRetry ?? isRetryableError;
    // Create circuit breaker for this service
    const circuit = createCircuitBreaker(serviceName, {
        failureThreshold: opts.failureThreshold,
        recoveryTimeout: opts.recoveryTimeout,
        onStateChange: options.onCircuitStateChange
            ? (name, old, newState) => options.onCircuitStateChange(old, newState)
            : undefined,
    });
    /**
     * Internal fetch implementation with circuit breaker + retry
     */
    async function resilientFetch(url, init = {}) {
        const startTime = Date.now();
        let retries = 0;
        let lastStatusCode;
        // Merge default headers
        const headers = {
            ...opts.defaultHeaders,
            ...init.headers,
        };
        // Callback for request logging
        options.onRequest?.(url, init.method || 'GET');
        try {
            // Execute through circuit breaker + retry wrapper
            const response = await circuit.execute(async () => {
                return withResilience(async () => {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), opts.timeout);
                    try {
                        const res = await fetch(url, {
                            ...init,
                            headers,
                            signal: controller.signal,
                        });
                        lastStatusCode = res.status;
                        if (!res.ok) {
                            const error = new Error(`HTTP ${res.status}: ${res.statusText}`);
                            // Attach status code for retry decision
                            error.statusCode = res.status;
                            throw error;
                        }
                        return res;
                    }
                    finally {
                        clearTimeout(timeoutId);
                    }
                }, {
                    maxRetries: opts.maxRetries,
                    baseDelay: opts.baseDelay,
                    maxDelay: opts.maxDelay,
                    operationName: serviceName,
                    shouldRetry: (error, attempt) => {
                        retries = attempt;
                        const statusCode = error.statusCode;
                        return shouldRetry(error, statusCode);
                    },
                });
            });
            // Parse JSON response
            const data = (await response.json());
            const durationMs = Date.now() - startTime;
            // Callback for response logging
            options.onResponse?.(url, response.status, durationMs);
            // Record for anomaly detection
            recordRequestResult(serviceName, true, durationMs);
            log.debug({ serviceName, url, status: response.status, durationMs, retries }, 'Request succeeded');
            return {
                data,
                error: null,
                status: response.status,
                circuitBroken: false,
                retries,
                durationMs,
            };
        }
        catch (error) {
            const durationMs = Date.now() - startTime;
            const err = error instanceof Error ? error : new Error(String(error));
            const resilientError = createResilientError(err, lastStatusCode);
            // Record for anomaly detection
            recordRequestResult(serviceName, false, durationMs);
            log.warn({
                serviceName,
                url,
                error: err.message,
                code: resilientError.code,
                durationMs,
                retries,
            }, 'Request failed');
            return {
                data: null,
                error: resilientError,
                status: lastStatusCode ?? null,
                circuitBroken: resilientError.code === 'CIRCUIT_OPEN',
                retries,
                durationMs,
            };
        }
    }
    const client = {
        name: serviceName,
        get: (url, options) => resilientFetch(url, { ...options, method: 'GET' }),
        post: (url, body, options) => resilientFetch(url, {
            ...options,
            method: 'POST',
            body: body ? JSON.stringify(body) : undefined,
            headers: {
                'Content-Type': 'application/json',
                ...options?.headers,
            },
        }),
        put: (url, body, options) => resilientFetch(url, {
            ...options,
            method: 'PUT',
            body: body ? JSON.stringify(body) : undefined,
            headers: {
                'Content-Type': 'application/json',
                ...options?.headers,
            },
        }),
        delete: (url, options) => resilientFetch(url, { ...options, method: 'DELETE' }),
        fetch: resilientFetch,
        getStats: () => {
            const stats = circuit.getStats();
            return {
                name: stats.name,
                state: stats.state,
                failures: stats.failures,
                successes: stats.successes,
                totalRequests: stats.totalRequests,
                totalFailures: stats.totalFailures,
                totalSuccesses: stats.totalSuccesses,
                lastStateChange: stats.lastStateChange,
            };
        },
        isHealthy: () => circuit.isClosed,
        reset: () => circuit.reset(),
    };
    // Register for health dashboard
    clientRegistry.set(serviceName, client);
    return client;
}
// ============================================================================
// HEALTH DASHBOARD
// ============================================================================
/**
 * Get health stats for all registered resilient clients
 */
export function getAllClientStats() {
    return Array.from(clientRegistry.values()).map((client) => client.getStats());
}
/**
 * Get a specific client by name
 */
export function getClient(serviceName) {
    return clientRegistry.get(serviceName);
}
/**
 * Check if all clients are healthy
 */
export function areAllClientsHealthy() {
    for (const client of clientRegistry.values()) {
        if (!client.isHealthy()) {
            return false;
        }
    }
    return true;
}
/**
 * Get list of unhealthy clients
 */
export function getUnhealthyClients() {
    return Array.from(clientRegistry.entries())
        .filter(([, client]) => !client.isHealthy())
        .map(([name]) => name);
}
// ============================================================================
// PRE-CONFIGURED CLIENTS
// ============================================================================
// Common clients used across the application
// These are created lazily to avoid initialization issues
let _yahooFinanceClient = null;
let _alphaVantageClient = null;
let _googleApisClient = null;
let _wikipediaClient = null;
let _homeAssistantClient = null;
let _hueClient = null;
let _lifxClient = null;
let _smartThingsClient = null;
export function getYahooFinanceClient() {
    if (!_yahooFinanceClient) {
        _yahooFinanceClient = createResilientClient('yahoo-finance', {
            timeout: 8000,
            maxRetries: 2,
            defaultHeaders: { 'User-Agent': 'Mozilla/5.0' },
        });
    }
    return _yahooFinanceClient;
}
export function getAlphaVantageClient() {
    if (!_alphaVantageClient) {
        _alphaVantageClient = createResilientClient('alpha-vantage', {
            timeout: 8000,
            maxRetries: 2,
        });
    }
    return _alphaVantageClient;
}
export function getGoogleApisClient() {
    if (!_googleApisClient) {
        _googleApisClient = createResilientClient('google-apis', {
            timeout: 5000,
            maxRetries: 2,
        });
    }
    return _googleApisClient;
}
export function getWikipediaClient() {
    if (!_wikipediaClient) {
        _wikipediaClient = createResilientClient('wikipedia', {
            timeout: 5000,
            maxRetries: 2,
            defaultHeaders: { 'User-Agent': 'VoiceAgent/1.0' },
        });
    }
    return _wikipediaClient;
}
export function getHomeAssistantClient() {
    if (!_homeAssistantClient) {
        _homeAssistantClient = createResilientClient('home-assistant', {
            timeout: 10000,
            maxRetries: 2,
            failureThreshold: 3, // Smart home should fail faster
        });
    }
    return _homeAssistantClient;
}
export function getHueClient() {
    if (!_hueClient) {
        _hueClient = createResilientClient('philips-hue', {
            timeout: 5000,
            maxRetries: 2,
            failureThreshold: 3,
        });
    }
    return _hueClient;
}
export function getLifxClient() {
    if (!_lifxClient) {
        _lifxClient = createResilientClient('lifx', {
            timeout: 10000,
            maxRetries: 2,
            failureThreshold: 3,
        });
    }
    return _lifxClient;
}
export function getSmartThingsClient() {
    if (!_smartThingsClient) {
        _smartThingsClient = createResilientClient('smartthings', {
            timeout: 10000,
            maxRetries: 2,
            failureThreshold: 3,
        });
    }
    return _smartThingsClient;
}
//# sourceMappingURL=resilient-http.js.map
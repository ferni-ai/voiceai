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
import { humanizeError, type HumanizedError } from './error-humanizer.js';

const log = createLogger({ module: 'resilient-http' });

// ============================================================================
// TYPES
// ============================================================================

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

function isRetryableError(error: Error, statusCode?: number): boolean {
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

function classifyError(
  error: Error,
  statusCode?: number
): ResilientError['code'] {
  if (error instanceof CircuitBreakerError) {
    return 'CIRCUIT_OPEN';
  }

  const errorStr = `${error.name} ${error.message}`.toLowerCase();

  if (errorStr.includes('timeout') || errorStr.includes('aborted')) {
    return 'TIMEOUT';
  }

  if (
    errorStr.includes('network') ||
    errorStr.includes('fetch') ||
    errorStr.includes('econnreset') ||
    errorStr.includes('enotfound')
  ) {
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

function createResilientError(
  error: Error,
  statusCode?: number
): ResilientError {
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

const DEFAULT_OPTIONS: Required<Omit<ResilientClientOptions, 'onCircuitStateChange' | 'onRequest' | 'onResponse' | 'defaultHeaders' | 'shouldRetry'>> = {
  failureThreshold: 5,
  recoveryTimeout: 30000,
  maxRetries: 3,
  timeout: 10000,
  baseDelay: 1000,
  maxDelay: 10000,
};

// Registry of all clients for health dashboard
const clientRegistry = new Map<string, ResilientClient>();

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
export function createResilientClient(
  serviceName: string,
  options: ResilientClientOptions = {}
): ResilientClient {
  // Return existing client if already created
  if (clientRegistry.has(serviceName)) {
    return clientRegistry.get(serviceName)!;
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };
  const shouldRetry = options.shouldRetry ?? isRetryableError;

  // Create circuit breaker for this service
  const circuit = createCircuitBreaker(serviceName, {
    failureThreshold: opts.failureThreshold,
    recoveryTimeout: opts.recoveryTimeout,
    onStateChange: options.onCircuitStateChange
      ? (name, old, newState) => options.onCircuitStateChange!(old, newState)
      : undefined,
  });

  /**
   * Internal fetch implementation with circuit breaker + retry
   */
  async function resilientFetch<T>(
    url: string,
    init: RequestInit = {}
  ): Promise<ResilientResponse<T>> {
    const startTime = Date.now();
    let retries = 0;
    let lastStatusCode: number | undefined;

    // Merge default headers
    const headers = {
      ...opts.defaultHeaders,
      ...(init.headers as Record<string, string>),
    };

    // Callback for request logging
    options.onRequest?.(url, init.method || 'GET');

    try {
      // Execute through circuit breaker + retry wrapper
      const response = await circuit.execute(async () => {
        return withResilience(
          async () => {
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
                (error as Error & { statusCode?: number }).statusCode = res.status;
                throw error;
              }

              return res;
            } finally {
              clearTimeout(timeoutId);
            }
          },
          {
            maxRetries: opts.maxRetries,
            baseDelay: opts.baseDelay,
            maxDelay: opts.maxDelay,
            operationName: serviceName,
            shouldRetry: (error, attempt) => {
              retries = attempt;
              const statusCode = (error as Error & { statusCode?: number }).statusCode;
              return shouldRetry(error, statusCode);
            },
          }
        );
      });

      // Parse JSON response
      const data = (await response.json()) as T;
      const durationMs = Date.now() - startTime;

      // Callback for response logging
      options.onResponse?.(url, response.status, durationMs);

      log.debug(
        { serviceName, url, status: response.status, durationMs, retries },
        'Request succeeded'
      );

      return {
        data,
        error: null,
        status: response.status,
        circuitBroken: false,
        retries,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const err = error instanceof Error ? error : new Error(String(error));
      const resilientError = createResilientError(err, lastStatusCode);

      log.warn(
        {
          serviceName,
          url,
          error: err.message,
          code: resilientError.code,
          durationMs,
          retries,
        },
        'Request failed'
      );

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

  const client: ResilientClient = {
    name: serviceName,

    get: <T>(url: string, options?: RequestInit) =>
      resilientFetch<T>(url, { ...options, method: 'GET' }),

    post: <T>(url: string, body?: unknown, options?: RequestInit) =>
      resilientFetch<T>(url, {
        ...options,
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
        headers: {
          'Content-Type': 'application/json',
          ...(options?.headers as Record<string, string>),
        },
      }),

    put: <T>(url: string, body?: unknown, options?: RequestInit) =>
      resilientFetch<T>(url, {
        ...options,
        method: 'PUT',
        body: body ? JSON.stringify(body) : undefined,
        headers: {
          'Content-Type': 'application/json',
          ...(options?.headers as Record<string, string>),
        },
      }),

    delete: <T>(url: string, options?: RequestInit) =>
      resilientFetch<T>(url, { ...options, method: 'DELETE' }),

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
export function getAllClientStats(): CircuitStats[] {
  return Array.from(clientRegistry.values()).map((client) => client.getStats());
}

/**
 * Get a specific client by name
 */
export function getClient(serviceName: string): ResilientClient | undefined {
  return clientRegistry.get(serviceName);
}

/**
 * Check if all clients are healthy
 */
export function areAllClientsHealthy(): boolean {
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
export function getUnhealthyClients(): string[] {
  return Array.from(clientRegistry.entries())
    .filter(([, client]) => !client.isHealthy())
    .map(([name]) => name);
}

// ============================================================================
// PRE-CONFIGURED CLIENTS
// ============================================================================

// Common clients used across the application
// These are created lazily to avoid initialization issues

let _yahooFinanceClient: ResilientClient | null = null;
let _alphaVantageClient: ResilientClient | null = null;
let _googleApisClient: ResilientClient | null = null;
let _wikipediaClient: ResilientClient | null = null;
let _homeAssistantClient: ResilientClient | null = null;
let _hueClient: ResilientClient | null = null;
let _lifxClient: ResilientClient | null = null;
let _smartThingsClient: ResilientClient | null = null;

export function getYahooFinanceClient(): ResilientClient {
  if (!_yahooFinanceClient) {
    _yahooFinanceClient = createResilientClient('yahoo-finance', {
      timeout: 8000,
      maxRetries: 2,
      defaultHeaders: { 'User-Agent': 'Mozilla/5.0' },
    });
  }
  return _yahooFinanceClient;
}

export function getAlphaVantageClient(): ResilientClient {
  if (!_alphaVantageClient) {
    _alphaVantageClient = createResilientClient('alpha-vantage', {
      timeout: 8000,
      maxRetries: 2,
    });
  }
  return _alphaVantageClient;
}

export function getGoogleApisClient(): ResilientClient {
  if (!_googleApisClient) {
    _googleApisClient = createResilientClient('google-apis', {
      timeout: 5000,
      maxRetries: 2,
    });
  }
  return _googleApisClient;
}

export function getWikipediaClient(): ResilientClient {
  if (!_wikipediaClient) {
    _wikipediaClient = createResilientClient('wikipedia', {
      timeout: 5000,
      maxRetries: 2,
      defaultHeaders: { 'User-Agent': 'VoiceAgent/1.0' },
    });
  }
  return _wikipediaClient;
}

export function getHomeAssistantClient(): ResilientClient {
  if (!_homeAssistantClient) {
    _homeAssistantClient = createResilientClient('home-assistant', {
      timeout: 10000,
      maxRetries: 2,
      failureThreshold: 3, // Smart home should fail faster
    });
  }
  return _homeAssistantClient;
}

export function getHueClient(): ResilientClient {
  if (!_hueClient) {
    _hueClient = createResilientClient('philips-hue', {
      timeout: 5000,
      maxRetries: 2,
      failureThreshold: 3,
    });
  }
  return _hueClient;
}

export function getLifxClient(): ResilientClient {
  if (!_lifxClient) {
    _lifxClient = createResilientClient('lifx', {
      timeout: 10000,
      maxRetries: 2,
      failureThreshold: 3,
    });
  }
  return _lifxClient;
}

export function getSmartThingsClient(): ResilientClient {
  if (!_smartThingsClient) {
    _smartThingsClient = createResilientClient('smartthings', {
      timeout: 10000,
      maxRetries: 2,
      failureThreshold: 3,
    });
  }
  return _smartThingsClient;
}


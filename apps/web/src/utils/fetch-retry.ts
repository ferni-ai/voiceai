/**
 * Fetch with Retry and Error Handling
 *
 * Provides robust HTTP request handling with:
 * - Exponential backoff retry logic
 * - Offline detection
 * - Request timeout
 * - Type-safe response parsing
 */

import { createLogger } from './logger.js';
import { fetchWithDeadline } from './request-deadline.js';

const log = createLogger('FetchRetry');

// ============================================================================
// TYPES
// ============================================================================

export interface FetchRetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in ms before first retry (default: 1000) */
  initialDelay?: number;
  /** Maximum delay in ms between retries (default: 10000) */
  maxDelay?: number;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /** HTTP status codes that should trigger a retry (default: [408, 429, 500, 502, 503, 504]) */
  retryStatusCodes?: number[];
  /** Whether to retry on network errors (default: true) */
  retryOnNetworkError?: boolean;
}

export interface FetchResult<T> {
  data: T | null;
  error: Error | null;
  status: number | null;
  retries: number;
  offline: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_OPTIONS: Required<FetchRetryOptions> = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  timeout: 30000,
  retryStatusCodes: [408, 429, 500, 502, 503, 504],
  retryOnNetworkError: true,
};

// ============================================================================
// OFFLINE DETECTION
// ============================================================================

/**
 * Check if the browser reports offline status.
 *
 * NOTE: navigator.onLine is unreliable on some platforms (macOS VPNs, proxies).
 * This function is kept for backward compatibility, but fetchWithRetry no longer
 * short-circuits based on it — actual fetch attempts are more reliable.
 */
export function isOffline(): boolean {
  if (typeof navigator === 'undefined') return false;
  return !navigator.onLine;
}

/**
 * Subscribe to online/offline status changes.
 */
export function onOnlineStatusChange(callback: (online: boolean) => void): () => void {
  const handleOnline = () => callback(true);
  const handleOffline = () => callback(false);

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

// ============================================================================
// FETCH WITH RETRY
// ============================================================================

/**
 * Calculate delay for exponential backoff.
 */
export function calculateDelay(attempt: number, initialDelay: number, maxDelay: number): number {
  // Exponential backoff with "equal jitter": half the step fixed, half random.
  // The old 0-30% add-on kept every page-load retry within a few ms of each
  // other (all at ~1.6 s, then ~2.8 s), so a struggling server got a herd.
  const step = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);
  return step / 2 + Math.random() * (step / 2);
}

/** Requests in flight, by key; see dedupeInFlight. */
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Run `request` unless one with the same key is already in flight, in which
 * case share its result. On page load several modules ask for the same thing
 * at once (/spotify/status from two places, each with its own retries: four
 * requests to a struggling server); the second caller now waits on the first.
 */
export function dedupeInFlight<R>(key: string, request: () => Promise<R>): Promise<R> {
  const pending = inFlight.get(key) as Promise<R> | undefined;
  if (pending) return pending;
  const started = request();
  inFlight.set(key, started);
  const forget = (): void => void inFlight.delete(key);
  started.then(forget, forget);
  return started;
}

/**
 * Sleep for a specified duration.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch with automatic retry and exponential backoff.
 */
export async function fetchWithRetry<T>(
  url: string,
  options: RequestInit = {},
  retryOptions: FetchRetryOptions = {}
): Promise<FetchResult<T>> {
  const opts = { ...DEFAULT_OPTIONS, ...retryOptions };
  let lastError: Error | null = null;
  let lastStatus: number | null = null;
  let retries = 0;

  // Log if navigator reports offline, but don't short-circuit —
  // navigator.onLine is unreliable on some platforms. Let the fetch
  // attempt proceed; if we're truly offline, it will fail with a
  // network error and the retry logic will handle it.
  if (isOffline()) {
    log.debug(`navigator.onLine=false for ${url}, attempting fetch anyway`);
  }

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      const response = await fetchWithDeadline(url, options, opts.timeout);
      lastStatus = response.status;

      // Success
      if (response.ok) {
        const data = (await response.json()) as T;
        return {
          data,
          error: null,
          status: response.status,
          retries,
          offline: false,
        };
      }

      // Check if we should retry this status code
      if (opts.retryStatusCodes.includes(response.status) && attempt < opts.maxRetries) {
        retries++;
        const delay = calculateDelay(attempt, opts.initialDelay, opts.maxDelay);
        log.debug(`Retry ${retries}/${opts.maxRetries} for ${url} after ${delay}ms (status ${response.status})`);
        await sleep(delay);
        continue;
      }

      // Non-retryable error
      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
      break;
    } catch (error) {
      // A timeout arrives as RequestTimeoutError ("Request timeout after <ms>ms")
      lastError = error instanceof Error ? error : new Error(String(error));

      // Retry on network errors if configured
      if (opts.retryOnNetworkError && attempt < opts.maxRetries) {
        retries++;
        const delay = calculateDelay(attempt, opts.initialDelay, opts.maxDelay);
        log.debug(`Retry ${retries}/${opts.maxRetries} for ${url} after ${delay}ms (network error)`);
        await sleep(delay);
        continue;
      }

      break;
    }
  }

  log.error(`Fetch failed for ${url} after ${retries} retries:`, lastError);
  return {
    data: null,
    error: lastError,
    status: lastStatus,
    retries,
    offline: false,
  };
}

/**
 * POST with retry.
 */
export async function postWithRetry<T, B = unknown>(
  url: string,
  body: B,
  retryOptions?: FetchRetryOptions
): Promise<FetchResult<T>> {
  return fetchWithRetry<T>(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    retryOptions
  );
}

/**
 * GET with retry.
 */
export async function getWithRetry<T>(
  url: string,
  retryOptions?: FetchRetryOptions
): Promise<FetchResult<T>> {
  return fetchWithRetry<T>(url, { method: 'GET' }, retryOptions);
}

// ============================================================================
// SAFE JSON PARSING
// ============================================================================

/**
 * Safely parse JSON with error handling.
 * Returns null if parsing fails instead of throwing.
 */
export function safeJsonParse<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    log.warn('Failed to parse JSON:', error);
    return fallback;
  }
}

/**
 * Safely get and parse JSON from localStorage.
 */
export function getLocalStorageJson<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return safeJsonParse(stored, fallback);
  } catch {
    // localStorage not available (private browsing)
    return fallback;
  }
}

/**
 * Safely set JSON to localStorage.
 */
export function setLocalStorageJson<T>(key: string, value: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    log.warn(`Failed to save to localStorage: ${key}`);
    return false;
  }
}

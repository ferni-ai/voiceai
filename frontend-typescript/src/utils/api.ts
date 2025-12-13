/**
 * API Utilities
 *
 * Centralized helper for making authenticated API calls.
 * Handles userId injection for all backend requests.
 *
 * Self-healing features:
 * - Automatic retry with exponential backoff for transient failures
 * - Offline detection
 * - Request timeout handling
 *
 * Authentication strategy:
 * - PRIMARY: Firebase Auth token (Authorization: Bearer header)
 * - FALLBACK: X-User-Id header for user identification (migration)
 * - DEV MODE: X-Admin-Key: dev-mode to bypass auth
 */

import { getAuthToken, getFirebaseUid, initAuth } from '../services/firebase-auth.service.js';
import { isDevelopment } from './environment.js';
import { createLogger } from './logger.js';
import { fetchWithRetry, isOffline, type FetchRetryOptions } from './fetch-retry.js';

const log = createLogger('API');

// Track if we've ensured auth is ready
let authReadyPromise: Promise<void> | null = null;

/**
 * Ensure Firebase Auth is initialized before making API calls.
 * This prevents race conditions where API calls happen before auth is ready.
 */
async function ensureAuthReady(): Promise<void> {
  if (!authReadyPromise) {
    authReadyPromise = initAuth().then(() => {
      // Auth is now ready
    }).catch(() => {
      // Auth failed to initialize - continue without it
      // API calls will use X-User-Id fallback
    });
  }
  return authReadyPromise;
}

/**
 * Get the current user ID.
 * Prefers Firebase UID, falls back to device-based ID from localStorage.
 */
export function getUserId(): string | null {
  // Prefer Firebase UID
  const firebaseUid = getFirebaseUid();
  if (firebaseUid) {
    return firebaseUid;
  }

  // Fallback to legacy device-based ID
  try {
    return localStorage.getItem('ferni_user_id');
  } catch {
    return null;
  }
}

/**
 * Get device ID from localStorage.
 */
export function getDeviceId(): string | null {
  try {
    return localStorage.getItem('ferni_device_id');
  } catch {
    return null;
  }
}

/**
 * Build standard headers for API requests (sync version).
 * NOTE: Prefer using getApiHeadersAsync() for Firebase token support.
 * This sync version only includes X-User-Id, not the Bearer token.
 */
export function getApiHeaders(includeJson = true): HeadersInit {
  const headers: HeadersInit = {};

  // In development mode, add admin key to bypass auth
  if (isDevelopment()) {
    headers['X-Admin-Key'] = 'dev-mode';
  }

  // Add user ID for authentication
  const userId = getUserId();
  if (userId) {
    headers['X-User-Id'] = userId;
  }

  // Add device ID for tracking
  const deviceId = getDeviceId();
  if (deviceId) {
    headers['X-Device-Id'] = deviceId;
  }

  // Add JSON content type if needed
  if (includeJson) {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
}

/**
 * Build standard headers for API requests with Firebase auth token (async version).
 * This is the preferred method for authenticated API calls.
 * 
 * IMPORTANT: This ensures Firebase Auth is initialized before getting the token.
 * This prevents 401 errors from race conditions during app startup.
 */
export async function getApiHeadersAsync(includeJson = true): Promise<HeadersInit> {
  // Ensure auth is ready before trying to get the token
  // This prevents race conditions where API calls happen before auth initializes
  await ensureAuthReady();
  
  const headers = getApiHeaders(includeJson);

  // Get Firebase auth token
  try {
    const token = await getAuthToken();
    if (token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }
  } catch {
    // Firebase token not available - continue with X-User-Id only
    // This is expected during migration or if Firebase isn't configured
  }

  return headers;
}

// Default retry options for API calls
const DEFAULT_RETRY_OPTIONS: FetchRetryOptions = {
  maxRetries: 2,
  initialDelay: 500,
  maxDelay: 3000,
  timeout: 15000,
  // Don't retry on 401/403 (auth errors) or 400 (bad request)
  retryStatusCodes: [408, 429, 500, 502, 503, 504],
  retryOnNetworkError: true,
};

/**
 * Make an authenticated GET request with self-healing retry logic.
 * Automatically retries on transient failures with exponential backoff.
 */
export async function apiGet<T = unknown>(
  path: string,
  params?: Record<string, string>,
  retryOptions?: Partial<FetchRetryOptions>
): Promise<{ ok: boolean; data?: T; error?: string; status: number; retries?: number; offline?: boolean }> {
  // Early exit if offline
  if (isOffline()) {
    log.warn('API GET skipped: device is offline', { path });
    return { ok: false, error: 'Device is offline', status: 0, offline: true };
  }

  try {
    const url = new URL(path, window.location.origin);

    // Add query params
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    // Always include userId in query for compatibility
    const userId = getUserId();
    if (userId && !url.searchParams.has('userId')) {
      url.searchParams.set('userId', userId);
    }

    // Get async headers with Firebase auth token
    const headers = await getApiHeadersAsync(false);

    // Use fetchWithRetry for self-healing
    const result = await fetchWithRetry<T>(
      url.toString(),
      { method: 'GET', headers },
      { ...DEFAULT_RETRY_OPTIONS, ...retryOptions }
    );

    if (result.error) {
      // 401 errors are expected before auth completes - use debug level
      if (result.status === 401) {
        log.debug('API GET unauthorized (auth pending)', { path });
      } else {
        log.warn('API GET failed', { 
          path, 
          status: result.status, 
          error: result.error.message,
          retries: result.retries 
        });
      }
      return {
        ok: false,
        error: result.error.message,
        status: result.status ?? 0,
        retries: result.retries,
        offline: result.offline,
      };
    }

    if (result.retries > 0) {
      log.debug('API GET succeeded after retry', { path, retries: result.retries });
    }

    return { 
      ok: true, 
      data: result.data!, 
      status: result.status ?? 200,
      retries: result.retries,
    };
  } catch (err) {
    log.error('API GET error', { path, error: err });
    return { ok: false, error: String(err), status: 0 };
  }
}

/**
 * Make an authenticated POST request with self-healing retry logic.
 * Automatically retries on transient failures with exponential backoff.
 */
export async function apiPost<T = unknown>(
  path: string,
  body?: unknown,
  retryOptions?: Partial<FetchRetryOptions>
): Promise<{ ok: boolean; data?: T; error?: string; status: number; retries?: number; offline?: boolean }> {
  // Early exit if offline
  if (isOffline()) {
    log.warn('API POST skipped: device is offline', { path });
    return { ok: false, error: 'Device is offline', status: 0, offline: true };
  }

  try {
    const userId = getUserId();

    // Ensure userId is in body if not already present
    const finalBody =
      body && typeof body === 'object' && !Array.isArray(body) ? { userId, ...body } : body;

    // Get async headers with Firebase auth token
    const headers = await getApiHeadersAsync(true);

    // Use fetchWithRetry for self-healing
    const result = await fetchWithRetry<T>(
      path,
      { 
        method: 'POST', 
        headers,
        body: JSON.stringify(finalBody),
      },
      { ...DEFAULT_RETRY_OPTIONS, ...retryOptions }
    );

    if (result.error) {
      // 401 errors are expected before auth completes - use debug level
      if (result.status === 401) {
        log.debug('API POST unauthorized (auth pending)', { path });
      } else {
        log.warn('API POST failed', { 
          path, 
          status: result.status, 
          error: result.error.message,
          retries: result.retries 
        });
      }
      return {
        ok: false,
        error: result.error.message,
        status: result.status ?? 0,
        retries: result.retries,
        offline: result.offline,
      };
    }

    if (result.retries > 0) {
      log.debug('API POST succeeded after retry', { path, retries: result.retries });
    }

    return { 
      ok: true, 
      data: result.data!, 
      status: result.status ?? 200,
      retries: result.retries,
    };
  } catch (err) {
    log.error('API POST error', { path, error: err });
    return { ok: false, error: String(err), status: 0 };
  }
}

/**
 * Make an authenticated DELETE request with self-healing retry logic.
 * Automatically retries on transient failures with exponential backoff.
 */
export async function apiDelete<T = unknown>(
  path: string,
  params?: Record<string, string>,
  retryOptions?: Partial<FetchRetryOptions>
): Promise<{ ok: boolean; data?: T; error?: string; status: number; retries?: number; offline?: boolean }> {
  // Early exit if offline
  if (isOffline()) {
    log.warn('API DELETE skipped: device is offline', { path });
    return { ok: false, error: 'Device is offline', status: 0, offline: true };
  }

  try {
    const url = new URL(path, window.location.origin);

    // Add query params
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    // Always include userId in query
    const userId = getUserId();
    if (userId && !url.searchParams.has('userId')) {
      url.searchParams.set('userId', userId);
    }

    // Get async headers with Firebase auth token
    const headers = await getApiHeadersAsync(false);

    // Use fetchWithRetry for self-healing
    const result = await fetchWithRetry<T>(
      url.toString(),
      { method: 'DELETE', headers },
      { ...DEFAULT_RETRY_OPTIONS, ...retryOptions }
    );

    if (result.error) {
      // 401 errors are expected before auth completes - use debug level
      if (result.status === 401) {
        log.debug('API DELETE unauthorized (auth pending)', { path });
      } else {
        log.warn('API DELETE failed', { 
          path, 
          status: result.status, 
          error: result.error.message,
          retries: result.retries 
        });
      }
      return {
        ok: false,
        error: result.error.message,
        status: result.status ?? 0,
        retries: result.retries,
        offline: result.offline,
      };
    }

    if (result.retries > 0) {
      log.debug('API DELETE succeeded after retry', { path, retries: result.retries });
    }

    return { 
      ok: true, 
      data: result.data!, 
      status: result.status ?? 200,
      retries: result.retries,
    };
  } catch (err) {
    log.error('API DELETE error', { path, error: err });
    return { ok: false, error: String(err), status: 0 };
  }
}

export default {
  getUserId,
  getDeviceId,
  getApiHeaders,
  get: apiGet,
  post: apiPost,
  delete: apiDelete,
};

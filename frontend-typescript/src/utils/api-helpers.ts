/**
 * API Helpers - Utilities for making authenticated API calls
 *
 * Authentication strategy:
 * - PRIMARY: Firebase Auth token (Authorization: Bearer header)
 * - FALLBACK: X-User-Id header with device-based ID (for migration)
 * - DEV MODE: X-Admin-Key: dev-mode to bypass auth
 *
 * The authentication flow:
 * 1. Try to get Firebase ID token (async)
 * 2. If available, send as Authorization: Bearer token
 * 3. Also send X-User-Id for backward compatibility during migration
 */

import { getAuthToken, getFirebaseUid } from '../services/firebase-auth.service.js';
import { isDevelopment } from './environment.js';

/**
 * Get the legacy device-based user ID from localStorage.
 * Used for backward compatibility during migration.
 */
function getLegacyUserId(): string | null {
  try {
    return localStorage.getItem('ferni_user_id');
  } catch {
    return null;
  }
}

/**
 * Get the current user ID for API authentication.
 * Prefers Firebase UID, falls back to device-based ID.
 */
export function getUserId(): string | null {
  // Prefer Firebase UID
  const firebaseUid = getFirebaseUid();
  if (firebaseUid) {
    return firebaseUid;
  }

  // Fallback to legacy device-based ID
  return getLegacyUserId();
}

/**
 * Get headers for API calls, including auth headers (sync version).
 * NOTE: Prefer using getApiHeadersAsync() for Firebase token support.
 * This sync version only includes X-User-Id, not the Bearer token.
 */
export function getApiHeaders(additionalHeaders?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...additionalHeaders,
  };

  // In development mode, add admin key to bypass auth
  if (isDevelopment()) {
    headers['X-Admin-Key'] = 'dev-mode';
  }

  // Include user ID header for backward compatibility
  const userId = getUserId();
  if (userId) {
    headers['X-User-Id'] = userId;
  }

  return headers;
}

/**
 * Get headers for API calls with Firebase auth token (async version).
 * This is the preferred method for authenticated API calls.
 */
export async function getApiHeadersAsync(
  additionalHeaders?: Record<string, string>
): Promise<Record<string, string>> {
  const headers = getApiHeaders(additionalHeaders);

  // Get Firebase auth token
  try {
    const token = await getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  } catch (error) {
    // Firebase token not available - continue with X-User-Id only
    // This is expected during migration or if Firebase isn't configured
  }

  return headers;
}

/**
 * Get fetch options for API calls (sync version).
 * NOTE: Prefer using apiFetch() which handles async auth.
 */
export function getApiFetchOptions(options?: RequestInit): RequestInit {
  return {
    ...options,
    headers: {
      ...getApiHeaders(),
      ...((options?.headers as Record<string, string>) || {}),
    },
  };
}

/**
 * Make an authenticated API call.
 * Automatically adds Firebase auth token and dev headers.
 */
export async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const headers = await getApiHeadersAsync();

  return fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...((options?.headers as Record<string, string>) || {}),
    },
  });
}

/**
 * Make an authenticated GET request
 */
export async function apiGet(url: string): Promise<Response> {
  return apiFetch(url, { method: 'GET' });
}

/**
 * Make an authenticated POST request
 */
export async function apiPost(url: string, body: unknown): Promise<Response> {
  return apiFetch(url, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Make an authenticated PUT request
 */
export async function apiPut(url: string, body: unknown): Promise<Response> {
  return apiFetch(url, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/**
 * Make an authenticated DELETE request
 */
export async function apiDelete(url: string): Promise<Response> {
  return apiFetch(url, { method: 'DELETE' });
}

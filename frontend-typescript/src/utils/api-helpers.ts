/**
 * API Helpers - Utilities for making authenticated API calls
 * 
 * Authentication strategy:
 * - Development: Uses X-Admin-Key: dev-mode to bypass auth
 * - Production: Uses X-User-Id header with device-based ID
 * 
 * The device ID is stored in localStorage as 'ferni_user_id' and should
 * follow the format 'device:{uuid}' for production auth.
 */

import { isDevelopment } from './environment.js';

/**
 * Get the current user ID for API authentication
 * Returns device-based ID (device:{uuid}) for production auth
 */
function getUserId(): string | null {
  try {
    return localStorage.getItem('ferni_user_id');
  } catch {
    return null;
  }
}

/**
 * Get headers for API calls, including auth headers
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

  // Always include user ID header if available
  // In production, this is required for authentication (device:{uuid} format)
  const userId = getUserId();
  if (userId) {
    headers['X-User-Id'] = userId;
  }

  return headers;
}

/**
 * Get fetch options for API calls with dev auth
 */
export function getApiFetchOptions(options?: RequestInit): RequestInit {
  return {
    ...options,
    headers: {
      ...getApiHeaders(),
      ...(options?.headers as Record<string, string> || {}),
    },
  };
}

/**
 * Make an authenticated API call
 * Automatically adds dev auth headers in development mode
 */
export async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  return fetch(url, getApiFetchOptions(options));
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


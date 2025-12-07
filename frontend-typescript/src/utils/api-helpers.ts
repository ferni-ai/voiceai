/**
 * API Helpers - Utilities for making authenticated API calls
 * 
 * In development mode, adds admin_key to bypass authentication.
 * In production, uses actual user authentication.
 */

import { isDevelopment } from './environment.js';

/**
 * Get headers for API calls, including dev auth bypass when appropriate
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


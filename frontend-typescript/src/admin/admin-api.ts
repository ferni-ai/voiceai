/**
 * Admin API Utilities
 *
 * Centralized helper for making authenticated admin API calls.
 * Uses VITE_ADMIN_API_KEY in production, falls back to dev-mode in development.
 *
 * @module AdminAPI
 */

import { isDevelopment } from '../utils/environment.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('AdminAPI');

/**
 * Get the admin API key for authentication.
 * In development, uses 'dev-mode' which the backend accepts.
 * In production, uses VITE_ADMIN_API_KEY environment variable.
 */
export function getAdminApiKey(): string {
  // In development, use dev-mode (backend accepts this when NODE_ENV !== 'production')
  if (isDevelopment()) {
    return 'dev-mode';
  }

  // In production, use the admin API key from environment
  const apiKey = import.meta.env?.VITE_ADMIN_API_KEY;
  if (!apiKey) {
    log.warn('VITE_ADMIN_API_KEY not set - admin API calls will fail in production');
    return 'dev-mode'; // Fallback, but will be rejected by backend
  }

  return apiKey;
}

/**
 * Get headers for admin API requests.
 */
export function getAdminHeaders(): HeadersInit {
  const apiKey = getAdminApiKey();

  // Use X-API-Key for production admin keys, X-Admin-Key for dev-mode
  if (apiKey === 'dev-mode') {
    return {
      'x-admin-key': 'dev-mode',
    };
  }

  return {
    'X-API-Key': apiKey,
  };
}

/**
 * Make an authenticated admin GET request.
 */
export async function adminGet<T = unknown>(
  path: string,
  params?: Record<string, string>
): Promise<{ ok: boolean; data?: T; error?: string; status: number }> {
  try {
    const url = new URL(path, window.location.origin);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: getAdminHeaders(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      log.warn('Admin GET failed', { path, status: response.status, error: errorData });
      return {
        ok: false,
        error: errorData.error || `HTTP ${response.status}`,
        status: response.status,
      };
    }

    const data = await response.json();
    return { ok: true, data, status: response.status };
  } catch (err) {
    log.error('Admin GET error', { path, error: err });
    return { ok: false, error: String(err), status: 0 };
  }
}

/**
 * Make an authenticated admin POST request.
 */
export async function adminPost<T = unknown>(
  path: string,
  body?: unknown
): Promise<{ ok: boolean; data?: T; error?: string; status: number }> {
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: {
        ...getAdminHeaders(),
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      log.warn('Admin POST failed', { path, status: response.status, error: errorData });
      return {
        ok: false,
        error: errorData.error || `HTTP ${response.status}`,
        status: response.status,
      };
    }

    const data = await response.json();
    return { ok: true, data, status: response.status };
  } catch (err) {
    log.error('Admin POST error', { path, error: err });
    return { ok: false, error: String(err), status: 0 };
  }
}

export default {
  getAdminApiKey,
  getAdminHeaders,
  get: adminGet,
  post: adminPost,
};

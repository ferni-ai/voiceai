/**
 * Admin API Utilities
 *
 * Centralized helper for making authenticated admin API calls.
 *
 * Authentication strategy (in order of precedence):
 * 1. Firebase Auth token with admin claim (Authorization: Bearer)
 * 2. API Key (X-API-Key header) - For server-to-server calls
 * 3. Dev Mode (X-Admin-Key: 'dev-mode') - For local development only
 *
 * @module AdminAPI
 */

import {
  getAdminApiKey,
  getAdminHeaders,
  getAdminHeadersAsync,
} from '../services/admin-auth.service.js';
import { createLogger } from '../utils/logger.js';

export { getAdminApiKey, getAdminHeaders, getAdminHeadersAsync };

const log = createLogger('AdminAPI');

/**
 * Make an authenticated admin GET request.
 * Uses Firebase auth token for authentication in production.
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

    // Use async headers to include Firebase auth token
    const headers = await getAdminHeadersAsync();

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      log.warn('Admin GET failed', { path, status: response.status, error: errorData });
      return {
        ok: false,
        error: errorData.error ?? `HTTP ${response.status}`,
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
 * Uses Firebase auth token for authentication in production.
 */
export async function adminPost<T = unknown>(
  path: string,
  body?: unknown
): Promise<{ ok: boolean; data?: T; error?: string; status: number }> {
  try {
    // Use async headers to include Firebase auth token
    const headers = await getAdminHeadersAsync();

    const response = await fetch(path, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      log.warn('Admin POST failed', { path, status: response.status, error: errorData });
      return {
        ok: false,
        error: errorData.error ?? `HTTP ${response.status}`,
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
  getAdminHeadersAsync,
  get: adminGet,
  post: adminPost,
};

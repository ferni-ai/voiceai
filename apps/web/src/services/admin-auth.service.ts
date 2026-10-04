/**
 * Admin Auth Headers
 *
 * Builds the authentication headers for admin API calls. Lives in services/
 * (not admin/) because app services such as soul-stats also call admin
 * endpoints, and services may not depend on the admin section.
 *
 * Authentication strategy (in order of precedence):
 * 1. Firebase Auth token with admin claim (Authorization: Bearer)
 * 2. API Key (X-API-Key header) - For server-to-server calls
 * 3. Dev Mode (X-Admin-Key: 'dev-mode') - For local development only
 *
 * @module AdminAuthService
 */

import { getAuthToken, initAuth } from './firebase-auth.service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('AdminAuth');

// Track if we've ensured auth is ready
let authReadyPromise: Promise<void> | null = null;

/**
 * Ensure Firebase Auth is initialized before making admin API calls.
 * This prevents race conditions where API calls happen before auth is ready.
 */
async function ensureAuthReady(): Promise<void> {
  if (!authReadyPromise) {
    authReadyPromise = initAuth()
      .then(() => {
        // Auth is now ready
      })
      .catch(() => {
        // Auth failed to initialize - continue with fallback
      });
  }
  return authReadyPromise;
}

/**
 * Get the admin API key for authentication.
 * In development, uses 'dev-mode' which the backend accepts.
 * In production, uses VITE_ADMIN_API_KEY environment variable.
 * 
 * SECURITY: Uses import.meta.env.DEV which is ONLY true during `vite dev` builds.
 * This is more secure than hostname detection which could be spoofed.
 */
export function getAdminApiKey(): string {
  // SECURITY: Only use dev-mode when Vite's DEV flag is true
  // This flag is set at build time and cannot be changed at runtime
  if (import.meta.env.DEV) {
    return 'dev-mode';
  }

  // In production, use the admin API key from environment (if set)
  const apiKey = import.meta.env?.VITE_ADMIN_API_KEY;
  if (apiKey) {
    return apiKey;
  }

  // No API key - will rely on Firebase auth
  return '';
}

/**
 * Get headers for admin API requests (sync version - for backward compatibility).
 * NOTE: Prefer getAdminHeadersAsync() for proper Firebase auth support.
 */
export function getAdminHeaders(): HeadersInit {
  const apiKey = getAdminApiKey();

  // Use X-Admin-Key for dev-mode in development
  if (apiKey === 'dev-mode') {
    return {
      'X-Admin-Key': 'dev-mode',
    };
  }

  // Use X-API-Key for production admin keys
  if (apiKey) {
    return {
      'X-API-Key': apiKey,
    };
  }

  // No API key - empty headers (Firebase auth will be added by async version)
  return {};
}

/**
 * Get headers for admin API requests with Firebase auth token (async version).
 * This is the preferred method for authenticated admin API calls.
 *
 * IMPORTANT: This ensures Firebase Auth is initialized before getting the token.
 * This prevents 401 errors from race conditions during app startup.
 */
export async function getAdminHeadersAsync(): Promise<HeadersInit> {
  // Ensure auth is ready before trying to get the token
  await ensureAuthReady();

  const headers: Record<string, string> = {};

  // Try Firebase auth first (primary method in production)
  try {
    const token = await getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      return headers;
    }
  } catch (error) {
    log.debug('Firebase token not available, falling back to API key');
  }

  // Fall back to API key or dev-mode
  const apiKey = getAdminApiKey();
  if (apiKey === 'dev-mode') {
    headers['X-Admin-Key'] = 'dev-mode';
  } else if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  return headers;
}

/**
 * Admin Fetch
 *
 * One fetch wrapper for every admin section, so each request carries the
 * signed-in admin's credentials (Firebase ID token, or the dev-mode key under
 * `vite dev`). Sections that call `fetch` directly reach the server without
 * credentials and render blank in production.
 *
 * @module AdminFetch
 */

import { getAdminHeadersAsync } from './admin-api.js';

/** Fetch with admin credentials merged into the request headers. */
export async function adminFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const adminHeaders = await getAdminHeadersAsync();
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...adminHeaders,
      ...options.headers,
    },
  });
}

/**
 * Admin key for the FinOps routes, which accept only the server's ADMIN_KEY
 * (they do not read the Firebase token). An admin can store it in localStorage;
 * under `vite dev` the dev-mode key is used.
 */
export function getStoredAdminKey(): string {
  try {
    const stored = localStorage.getItem('admin_key') ?? localStorage.getItem('ferni_admin_key');
    if (stored) return stored;
  } catch {
    // Storage blocked: fall through to the dev-mode key
  }
  return import.meta.env.DEV ? 'dev-mode' : '';
}

/**
 * Fetch a FinOps route with the admin's Firebase token and, when one is
 * stored, the admin key in the X-Admin-Key header (never in the URL, where it
 * would land in access logs).
 */
export async function finopsFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const key = getStoredAdminKey();
  return adminFetch(url, {
    ...options,
    headers: { ...(key ? { 'X-Admin-Key': key } : {}), ...options.headers },
  });
}

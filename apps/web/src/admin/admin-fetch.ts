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
 * The admin key saved in this browser, or the dev-mode key under `vite dev`. Only the
 * portal's access gate reads it (admin-access.ts); no admin request sends it.
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

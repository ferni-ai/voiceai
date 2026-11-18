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

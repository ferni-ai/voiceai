/**
 * The API server's global limit: every /api/ request counts against it.
 *
 * It keeps its own bucket. Route limits key a person as `user:<uid>` (else
 * their IP), and this limit used the same key, so every /api/ call also spent
 * the budget of whatever route limit came next. The app makes a few dozen /api/
 * calls on load and polls a few more each minute, which used up the 20-a-minute
 * /token limit before the person pressed Connect: production answered /token
 * with 429 and the call never started.
 *
 * @module api/global-rate-limit
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { rateLimit } from './auth-middleware.js';

export const API_GLOBAL_LIMIT = { maxRequests: 100, windowMs: 60_000, keyPrefix: 'api' } as const;

/**
 * The token, demo and Plaid routes are served outside /api/, so the /api/ limit never
 * counted them; their own total cap keeps a caller from adding up every route limit.
 */
export const OUTSIDE_API_LIMIT = {
  maxRequests: 100,
  windowMs: 60_000,
  keyPrefix: 'outside-api',
} as const;

/** Exact paths routes/token.ts answers; routes/plaid.ts answers everything under /plaid. */
const TOKEN_ROUTE_PATHS = new Set([
  '/token',
  '/token-url',
  '/demo-token',
  '/demo-status',
  '/demo-claim',
  '/demo-session-update',
]);

/** Whether the outside-/api/ limit counts this path (matches the server's dispatch). */
function isOutsideApiLimited(pathname: string): boolean {
  return TOKEN_ROUTE_PATHS.has(pathname) || pathname.startsWith('/plaid');
}

/**
 * The server's global limit for one request, per signed-in person (verified uid), else per
 * IP: /api/ routes count in one bucket and the token, demo and Plaid routes in another, so
 * neither spends the other's budget. /api/health and other paths are not counted.
 * Returns true when the request was turned away (429 already sent).
 */
export function limitServerRequest(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): boolean {
  if (pathname.startsWith('/api/')) {
    return pathname !== '/api/health' && rateLimit(req, res, { ...API_GLOBAL_LIMIT });
  }
  return isOutsideApiLimited(pathname) && rateLimit(req, res, { ...OUTSIDE_API_LIMIT });
}

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
 * Count one /api/ request per signed-in person (verified uid), else per IP.
 * Returns true when the request was turned away (429 already sent).
 */
export function limitApiRequest(req: IncomingMessage, res: ServerResponse): boolean {
  return rateLimit(req, res, { ...API_GLOBAL_LIMIT });
}

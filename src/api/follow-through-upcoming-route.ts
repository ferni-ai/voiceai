/**
 * GET /api/follow-through/upcoming: what Ferni's holding for the signed-in
 * person (services/follow-through/holding.ts), for the app's list, home
 * widget and Live Activity.
 *
 * - Off unless FOLLOW_THROUGH_UPCOMING is on; off, the route doesn't exist
 *   (the engagement router doesn't claim the path, so it 404s like any
 *   unknown one).
 * - The person is the verified caller (requireAuth), never a uid from the
 *   query or body, not even an admin's named target. An API key or dev header
 *   gets 401, as it names no one.
 * - A failed read (the store, or the forgotten topics) answers 503: an empty
 *   list only ever means nothing is open.
 *
 * Not GET /api/outreach/upcoming: that lists what is set to go out (held
 * calls, follow-ups due later that the job will text) and only when texts are
 * on; this lists everything still held, undated and slipped included.
 *
 * @module api/follow-through-upcoming-route
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { flagOn, type Env } from '../config/env-flag.js';
import { whatFerniHolds } from '../services/follow-through/index.js';
import { createLogger } from '../utils/safe-logger.js';
import { requireAuth } from './auth-middleware.js';
import { API_ERRORS } from './error-messages.js';
import { firestoreHoldingDeps, type HoldingDeps } from './follow-through-upcoming-deps.js';
import { sendError, sendJSON } from './helpers.js';

const log = createLogger({ module: 'follow-through-upcoming-route' });

export const FOLLOW_THROUGH_UPCOMING_PATH = '/api/follow-through/upcoming';

/** True when this path is the route and the flag is on; otherwise it's an unknown path. */
export function isFollowThroughUpcomingRoute(pathname: string, env: Env = process.env): boolean {
  return pathname === FOLLOW_THROUGH_UPCOMING_PATH && flagOn('FOLLOW_THROUGH_UPCOMING', env);
}

/** Handles the route; false (nothing written) when it isn't this route or the flag is off. */
export async function handleFollowThroughUpcoming(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  opts: { deps?: () => Promise<HoldingDeps>; env?: Env; now?: () => Date } = {}
): Promise<boolean> {
  if (!isFollowThroughUpcomingRoute(pathname, opts.env) || req.method !== 'GET') return false;
  const auth = await requireAuth(req, res);
  if (!auth) return true; // 401 already sent
  // A person's own Firebase sign-in only: a service or admin API key names
  // nobody (it would read 'api-user' or 'system'), and neither does a dev header.
  if (auth.authMethod !== 'firebase') {
    sendError(res, API_ERRORS.USER_ID_REQUIRED, 401);
    return true;
  }
  const { userId } = auth;
  try {
    const deps = await (opts.deps ?? firestoreHoldingDeps)();
    const [followUps, forgotten] = await Promise.all([
      deps.live(userId),
      deps.forgottenMatcher(userId),
    ]);
    sendJSON(res, whatFerniHolds(userId, followUps, forgotten, opts.now?.() ?? new Date()));
  } catch (error) {
    log.error({ error: String(error), userId }, 'Could not read what Ferni is holding');
    sendJSON(res, { error: "Couldn't load what Ferni is holding right now" }, 503);
  }
  return true;
}

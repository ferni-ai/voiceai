/**
 * GET /api/on-it: "Ferni's on it", what Ferni is holding and doing for the
 * signed-in person (services/on-it/on-it.ts), for the app's screen and its
 * Home row. Read only: nothing here sends or approves.
 *
 * - Off unless FERNI_ON_IT is on; off, the engagement router doesn't claim
 *   the path, so it 404s like any unknown one.
 * - The person is the verified caller (requireAuth), never a uid from the
 *   query or body, not even an admin's named target.
 * - Any failed read (follow-ups, errands, or the forgotten topics) answers
 *   503: an empty view only ever means nothing is held or doing.
 *
 * @module api/on-it-route
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { flagOn, type Env } from '../config/env-flag.js';
import { DONE_DAYS, buildOnIt } from '../services/on-it/on-it.js';
import { createLogger } from '../utils/safe-logger.js';
import { requireAuth } from './auth-middleware.js';
import { sendJSON } from './helpers.js';
import { firestoreOnItDeps, type OnItDeps } from './on-it-deps.js';

const log = createLogger({ module: 'on-it-route' });

export const ON_IT_PATH = '/api/on-it';

/** True when this path is the route and the flag is on; otherwise it's an unknown path. */
export function isOnItRoute(pathname: string, env: Env = process.env): boolean {
  return pathname === ON_IT_PATH && flagOn('FERNI_ON_IT', env);
}

/** Handles the route; false (nothing written) when it isn't this route or the flag is off. */
export async function handleOnIt(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  opts: { deps?: () => Promise<OnItDeps>; env?: Env; now?: () => Date } = {}
): Promise<boolean> {
  if (!isOnItRoute(pathname, opts.env) || req.method !== 'GET') return false;
  const auth = await requireAuth(req, res, { allowDevMode: true });
  if (!auth) return true; // 401 already sent
  const { userId } = auth;
  const now = opts.now?.() ?? new Date();
  try {
    const deps = await (opts.deps ?? firestoreOnItDeps)();
    const since = new Date(now.getTime() - DONE_DAYS * 86_400_000);
    const [live, changed, errands, forgotten] = await Promise.all([
      deps.live(userId),
      deps.changed(userId, since, now),
      deps.openErrands(userId),
      deps.forgottenMatcher(userId),
    ]);
    sendJSON(res, buildOnIt({ userId, live, changed, errands, forgotten, now }));
  } catch (error) {
    log.error({ error: String(error), userId }, "Could not read what Ferni's on");
    sendJSON(res, { error: "Couldn't load this right now" }, 503);
  }
  return true;
}

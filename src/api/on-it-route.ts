/**
 * GET /api/on-it: "Ferni's on it" for the signed-in person (services/on-it).
 * Read only. Off unless FERNI_ON_IT: the router then doesn't claim the path,
 * so it 404s like any unknown one. The person is the verified caller, never a
 * uid from the query or body. Any failed read (follow-ups, errands, forgotten
 * topics) answers 503: an empty view only ever means nothing is there.
 *
 * @module api/on-it-route
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { flagOn, type Env } from '../config/env-flag.js';
import { DONE_DAYS, buildOnIt } from '../services/on-it/on-it.js';
import { errorClass } from '../utils/error-class.js';
import { createLogger } from '../utils/safe-logger.js';
import { requireAuth } from './auth-middleware.js';
import { sendJSON } from './helpers.js';
import { firestoreOnItDeps, type OnItDeps } from './on-it-deps.js';

const log = createLogger({ module: 'on-it-route' });

/** True when this path is the route and the flag is on; otherwise it's an unknown path. */
export function isOnItRoute(pathname: string, env: Env = process.env): boolean {
  return pathname === '/api/on-it' && flagOn('FERNI_ON_IT', env);
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
    // The class only: a store error's message can quote the person's item text.
    log.error({ error: errorClass(error), userId }, "Could not read what Ferni's on");
    sendJSON(res, { error: "Couldn't load this right now" }, 503);
  }
  return true;
}

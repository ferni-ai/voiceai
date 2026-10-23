/**
 * POST /api/me/focus: the iOS Focus filter says the person's Focus is on or
 * off (ENGAGEMENT-SPEC 3.3, "Quiet while you focus").
 *
 * Body: { held, kind: sleep | work | other, holdCheckIns, remindersThrough,
 * deviceId }. Answers { held, kind, remindersThrough, capUntil? }.
 *
 * - The person is the verified caller (requireAuth), never a uid from the
 *   query or body.
 * - Off unless FOCUS_HOLD is on for that person (their cohort, else the env);
 *   off, the route isn't claimed, so it 404s like any unknown path.
 * - A failed save answers 503: the app re-posts on its next foreground.
 *
 * @module api/routes/focus
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { personFlagOn } from '../../config/person-flag.js';
import { parseFocusPost } from '../../services/messaging/focus.js';
import { firestoreFocusStore, type FocusStore } from '../../services/messaging/focus-store.js';
import { createLogger } from '../../utils/safe-logger.js';
import { requireAuth } from '../auth-middleware.js';
import { parseBody, sendError, sendJSON } from '../helpers.js';

const log = createLogger({ module: 'focus-route' });

export const FOCUS_PATH = '/api/me/focus';

/** Handles the route; false (nothing written) when it isn't this route or the flag is off for them. */
export async function handleFocusRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  opts: { store?: FocusStore; now?: () => Date } = {}
): Promise<boolean> {
  if (pathname !== FOCUS_PATH || req.method !== 'POST') return false;
  const auth = await requireAuth(req, res, { allowDevMode: true });
  if (!auth) return true; // 401 already sent
  const { userId } = auth;
  if (!(await personFlagOn(userId, 'FOCUS_HOLD'))) return false;
  let body: unknown;
  try {
    body = await parseBody(req);
  } catch (error) {
    log.warn({ error: String(error), userId: userId.slice(0, 8) }, 'Focus body unreadable');
    sendError(res, 'Body must be JSON', 400);
    return true;
  }
  const checked = parseFocusPost(body);
  if (!checked.ok) {
    sendError(res, checked.error, 400);
    return true;
  }
  try {
    const now = opts.now?.() ?? new Date();
    const saved = await (opts.store ?? firestoreFocusStore).save(userId, checked.post, now);
    if (saved === 'too-many-devices') {
      sendError(res, 'Too many devices are holding a Focus', 409);
      return true;
    }
    const { held, kind, remindersThrough, capUntil } = saved;
    log.info({ userId: userId.slice(0, 8), held, kind }, 'Focus saved');
    sendJSON(res, { held, kind, remindersThrough, ...(capUntil && { capUntil }) });
  } catch (error) {
    log.error({ error: String(error), userId: userId.slice(0, 8) }, 'Focus not saved');
    sendJSON(res, { error: "Couldn't save your Focus right now" }, 503);
  }
  return true;
}

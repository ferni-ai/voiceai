/**
 * /api/outreach/upcoming, for the signed-in caller only (the uid comes from
 * requireAuth, never the query or body):
 *
 * - GET: what is really set to go out to them
 *   (services/outreach/upcoming-outreach.ts). A read that fails answers 500, so
 *   the panel shows its error state instead of "nothing planned".
 * - POST /cancel { type, id } and POST /reschedule { type, id, at }: change one of
 *   their own items where its sender reads it (upcoming-outreach-actions.ts).
 *   404 unless REACH_OUT_ACTIONS is on. Someone else's id is 404, like an unknown
 *   one; an item the sender already took is 409; a time it wouldn't send at, 422.
 *
 * @module api/outreach-upcoming-route
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { getDisplayName, toCanonical } from '../personas/persona-ids.js';
import {
  firestoreUpcomingDeps,
  listUpcomingOutreach,
  type UpcomingDeps,
} from '../services/outreach/upcoming-outreach.js';
import {
  cancelUpcoming,
  firestoreActionDeps,
  reachOutActionsOn,
  rescheduleUpcoming,
  type ActionRefusal,
  type UpcomingKind,
} from '../services/outreach/upcoming-outreach-actions.js';
import { getLogger } from '../utils/safe-logger.js';
import { parseRequestBody, sendJsonResponse } from './helpers.js';

const log = getLogger().child({ module: 'outreach-upcoming-route' });

async function sendUpcomingOutreach(
  res: ServerResponse,
  userId: string,
  url: URL,
  deps: () => Promise<UpcomingDeps> = firestoreUpcomingDeps
): Promise<void> {
  try {
    const limit = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
    const items = await listUpcomingOutreach(userId, await deps(), {
      ...(Number.isFinite(limit) && { limit }),
      actions: reachOutActionsOn(),
    });
    const upcoming = items.map((item) => ({
      ...item,
      personaId: toCanonical(item.personaId),
      personaName: getDisplayName(item.personaId),
    }));
    sendJsonResponse(res, 200, { success: true, upcoming, count: upcoming.length });
  } catch (error) {
    log.error({ error: String(error), userId }, 'Could not read upcoming outreach');
    sendJsonResponse(res, 500, { success: false, error: 'Could not load upcoming outreach' });
  }
}

const KINDS: readonly UpcomingKind[] = ['held_call', 'follow_up'];
/** A Firestore document id of ours: no slash, so it can't reach past the caller's own collection. */
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const STATUS: Record<ActionRefusal, number> = {
  'not-found': 404,
  gone: 409,
  'not-actionable': 409,
  'bad-time': 422,
  quiet: 422,
};

/** POST /upcoming/cancel or /upcoming/reschedule for the caller's own item. */
async function sendUpcomingAction(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  action: 'cancel' | 'reschedule'
): Promise<void> {
  const body = (await parseRequestBody(req).catch(() => null)) as Record<string, unknown> | null;
  const kind = body?.type as UpcomingKind;
  const id = body?.id;
  if (!KINDS.includes(kind) || typeof id !== 'string' || !ID.test(id)) {
    sendJsonResponse(res, 400, { success: false, error: 'type and id are required' });
    return;
  }
  try {
    const d = await firestoreActionDeps();
    const out =
      action === 'cancel'
        ? await cancelUpcoming(d, userId, { kind, id })
        : await rescheduleUpcoming(d, userId, { kind, id }, body?.at);
    if (out.ok) {
      log.info({ action, kind }, 'Upcoming outreach changed by its owner');
      sendJsonResponse(res, 200, { success: true, ...out });
      return;
    }
    sendJsonResponse(res, STATUS[out.reason], { success: false, error: out.reason });
  } catch (error) {
    log.error({ error: String(error), action, kind }, 'Could not change upcoming outreach');
    sendJsonResponse(res, 500, { success: false, error: 'Could not change upcoming outreach' });
  }
}

/** Everything under /api/outreach/upcoming; anything else there is 404. */
export async function handleUpcoming(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  route: string,
  method: string
): Promise<void> {
  if (route === '/upcoming' && method === 'GET') {
    return sendUpcomingOutreach(res, userId, new URL(req.url || '', 'http://x'));
  }
  const action = route.slice('/upcoming/'.length);
  if (
    method === 'POST' &&
    (action === 'cancel' || action === 'reschedule') &&
    reachOutActionsOn()
  ) {
    return sendUpcomingAction(req, res, userId, action);
  }
  sendJsonResponse(res, 404, { success: false, error: 'Not found' });
}

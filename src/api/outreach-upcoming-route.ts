/**
 * GET /api/outreach/upcoming: what is really set to go out to the caller
 * (services/outreach/upcoming-outreach.ts), for the signed-in caller only (the
 * uid comes from requireAuth, never the query). A read that fails answers 500,
 * so the panel shows its error state instead of "nothing planned".
 *
 * @module api/outreach-upcoming-route
 */
import type { ServerResponse } from 'http';
import { getDisplayName, toCanonical } from '../personas/persona-ids.js';
import {
  firestoreUpcomingDeps,
  listUpcomingOutreach,
  type UpcomingDeps,
} from '../services/outreach/upcoming-outreach.js';
import { getLogger } from '../utils/safe-logger.js';
import { sendJsonResponse } from './helpers.js';

const log = getLogger().child({ module: 'outreach-upcoming-route' });

export async function sendUpcomingOutreach(
  res: ServerResponse,
  userId: string,
  url: URL,
  deps: () => Promise<UpcomingDeps> = firestoreUpcomingDeps
): Promise<void> {
  try {
    const limit = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
    const items = await listUpcomingOutreach(userId, await deps(), {
      ...(Number.isFinite(limit) && { limit }),
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

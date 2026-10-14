/**
 * GET /api/outreach/history: the outreach the caller has actually received.
 *
 * Reads `bogle_users/{uid}/outreach_attempts` for the signed-in caller only (the uid
 * comes from requireAuth, never the query). A read that fails answers 500 so the
 * panel can say so, instead of an empty list that reads as "nothing sent".
 *
 * @module api/outreach-history-route
 */
import type { ServerResponse } from 'http';
import { getDisplayName, toCanonical } from '../personas/persona-ids.js';
import {
  clampHistoryLimit,
  listOutreachHistory,
} from '../services/outreach/outreach-history-read.js';
import { getLogger } from '../utils/safe-logger.js';
import { sendJsonResponse } from './helpers.js';

const log = getLogger().child({ module: 'outreach-history-route' });

export async function sendOutreachHistory(
  res: ServerResponse,
  userId: string,
  url: URL
): Promise<void> {
  try {
    const entries = await listOutreachHistory(
      userId,
      clampHistoryLimit(url.searchParams.get('limit'))
    );
    const history = entries.map((entry) => ({
      ...entry,
      personaId: toCanonical(entry.personaId),
      personaName: getDisplayName(entry.personaId),
    }));
    sendJsonResponse(res, 200, { success: true, history, count: history.length });
  } catch (error) {
    log.error({ error: String(error), userId }, 'Could not read outreach history');
    sendJsonResponse(res, 500, { success: false, error: 'Could not load outreach history' });
  }
}

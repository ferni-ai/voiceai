/**
 * Team Routes
 *
 * GET /api/huddles - Get team huddles
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { requireUserId, sendJSON, sendJSONCached } from '../helpers.js';
import type { AnyRecord } from './types.js';

const log = createLogger({ module: 'TeamAPI' });

/**
 * GET /api/huddles - Get team huddles
 */
export async function handleGetHuddles(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const { getEngagementStore } = await import('../../services/engagement-store.js');
    const store = await getEngagementStore();
    const profile = (await store.getProfile(userId)) as unknown as AnyRecord;

    sendJSONCached(
      res,
      {
        totalHuddles: ((profile.stats as AnyRecord)?.teamHuddlesAttended as number) || 0,
        lastHuddleAt: profile.lastEngagementAt,
        recentHuddles: [],
      },
      60
    );
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to get huddles');
    sendJSON(res, { error: 'Failed to get huddles', totalHuddles: 0, recentHuddles: [] }, 500);
  }
}

/**
 * Route handler for team endpoints
 */
export async function handleTeamRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  if (pathname === '/api/huddles' && req.method === 'GET') {
    await handleGetHuddles(req, res, parsedUrl);
    return true;
  }
  return false;
}

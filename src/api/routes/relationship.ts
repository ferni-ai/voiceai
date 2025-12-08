/**
 * Relationship Progress Routes
 *
 * GET /api/relationship/progress - Get relationship progress
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { requireUserId, sendJSON, sendJSONCached } from '../helpers.js';
import type { AnyRecord } from './types.js';

const log = createLogger({ module: 'RelationshipAPI' });

/**
 * GET /api/relationship/progress - Get relationship progress
 */
export async function handleGetRelationshipProgress(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const { getEngagementStore } = await import('../../services/engagement-store.js');
    const { getConversationHistoryService } =
      await import('../../services/conversation-history.js');

    const store = await getEngagementStore();
    const historyService = getConversationHistoryService();

    const profile = (await store.getProfile(userId)) as unknown as AnyRecord;
    const history = await historyService.getHistory(userId, 100);

    const totalConversations = history.totalSessions;
    const totalRitualDays = (profile.totalRitualDays as number) || 0;
    const engagementScore = totalConversations + totalRitualDays * 2;

    let stage = 'stranger';
    let stageNumber = 1;
    let nextStageAt: number | null = 5;

    if (engagementScore >= 100) {
      stage = 'family';
      stageNumber = 6;
      nextStageAt = null;
    } else if (engagementScore >= 50) {
      stage = 'confidant';
      stageNumber = 5;
      nextStageAt = 100;
    } else if (engagementScore >= 25) {
      stage = 'friend';
      stageNumber = 4;
      nextStageAt = 50;
    } else if (engagementScore >= 10) {
      stage = 'acquaintance';
      stageNumber = 3;
      nextStageAt = 25;
    } else if (engagementScore >= 5) {
      stage = 'familiar';
      stageNumber = 2;
      nextStageAt = 10;
    }

    sendJSONCached(
      res,
      {
        stage,
        stageNumber,
        engagementScore,
        nextStageAt,
        progress: nextStageAt
          ? Math.min(100, Math.round((engagementScore / nextStageAt) * 100))
          : 100,
        stats: {
          totalConversations,
          totalRitualDays,
          lastEngagement: profile.lastEngagementAt,
        },
      },
      60
    );
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to get relationship progress');
    sendJSON(
      res,
      {
        error: 'Failed to get progress',
        stage: 'stranger',
        stageNumber: 1,
        engagementScore: 0,
      },
      500
    );
  }
}

/**
 * Route handler for relationship endpoints
 */
export async function handleRelationshipRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  if (pathname === '/api/relationship/progress' && req.method === 'GET') {
    await handleGetRelationshipProgress(req, res, parsedUrl);
    return true;
  }
  return false;
}

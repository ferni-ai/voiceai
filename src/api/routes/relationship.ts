/**
 * Relationship Progress Routes
 *
 * GET /api/relationship/progress - Get relationship progress
 * POST /api/relationship/progress - Sync relationship progress from frontend
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { parseBody, requireUserId, sendJSON, sendJSONCached } from '../helpers.js';
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
 * POST /api/relationship/progress - Sync relationship progress from frontend
 *
 * Accepts relationship data from frontend for cross-device sync.
 * Primary data store is frontend localStorage; this is supplementary persistence.
 */
interface RelationshipProgressPayload {
  userId?: string;
  stage?: string;
  metrics?: {
    totalConversations?: number;
    daysSinceFirstMeeting?: number;
    currentStreak?: number;
    longestStreak?: number;
    milestonesReached?: number;
    insightsShared?: number;
    lastConversation?: number | null;
  };
  firstMeetingDate?: string;
  memoriesCount?: number;
}

export async function handlePostRelationshipProgress(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const body = await parseBody<RelationshipProgressPayload>(req);

    const { getEngagementStore } = await import('../../services/engagement-store.js');
    const store = await getEngagementStore();

    // Get existing profile and merge with incoming data
    const existingProfile = await store.getProfile(userId);
    const existingData = existingProfile as unknown as AnyRecord;

    // Create merged profile with relationship data as additional fields
    // Firestore's saveProfile uses merge: true, so extra fields are preserved
    const mergedProfile = {
      ...existingProfile,
      // Preserve relationship-specific fields (not in base EngagementProfile type)
      relationshipStage: body.stage || existingData.relationshipStage,
      firstMeetingDate: body.firstMeetingDate || existingData.firstMeetingDate,
      relationshipMetrics: body.metrics || existingData.relationshipMetrics,
      memoriesCount: body.memoriesCount ?? existingData.memoriesCount,
      lastSyncedAt: new Date().toISOString(),
    };

    // saveProfile uses merge: true, so extra fields are preserved
    await store.saveProfile(mergedProfile);

    log.debug({ userId, stage: body.stage }, 'Relationship progress synced');

    sendJSON(res, {
      success: true,
      synced: true,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to sync relationship progress');
    sendJSON(
      res,
      {
        error: 'Failed to sync progress',
        success: false,
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
  if (pathname === '/api/relationship/progress') {
    if (req.method === 'GET') {
      await handleGetRelationshipProgress(req, res, parsedUrl);
      return true;
    }
    if (req.method === 'POST') {
      await handlePostRelationshipProgress(req, res, parsedUrl);
      return true;
    }
  }
  return false;
}

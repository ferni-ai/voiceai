/**
 * Outreach API Routes
 *
 * Endpoints for managing proactive outreach (notifications, check-ins).
 *
 * Routes:
 * - POST /api/outreach/process - Process pending outreach for a user
 * - POST /api/outreach/queue - Queue a new outreach item
 * - GET /api/outreach/pending - Get pending outreach for a user
 * - POST /api/outreach/preferences - Update outreach preferences
 * - GET /api/outreach/preferences - Get outreach preferences
 * - POST /api/outreach/job - Trigger batch outreach processing (cron)
 *
 * @module OutreachRoutes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { UrlWithParsedQuery } from 'url';
import { sendJsonResponse, parseRequestBody } from './utils.js';
import {
  processUserOutreach,
  generateOutreachOpportunities,
  queueThinkingOfYou,
  queueCelebration,
  queueGrowthReflection,
  getDueItems,
  getUserPreferences,
  setUserPreferences,
  canSendOutreach,
  type OutreachPreferences,
} from '../services/trust-systems/index.js';
import {
  deliverToUser,
  type UserChannelConfig,
} from '../services/trust-systems/notification-delivery.js';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'OutreachRoutes' });

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleOutreachRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  _parsedUrl: UrlWithParsedQuery
): Promise<boolean> {
  const method = req.method?.toUpperCase() || 'GET';

  try {
    // POST /api/outreach/process - Process pending outreach for user
    if (pathname === '/api/outreach/process' && method === 'POST') {
      const body = await parseRequestBody(req);
      const { userId, channelConfig } = body as {
        userId: string;
        channelConfig?: UserChannelConfig;
      };

      if (!userId) {
        sendJsonResponse(res, 400, { error: 'userId required' });
        return true;
      }

      // Check if outreach is allowed
      const { allowed, reason } = canSendOutreach(userId);
      if (!allowed) {
        sendJsonResponse(res, 200, {
          success: true,
          sent: 0,
          skipped: 1,
          reason,
        });
        return true;
      }

      // Get pending items
      const dueItems = getDueItems(userId);
      if (dueItems.length === 0) {
        sendJsonResponse(res, 200, {
          success: true,
          sent: 0,
          skipped: 0,
          message: 'No pending outreach',
        });
        return true;
      }

      // Deliver if channel config provided
      if (channelConfig) {
        const item = dueItems[0]; // Process one at a time
        const result = await deliverToUser(item, channelConfig);

        sendJsonResponse(res, 200, {
          success: result.success,
          sent: result.success ? 1 : 0,
          failed: result.success ? 0 : 1,
          error: result.error,
        });
        return true;
      }

      // Otherwise just process (mark as sent)
      const result = await processUserOutreach(userId);
      sendJsonResponse(res, 200, {
        success: true,
        ...result,
      });
      return true;
    }

    // POST /api/outreach/generate - Generate outreach opportunities
    if (pathname === '/api/outreach/generate' && method === 'POST') {
      const body = await parseRequestBody(req);
      const { userId, queue } = body as { userId: string; queue?: boolean };

      if (!userId) {
        sendJsonResponse(res, 400, { error: 'userId required' });
        return true;
      }

      const opportunities = generateOutreachOpportunities(userId);

      // Optionally queue them
      if (queue) {
        for (const moment of opportunities.thinkingOfYou) {
          queueThinkingOfYou(userId, moment);
        }
        for (const celebration of opportunities.celebrations) {
          queueCelebration(userId, celebration);
        }
        for (const reflection of opportunities.growthReflections) {
          queueGrowthReflection(userId, reflection);
        }
      }

      sendJsonResponse(res, 200, {
        success: true,
        opportunities: {
          thinkingOfYou: opportunities.thinkingOfYou.length,
          celebrations: opportunities.celebrations.length,
          growthReflections: opportunities.growthReflections.length,
        },
        queued: !!queue,
      });
      return true;
    }

    // GET /api/outreach/pending - Get pending outreach
    if (pathname === '/api/outreach/pending' && method === 'GET') {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const userId = url.searchParams.get('userId');

      if (!userId) {
        sendJsonResponse(res, 400, { error: 'userId required' });
        return true;
      }

      const dueItems = getDueItems(userId);
      const { allowed, reason } = canSendOutreach(userId);

      sendJsonResponse(res, 200, {
        success: true,
        pending: dueItems.map((item) => ({
          id: item.id,
          type: item.type,
          priority: item.priority,
          scheduledFor: item.scheduledFor.toISOString(),
          message: item.message.slice(0, 100) + (item.message.length > 100 ? '...' : ''),
        })),
        canSend: allowed,
        blockedReason: reason,
      });
      return true;
    }

    // GET /api/outreach/preferences - Get preferences
    if (pathname === '/api/outreach/preferences' && method === 'GET') {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const userId = url.searchParams.get('userId');

      if (!userId) {
        sendJsonResponse(res, 400, { error: 'userId required' });
        return true;
      }

      const prefs = getUserPreferences(userId);
      sendJsonResponse(res, 200, {
        success: true,
        preferences: prefs,
      });
      return true;
    }

    // POST /api/outreach/preferences - Update preferences
    if (pathname === '/api/outreach/preferences' && method === 'POST') {
      const body = await parseRequestBody(req);
      const { userId, preferences } = body as {
        userId: string;
        preferences: Partial<OutreachPreferences>;
      };

      if (!userId) {
        sendJsonResponse(res, 400, { error: 'userId required' });
        return true;
      }

      setUserPreferences(userId, preferences);
      const updated = getUserPreferences(userId);

      sendJsonResponse(res, 200, {
        success: true,
        preferences: updated,
      });
      return true;
    }

    // POST /api/outreach/job - Batch processing (for cron job)
    if (pathname === '/api/outreach/job' && method === 'POST') {
      // Verify cron secret
      const authHeader = req.headers.authorization;
      const cronSecret = process.env.CRON_SECRET;

      if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        sendJsonResponse(res, 401, { error: 'Unauthorized' });
        return true;
      }

      const body = await parseRequestBody(req);
      const { userIds, limit = 100 } = body as {
        userIds?: string[];
        limit?: number;
      };

      // In production, you'd get active users from Firestore
      const usersToProcess = userIds || [];
      const results = {
        processed: 0,
        sent: 0,
        skipped: 0,
        failed: 0,
      };

      for (const userId of usersToProcess.slice(0, limit)) {
        const result = await processUserOutreach(userId);
        results.processed++;
        results.sent += result.sent;
        results.skipped += result.skipped;
        results.failed += result.failed;
      }

      log.info(results, '📬 Outreach job completed');

      sendJsonResponse(res, 200, {
        success: true,
        ...results,
      });
      return true;
    }

    return false;
  } catch (error) {
    log.error({ error, pathname }, 'Outreach route error');
    sendJsonResponse(res, 500, { error: 'Internal server error' });
    return true;
  }
}

export default handleOutreachRoutes;

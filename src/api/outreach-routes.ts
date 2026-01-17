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
 * - GET /api/outreach/contact - Get user's contact info (phone/email)
 * - POST /api/outreach/contact - Set user's contact info
 * - POST /api/outreach/test/send - Send test message via channel
 * - POST /api/outreach/trigger - Create outreach trigger
 * - POST /api/outreach/thinking-of-you - Queue thinking-of-you message
 * - GET /api/outreach/history - Get outreach history
 *
 * @module OutreachRoutes
 */

import admin from 'firebase-admin';
import type { IncomingMessage, ServerResponse } from 'http';
import type { UrlWithParsedQuery } from 'url';
import { cleanForFirestore } from '../utils/firestore-utils.js';
import {
  canSendOutreach,
  generateOutreachOpportunities,
  getDueItems,
  getUserPreferences,
  processUserOutreach,
  queueCelebration,
  queueGrowthReflection,
  queueThinkingOfYou,
  setUserPreferences,
  type OutreachPreferences,
} from '../services/trust-systems/index.js';
import {
  deliverToUser,
  type UserChannelConfig,
} from '../services/trust-systems/notification-delivery.js';
import { createLogger } from '../utils/safe-logger.js';
import { parseRequestBody, sendJsonResponse } from './helpers.js';

const log = createLogger({ module: 'OutreachRoutes' });

// ============================================================================
// FIRESTORE USER QUERIES
// ============================================================================

let firestoreInstance: admin.firestore.Firestore | null = null;
let firestoreInitAttempted = false;

function getFirestore(): admin.firestore.Firestore | null {
  if (firestoreInstance) return firestoreInstance;
  if (firestoreInitAttempted) return null;

  firestoreInitAttempted = true;

  try {
    if (admin.apps.length === 0) {
      const projectId =
        process.env.GCP_PROJECT_ID ||
        process.env.FIREBASE_PROJECT_ID ||
        process.env.GOOGLE_CLOUD_PROJECT;

      if (projectId) {
        admin.initializeApp({ projectId });
      } else {
        admin.initializeApp();
      }
    }

    firestoreInstance = admin.firestore();
    return firestoreInstance;
  } catch (error) {
    log.warn({ error }, 'Firebase not available for outreach routes');
    return null;
  }
}

/**
 * Get active users who have opted in to outreach
 * Active = had a conversation in the last 30 days
 */
async function getActiveUsersForOutreach(limit = 100): Promise<string[]> {
  const db = getFirestore();
  if (!db) {
    log.warn('Firestore unavailable - cannot fetch active users for outreach');
    return [];
  }

  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Query users with recent activity who haven't disabled outreach
    const snapshot = await db
      .collection('profiles')
      .where('lastContact', '>=', thirtyDaysAgo)
      .orderBy('lastContact', 'desc')
      .limit(limit)
      .get();

    const userIds: string[] = [];
    for (const doc of snapshot.docs) {
      const data = doc.data();
      // Check if outreach is not explicitly disabled
      if (data.preferences?.outreachEnabled !== false) {
        userIds.push(doc.id);
      }
    }

    log.info({ count: userIds.length, limit }, 'Fetched active users for outreach');
    return userIds;
  } catch (error) {
    log.error({ error }, 'Failed to fetch active users for outreach');
    return [];
  }
}

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

    // GET /api/outreach/pending-checkin - Get pending check-in for badge UI
    // Returns the most relevant check-in Ferni wants to have with the user
    if (pathname === '/api/outreach/pending-checkin' && method === 'GET') {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const userId = url.searchParams.get('userId');

      if (!userId) {
        sendJsonResponse(res, 400, { error: 'userId required' });
        return true;
      }

      const dueItems = getDueItems(userId);
      const { allowed } = canSendOutreach(userId);

      // Find the most relevant check-in type item
      const checkinTypes = [
        'thinking_of_you',
        'emotional_support',
        'commitment_check',
        'growth_reflection',
      ];
      const checkinItem = dueItems.find((item) => checkinTypes.includes(item.type));

      if (!checkinItem || !allowed) {
        sendJsonResponse(res, 200, {
          hasCheckin: false,
          checkin: null,
        });
        return true;
      }

      // Map outreach type to badge icon type
      const iconTypes: Record<string, 'heart' | 'chat' | 'sparkle' | 'support'> = {
        thinking_of_you: 'heart',
        emotional_support: 'support',
        commitment_check: 'chat',
        growth_reflection: 'sparkle',
        celebration: 'sparkle',
      };

      sendJsonResponse(res, 200, {
        hasCheckin: true,
        checkin: {
          id: checkinItem.id,
          type: checkinItem.type,
          iconType: iconTypes[checkinItem.type] || 'heart',
          preview:
            checkinItem.message.slice(0, 50) + (checkinItem.message.length > 50 ? '...' : ''),
          fullMessage: checkinItem.message,
          priority: checkinItem.priority,
          personaId: checkinItem.personaId || 'ferni',
        },
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

      // Get users to process - either from request body or fetch active users from Firestore
      const usersToProcess =
        userIds && userIds.length > 0
          ? userIds.slice(0, limit)
          : await getActiveUsersForOutreach(limit);

      if (usersToProcess.length === 0) {
        log.info('No users to process for outreach');
        sendJsonResponse(res, 200, {
          success: true,
          processed: 0,
          sent: 0,
          skipped: 0,
          failed: 0,
          message: 'No active users to process',
        });
        return true;
      }

      const results = {
        processed: 0,
        sent: 0,
        skipped: 0,
        failed: 0,
      };

      for (const userId of usersToProcess) {
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

    // ========================================================================
    // DEV PANEL ENDPOINTS - For testing outreach from dev panel
    // ========================================================================

    // GET /api/outreach/contact - Get user's contact info
    if (pathname === '/api/outreach/contact' && method === 'GET') {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const userId = url.searchParams.get('userId');

      if (!userId) {
        sendJsonResponse(res, 400, { error: 'userId required' });
        return true;
      }

      const db = getFirestore();
      if (!db) {
        sendJsonResponse(res, 503, { error: 'Database not available' });
        return true;
      }

      try {
        const profile = await db.collection('profiles').doc(userId).get();
        if (!profile.exists) {
          sendJsonResponse(res, 404, { error: 'User not found' });
          return true;
        }

        const data = profile.data();
        const contactInfo = data?.contactInfo ?? {};

        sendJsonResponse(res, 200, {
          success: true,
          phone: contactInfo.phone ?? null,
          email: contactInfo.email ?? null,
        });
        return true;
      } catch (error) {
        log.error({ error, userId }, 'Failed to get contact info');
        sendJsonResponse(res, 500, { error: 'Failed to get contact info' });
        return true;
      }
    }

    // POST /api/outreach/contact - Set user's contact info
    if (pathname === '/api/outreach/contact' && method === 'POST') {
      const body = await parseRequestBody(req);
      const { userId, phone, email } = body as {
        userId: string;
        phone?: string;
        email?: string;
      };

      if (!userId) {
        sendJsonResponse(res, 400, { error: 'userId required' });
        return true;
      }

      const db = getFirestore();
      if (!db) {
        sendJsonResponse(res, 503, { error: 'Database not available' });
        return true;
      }

      try {
        const updateData: Record<string, unknown> = {
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (phone !== undefined) updateData['contactInfo.phone'] = phone;
        if (email !== undefined) updateData['contactInfo.email'] = email;

        await db
          .collection('profiles')
          .doc(userId)
          .set(cleanForFirestore(updateData), { merge: true });

        log.info({ userId, hasPhone: !!phone, hasEmail: !!email }, 'Updated contact info');

        sendJsonResponse(res, 200, {
          success: true,
          phone: phone ?? null,
          email: email ?? null,
        });
        return true;
      } catch (error) {
        log.error({ error, userId }, 'Failed to set contact info');
        sendJsonResponse(res, 500, { error: 'Failed to set contact info' });
        return true;
      }
    }

    // POST /api/outreach/test/send - Send test message via channel
    if (pathname === '/api/outreach/test/send' && method === 'POST') {
      const body = await parseRequestBody(req);
      const { userId, channel, message, subject } = body as {
        userId: string;
        channel: 'sms' | 'email' | 'call';
        message: string;
        subject?: string;
      };

      if (!userId || !channel || !message) {
        sendJsonResponse(res, 400, { error: 'userId, channel, and message required' });
        return true;
      }

      const db = getFirestore();
      if (!db) {
        sendJsonResponse(res, 503, { error: 'Database not available' });
        return true;
      }

      try {
        // Get user's contact info
        const profile = await db.collection('profiles').doc(userId).get();
        const contactInfo = profile.data()?.contactInfo ?? {};

        // Build channel config
        const channelConfig: UserChannelConfig = {
          userId,
          preferredChannel: channel === 'call' ? 'voice' : channel,
          enabledChannels: [channel === 'call' ? 'voice' : channel],
        };

        if (channel === 'sms' || channel === 'call') {
          if (!contactInfo.phone) {
            sendJsonResponse(res, 400, { error: 'No phone number configured for user' });
            return true;
          }
          channelConfig.phone = contactInfo.phone;
        }

        if (channel === 'email') {
          if (!contactInfo.email) {
            sendJsonResponse(res, 400, { error: 'No email configured for user' });
            return true;
          }
          channelConfig.email = contactInfo.email;
        }

        // Create test outreach item with proper OutreachItem type
        const testItem = {
          id: `test-${Date.now()}`,
          userId,
          type: 'thinking_of_you' as const,
          priority: 'medium' as const,
          message,
          ssml: `<speak>${message}</speak>`,
          scheduledFor: new Date(),
          personaId: 'ferni',
          metadata: {
            test: true,
            subject: subject ?? 'Test from Ferni',
            createdAt: new Date().toISOString(),
          },
        };

        // Deliver
        const result = await deliverToUser(testItem, channelConfig);

        log.info({ userId, channel, success: result.success }, 'Test outreach sent');

        sendJsonResponse(res, result.success ? 200 : 500, {
          success: result.success,
          channel: result.channel,
          error: result.error,
        });
        return true;
      } catch (error) {
        log.error({ error, userId, channel }, 'Failed to send test outreach');
        sendJsonResponse(res, 500, { error: 'Failed to send test message' });
        return true;
      }
    }

    // POST /api/outreach/trigger - Create outreach trigger
    // Simplified: directly queues a test thinking-of-you since the complex types
    // (SmallWin, GrowthPattern) are designed for detection, not manual creation
    if (pathname === '/api/outreach/trigger' && method === 'POST') {
      const body = await parseRequestBody(req);
      const { userId, type, priority, reason } = body as {
        userId: string;
        type: 'commitment_check' | 'emotional_support' | 'celebration' | 'thinking_of_you';
        priority?: 'low' | 'medium' | 'high';
        reason?: string;
      };

      if (!userId || !type) {
        sendJsonResponse(res, 400, { error: 'userId and type required' });
        return true;
      }

      try {
        // For dev panel testing, create a thinking-of-you moment with appropriate context
        const testMoment = {
          id: `trigger-${type}-${Date.now()}`,
          type: 'thought_of_you' as const,
          trigger: {
            type: 'random' as const,
            context: `${type}: ${reason ?? 'Triggered from dev panel'}`,
          },
          message: reason ?? `This is a test ${type} from the dev panel.`,
          ssml: `<speak>${reason ?? `This is a test ${type} from the dev panel.`}</speak>`,
          priority: (priority ?? 'medium') as 'low' | 'medium' | 'high',
          suggestedTiming: new Date(),
          sent: false,
        };

        queueThinkingOfYou(userId, testMoment);

        log.info({ userId, type, priority }, 'Outreach trigger created');

        sendJsonResponse(res, 200, {
          success: true,
          type,
          priority: priority ?? 'medium',
          message: `${type} trigger queued for user`,
        });
        return true;
      } catch (error) {
        log.error({ error, userId, type }, 'Failed to create trigger');
        sendJsonResponse(res, 500, { error: 'Failed to create trigger' });
        return true;
      }
    }

    // POST /api/outreach/thinking-of-you - Queue thinking-of-you message
    if (pathname === '/api/outreach/thinking-of-you' && method === 'POST') {
      const body = await parseRequestBody(req);
      const { userId, trigger, reason } = body as {
        userId: string;
        trigger?: string;
        reason?: string;
      };

      if (!userId) {
        sendJsonResponse(res, 400, { error: 'userId required' });
        return true;
      }

      try {
        // Create a proper ThinkingOfYouMoment
        const moment = {
          id: `toy-${Date.now()}`,
          type: 'thought_of_you' as const,
          trigger: {
            type: 'random' as const,
            context: trigger ?? 'dev_panel',
          },
          message: reason ?? 'Hey! Just thinking of you.',
          ssml: `<speak>${reason ?? 'Hey! Just thinking of you.'}</speak>`,
          priority: 'medium' as const,
          suggestedTiming: new Date(),
          sent: false,
        };

        queueThinkingOfYou(userId, moment);

        log.info({ userId, trigger }, 'Thinking-of-you queued');

        sendJsonResponse(res, 200, {
          success: true,
          message: 'Thinking-of-you message queued',
        });
        return true;
      } catch (error) {
        log.error({ error, userId }, 'Failed to queue thinking-of-you');
        sendJsonResponse(res, 500, { error: 'Failed to queue message' });
        return true;
      }
    }

    // GET /api/outreach/history - Get outreach history
    if (pathname === '/api/outreach/history' && method === 'GET') {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const userId = url.searchParams.get('userId');
      const limit = parseInt(url.searchParams.get('limit') ?? '10', 10);

      if (!userId) {
        sendJsonResponse(res, 400, { error: 'userId required' });
        return true;
      }

      const db = getFirestore();
      if (!db) {
        sendJsonResponse(res, 503, { error: 'Database not available' });
        return true;
      }

      try {
        const snapshot = await db
          .collection('outreach_history')
          .where('userId', '==', userId)
          .orderBy('sentAt', 'desc')
          .limit(limit)
          .get();

        const history = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        sendJsonResponse(res, 200, {
          success: true,
          count: history.length,
          history,
        });
        return true;
      } catch (error) {
        log.error({ error, userId }, 'Failed to get outreach history');
        // Return empty history if collection doesn't exist yet
        sendJsonResponse(res, 200, {
          success: true,
          count: 0,
          history: [],
          note: 'No outreach history found',
        });
        return true;
      }
    }

    return false;
  } catch (error) {
    log.error({ error, pathname }, 'Outreach route error');
    sendJsonResponse(res, 500, { error: 'Internal server error' });
    return true;
  }
}

export default handleOutreachRoutes;

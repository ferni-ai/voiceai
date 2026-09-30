/**
 * Outreach API: scheduler and onboarding arc endpoints.
 * Extracted from outreach.routes.ts.
 */

import { runDailyOutreachJob } from '../../services/outreach/daily-outreach-job.js';
import type {
  OutreachType,
  OutreachChannel,
} from '../../services/outreach/llm-content-generator.js';
import { getFirestoreDb } from '../../services/superhuman/firestore-utils.js';
import type { UserProfile } from '../../types/user-profile.js';
import { getLogger } from '../../utils/safe-logger.js';
import { parseRequestBody, sendJsonResponse } from '../helpers.js';
import type { OutreachRouteContext } from './types.js';

const log = getLogger().child({ module: 'outreach-handler' });

export async function handleSchedulerRoutes(ctx: OutreachRouteContext): Promise<boolean> {
  const { req, res, method, route, auth, fromScheduler } = ctx;

  // ========================================================================
  // SCHEDULER ENDPOINTS (Cloud Scheduler / Admin)
  // ========================================================================

  // POST /api/outreach/daily-job - Trigger daily outreach job (scheduler or admin)
  if (route === '/daily-job' && method === 'POST') {
    const isScheduler = fromScheduler;
    if (!isScheduler && !auth.isAdmin) {
      sendJsonResponse(res, 403, {
        success: false,
        error: 'Requires Cloud Scheduler or admin access',
      });
      return true;
    }

    log.info({ isScheduler, userId: auth.userId }, '🌅 Daily outreach job triggered via API');

    try {
      // Helper to fetch user profiles from Firestore
      const getUserProfiles = async (): Promise<UserProfile[]> => {
        const db = getFirestoreDb();
        if (!db) {
          log.warn('Firestore not available, returning empty profiles');
          return [];
        }

        const snapshot = await db.collection('bogle_users').limit(1000).get();
        return snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => ({
          id: doc.id,
          ...doc.data(),
        })) as UserProfile[];
      };

      const body = await parseRequestBody(req);
      const { dryRun = false, maxUsersPerRun } = body as {
        dryRun?: boolean;
        maxUsersPerRun?: number;
      };

      const result = await runDailyOutreachJob({
        getUserProfiles,
        dryRun,
        maxUsersPerRun,
        delayBetweenUsersMs: 100, // Rate limit
      });

      sendJsonResponse(res, 200, {
        success: true,
        result: {
          usersEvaluated: result.usersEvaluated,
          outreachSent: result.outreachSent,
          byType: result.byType,
          durationMs: result.durationMs,
          errorCount: result.errors.length,
        },
      });
    } catch (error) {
      log.error({ error }, '❌ Daily outreach job failed');
      sendJsonResponse(res, 500, {
        success: false,
        error: 'Daily outreach job failed',
      });
    }
    return true;
  }

  return false;
}

export async function handleOnboardingRoutes(ctx: OutreachRouteContext): Promise<boolean> {
  const { req, res, method, route, auth, authenticatedUserId, fromScheduler } = ctx;

  // ========================================================================
  // INTELLIGENT ONBOARDING ARC ENDPOINTS (LLM-Driven Personalization)
  // ========================================================================

  // GET /api/outreach/onboarding/progress - Get onboarding progress
  if (route === '/onboarding/progress' && method === 'GET') {
    const { getOnboardingProgress } =
      await import('../../services/outreach/intelligent-onboarding-arc.js');

    const progress = await getOnboardingProgress(authenticatedUserId);
    if (!progress) {
      sendJsonResponse(res, 200, { enrolled: false });
      return true;
    }

    sendJsonResponse(res, 200, { enrolled: true, ...progress });
    return true;
  }

  // POST /api/outreach/onboarding/check-ins - Generate and optionally deliver personalized check-ins
  if (route === '/onboarding/check-ins' && method === 'POST') {
    const body = await parseRequestBody(req);
    const { channel = 'in_app', deliver: shouldDeliver = false } = body as {
      channel?: 'sms' | 'email' | 'voice_call' | 'push' | 'in_app';
      deliver?: boolean;
    };

    const { getPendingCheckIns, recordCheckInSent } =
      await import('../../services/outreach/intelligent-onboarding-arc.js');
    const { deliver } = await import('../../services/outreach/unified-delivery.js');

    const checkIns = await getPendingCheckIns(authenticatedUserId, channel);

    if (shouldDeliver && checkIns.length > 0) {
      const checkIn = checkIns[0];
      const result = await deliver({
        userId: authenticatedUserId,
        channel: checkIn.channel,
        content: {
          text: checkIn.content.text,
          ssml: checkIn.content.ssml,
          subject: checkIn.content.subject,
          htmlBody: checkIn.content.htmlBody,
          personaId: checkIn.personaId,
          reason: checkIn.reason,
          confidence: 0.9,
        },
        outreachType: checkIn.type,
        triggerId: checkIn.id,
      });

      if (result.success) {
        await recordCheckInSent(authenticatedUserId, checkIn.type, checkIn.channel);
      }

      sendJsonResponse(res, 200, {
        success: true,
        checkIns: [checkIn],
        delivered: result.success,
        deliveryResult: result,
      });
      return true;
    }

    sendJsonResponse(res, 200, { success: true, checkIns, delivered: false });
    return true;
  }

  // GET /api/outreach/pending-messages - Get pending in-app messages (LLM-generated)
  if (route === '/pending-messages' && method === 'GET') {
    const { getPendingMessages } = await import('../../services/outreach/unified-delivery.js');
    const messages = await getPendingMessages(authenticatedUserId);
    sendJsonResponse(res, 200, { success: true, messages, count: messages.length });
    return true;
  }

  // POST /api/outreach/messages/:messageId/read - Mark message as read
  if (route.match(/^\/messages\/[^/]+\/read$/) && method === 'POST') {
    const messageId = route.split('/')[2];
    const { markMessageRead } = await import('../../services/outreach/unified-delivery.js');
    await markMessageRead(authenticatedUserId, messageId);
    sendJsonResponse(res, 200, { success: true });
    return true;
  }

  // GET /api/outreach/channels/status - Get delivery channel status
  if (route === '/channels/status' && method === 'GET') {
    const { getChannelStatus } = await import('../../services/outreach/unified-delivery.js');
    const status = await getChannelStatus();
    sendJsonResponse(res, 200, { success: true, channels: status });
    return true;
  }

  // POST /api/outreach/test-llm-content - Generate test content (dev only)
  if (route === '/test-llm-content' && method === 'POST') {
    if (process.env.NODE_ENV !== 'development' && !auth.isAdmin) {
      sendJsonResponse(res, 403, { success: false, error: 'Dev/admin only' });
      return true;
    }

    const body = await parseRequestBody(req);
    const {
      outreachType = 'thinking_of_you' as OutreachType,
      channel = 'in_app' as OutreachChannel,
    } = body as {
      outreachType?: OutreachType;
      channel?: OutreachChannel;
    };

    const { generatePersonalizedContent } =
      await import('../../services/outreach/llm-content-generator.js');
    const { getOnboardingState } =
      await import('../../services/outreach/intelligent-onboarding-arc.js');

    // Get user context
    const state = await getOnboardingState(authenticatedUserId);
    const userContext = {
      userId: authenticatedUserId,
      name: state?.name,
      daysSinceSignup: state?.daysSinceSignup || 0,
      conversationCount: state?.conversationCount || 0,
      engagementLevel: state?.engagementLevel || ('medium' as const),
      primaryConcerns: state?.primaryConcerns || [],
      recentTopics: state?.recentTopics || [],
      boundaries: state?.boundaries || [],
    };

    const content = await generatePersonalizedContent(userContext, outreachType, channel);

    sendJsonResponse(res, 200, { success: true, content });
    return true;
  }

  // POST /api/outreach/scheduler/daily - Cloud Scheduler trigger for daily outreach
  if (route === '/scheduler/daily' && method === 'POST') {
    if (!fromScheduler && !auth.isAdmin) {
      sendJsonResponse(res, 403, {
        success: false,
        error: 'Requires Cloud Scheduler or admin access',
      });
      return true;
    }

    const { handleSchedulerTrigger } =
      await import('../../services/outreach/automated-scheduler.js');

    try {
      // {"dryRun": true} previews the run: who would get what, nothing sent.
      const body = (await parseRequestBody(req).catch(() => ({}))) as { dryRun?: boolean };
      const result = await handleSchedulerTrigger({ dryRun: body?.dryRun === true });
      sendJsonResponse(res, 200, { success: true, ...result });
    } catch (error) {
      log.error({ error: String(error) }, 'Scheduler trigger failed');
      sendJsonResponse(res, 403, { success: false, error: 'Unauthorized or failed' });
    }
    return true;
  }

  // POST /api/outreach/scheduler/test - Test scheduler (admin only)
  if (route === '/scheduler/test' && method === 'POST') {
    // Admins only (dev mode counts as admin in development). The x-admin-key
    // header's value used to go unchecked: any value ran a real send.
    if (!auth.isAdmin) {
      sendJsonResponse(res, 403, { success: false, error: 'Admin access required' });
      return true;
    }

    const { runDailyOutreach } = await import('../../services/outreach/automated-scheduler.js');
    const body = await parseRequestBody(req);
    const { dryRun = true, batchSize = 10 } = body as { dryRun?: boolean; batchSize?: number };

    const result = await runDailyOutreach({ dryRun, batchSize, respectQuietHours: true });
    sendJsonResponse(res, 200, { success: true, ...result });
    return true;
  }

  // GET /api/outreach/engagement/stats - Get engagement stats for current user
  if (route === '/engagement/stats' && method === 'GET') {
    const { getEngagementStats } = await import('../../services/outreach/engagement-tracking.js');
    const stats = await getEngagementStats(authenticatedUserId);
    sendJsonResponse(res, 200, { success: true, stats });
    return true;
  }

  return false;
}

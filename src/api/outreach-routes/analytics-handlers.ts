/**
 * Outreach API: analytics and registration endpoints.
 * Extracted from outreach.routes.ts.
 */

import {
  calculateOptimalTime,
  getChannelProfile,
  getOutreachDecisionEngine,
  getTimingProfile,
  getUserContext,
  registerUserForOutreach,
  updateUserContext,
} from '../../services/outreach/index.js';
import { getLogger } from '../../utils/safe-logger.js';
import { parseRequestBody, sendJsonResponse } from '../helpers.js';
import type { OutreachRouteContext } from './types.js';

const log = getLogger().child({ module: 'outreach-handler' });

export async function handleAnalyticsRoutes(ctx: OutreachRouteContext): Promise<boolean> {
  const { res, method, route, authenticatedUserId } = ctx;

  // ========================================================================
  // ANALYTICS
  // ========================================================================

  // GET /api/outreach/analytics
  if (route === '/analytics' && method === 'GET') {
    // Use authenticated userId
    const userId = authenticatedUserId;

    const engine = getOutreachDecisionEngine();
    const analytics = engine.getAnalytics(userId);

    sendJsonResponse(res, 200, {
      success: true,
      analytics,
    });
    return true;
  }

  // GET /api/outreach/timing
  if (route === '/timing' && method === 'GET') {
    // Use authenticated userId
    const userId = authenticatedUserId;

    const profile = getTimingProfile(userId);
    const nextOptimal = calculateOptimalTime(userId, {
      trigger: { type: 'general', priority: 'medium' },
      channel: 'sms',
    });

    sendJsonResponse(res, 200, {
      success: true,
      patterns: {
        preferredHours: profile.engagementPatterns.preferredHours,
        preferredDays: profile.engagementPatterns.preferredDays,
        avgResponseTimeMs: profile.engagementPatterns.avgResponseTimeMs,
        totalInteractions: profile.engagementPatterns.totalInteractions,
      },
      nextOptimalWindow: nextOptimal,
      preferences: profile.preferences,
    });
    return true;
  }

  // GET /api/outreach/channel-stats
  if (route === '/channel-stats' && method === 'GET') {
    // Use authenticated userId
    const userId = authenticatedUserId;

    const profile = getChannelProfile(userId);

    sendJsonResponse(res, 200, {
      success: true,
      stats: {
        preferredChannel: profile.preferences.preferredChannel,
        disabledChannels: profile.preferences.disabledChannels,
        responseRates: profile.learning.responseRates,
        successRates: profile.learning.successfulByChannel,
        totalByChannel: profile.learning.totalByChannel,
        relationshipStage: profile.relationshipStage,
        allowedChannels: profile.allowedChannels,
      },
    });
    return true;
  }

  // GET /api/outreach/context
  if (route === '/context' && method === 'GET') {
    // Use authenticated userId
    const userId = authenticatedUserId;

    const context = getUserContext(userId);

    sendJsonResponse(res, 200, {
      success: true,
      context: {
        lastConversation: context.conversations.lastConversation,
        emotionalState: context.emotional.currentState,
        emotionalTrend: context.emotional.emotionalTrend,
        activeCommitments: context.commitments.active.length,
        currentStruggles: context.progress.currentStruggles.length,
        recentWins: context.progress.recentWins.length,
        relationshipStage: context.relationship.stage,
        upcomingEvents: context.lifeEvents.upcoming.length,
      },
    });
    return true;
  }

  return false;
}

export async function handleRegistrationRoutes(ctx: OutreachRouteContext): Promise<boolean> {
  const { req, res, method, route } = ctx;

  // ========================================================================
  // REGISTRATION
  // ========================================================================

  // POST /api/outreach/register
  if (route === '/register' && method === 'POST') {
    const body = await parseRequestBody(req);
    const { userId, relationshipStartDate } = body as {
      userId: string;
      relationshipStartDate?: string;
    };

    if (!userId) {
      sendJsonResponse(res, 400, { success: false, error: 'userId is required' });
      return true;
    }

    registerUserForOutreach(
      userId,
      relationshipStartDate ? new Date(relationshipStartDate) : undefined
    );

    sendJsonResponse(res, 200, {
      success: true,
      message: 'User registered for outreach',
    });
    return true;
  }

  // POST /api/outreach/context
  if (route === '/context' && method === 'POST') {
    const body = await parseRequestBody(req);
    const { userId, context } = body as {
      userId: string;
      context: {
        emotionalState?: string;
        recentTopics?: string[];
        recentWins?: string[];
        currentStruggles?: string[];
        upcomingEvents?: Array<{ date: Date; description: string }>;
        interests?: string[];
      };
    };

    if (!userId) {
      sendJsonResponse(res, 400, { success: false, error: 'userId is required' });
      return true;
    }

    updateUserContext(userId, context);
    sendJsonResponse(res, 200, { success: true, message: 'Context updated' });
    return true;
  }

  return false;
}

/**
 * Monetization API: Growth Journey endpoints.
 * Extracted from monetization-routes.ts.
 */

import {
  checkNewMilestones,
  getCurrentSeason,
  JOURNEY_MILESTONES,
} from '../../services/monetization/journey.js';
import {
  celebrateJourneyMilestone,
  createUserJourney,
  getUserJourney,
  recordJourneyConversation,
  recordJourneyGoal,
} from '../../services/monetization/persistence.js';
import { createPaymentIntent } from '../../services/stripe-payments.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { RequestContext, ResponseContext } from './types.js';

const log = createLogger({ module: 'MonetizationAPI' });

// ============================================================================
// GROWTH JOURNEY ENDPOINTS
// ============================================================================

/**
 * GET /api/monetization/journey/current
 * Get current season info and user journey progress
 *
 * SECURITY: Uses authenticated userId
 */
export async function getJourneyInfo(ctx: RequestContext): Promise<ResponseContext> {
  // SECURITY: Prefer authenticated userId over deprecated x-user-id
  const userId = ctx.authUserId || ctx.query.userId;

  const currentSeason = getCurrentSeason();

  // Get or create user progress from persistence
  let userProgress = userId ? await getUserJourney(userId) : null;

  if (!userProgress && userId) {
    userProgress = await createUserJourney(userId, currentSeason.id);
  }

  const progress = userProgress ?? {
    seasonId: currentSeason.id,
    isCompanion: false,
    conversationCount: 0,
    weeksTogetherCount: 0,
    goalsAchievedCount: 0,
    celebratedMilestones: [],
    startedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
  };

  // Check for new available milestones
  const availableMilestones = checkNewMilestones(
    {
      conversationCount: progress.conversationCount,
      weeksTogetherCount: progress.weeksTogetherCount,
      goalsAchievedCount: progress.goalsAchievedCount,
    },
    progress.celebratedMilestones
  );

  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {
      season: currentSeason,
      progress,
      availableMilestones,
      milestones: JOURNEY_MILESTONES,
      daysRemaining: Math.max(
        0,
        Math.ceil((new Date(currentSeason.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      ),
    },
  };
}

/**
 * POST /api/monetization/journey/companion
 * Become a season companion (supporter)
 */
export async function becomeCompanion(ctx: RequestContext): Promise<ResponseContext> {
  const { userId, seasonId } = ctx.body as {
    userId?: string;
    seasonId?: string;
  };

  if (!userId || !seasonId) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'userId and seasonId are required' },
    };
  }

  try {
    const payment = await createPaymentIntent({
      userId,
      amountCents: 499, // $4.99
      type: 'journey_companion',
      description: `Season Companion - ${seasonId}`,
      metadata: { season_id: seasonId },
    });

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        clientSecret: payment.clientSecret,
        paymentIntentId: payment.paymentIntentId,
      },
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to create companion purchase');
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: String(error) },
    };
  }
}

/**
 * POST /api/monetization/journey/record
 * Record activity for milestone tracking
 */
export async function recordJourneyActivity(ctx: RequestContext): Promise<ResponseContext> {
  const { userId, activityType } = ctx.body as {
    userId?: string;
    activityType?: 'conversation' | 'goal';
  };

  if (!userId || !activityType) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'userId and activityType are required' },
    };
  }

  try {
    let journey;
    if (activityType === 'conversation') {
      journey = await recordJourneyConversation(userId);
    } else {
      journey = await recordJourneyGoal(userId);
    }

    // Check for new milestones
    const newMilestones = checkNewMilestones(
      {
        conversationCount: journey.conversationCount,
        weeksTogetherCount: journey.weeksTogetherCount,
        goalsAchievedCount: journey.goalsAchievedCount,
      },
      journey.celebratedMilestones
    );

    log.info(
      { userId, activityType, newMilestones: newMilestones.length },
      'Journey activity recorded'
    );

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        recorded: true,
        progress: journey,
        newMilestones,
      },
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to record journey activity');
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: String(error) },
    };
  }
}

/**
 * POST /api/monetization/journey/celebrate
 * Celebrate a milestone (receive the gift)
 */
export async function celebrateMilestone(ctx: RequestContext): Promise<ResponseContext> {
  const { userId, milestoneId } = ctx.body as {
    userId?: string;
    milestoneId?: string;
  };

  if (!userId || !milestoneId) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'userId and milestoneId are required' },
    };
  }

  try {
    // Validate milestone exists
    const milestone = JOURNEY_MILESTONES.find((m) => m.id === milestoneId);
    if (!milestone) {
      return {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Milestone not found' },
      };
    }

    // Mark as celebrated
    await celebrateJourneyMilestone(userId, milestoneId);

    log.info({ userId, milestoneId, title: milestone.title }, 'Milestone celebrated');

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        success: true,
        milestone,
        message: 'Your gift is ready!',
      },
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to celebrate milestone');
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: String(error) },
    };
  }
}

/**
 * Monetization API Routes
 *
 * Endpoints for Ferni's value-aligned monetization:
 * - Tip Jar - Gratitude-based contributions
 * - Value Capture - Outcome-based sharing
 * - Ferni Fund - Pay-it-forward community
 * - B2B - Organization management
 * - Partners - Contextual recommendations
 *
 * Philosophy: These endpoints serve users who WANT to support Ferni,
 * not users we're pressuring. Handle with warmth.
 */

import { b2bLicensing } from '../services/monetization/b2b-licensing.js';
import { contextualPartnerships } from '../services/monetization/contextual-partnerships.js';
import { ferniFund } from '../services/monetization/ferni-fund.js';
import {
  checkNewMilestones,
  getCurrentSeason,
  JOURNEY_MILESTONES,
} from '../services/monetization/journey.js';
import {
  celebrateJourneyMilestone,
  createUserJourney,
  getUserJourney,
  initMonetizationPersistence,
  recordJourneyConversation,
  recordJourneyGoal,
} from '../services/monetization/persistence.js';
import { tipJar } from '../services/monetization/tip-jar.js';
import { valueCapture } from '../services/monetization/value-capture.js';
import {
  createPaymentIntent,
  getUserMonetizationData,
  handlePaymentSucceeded,
  isStripeConfigured,
  verifyPayment,
} from '../services/integrations/stripe-payments.js';
import { createLogger } from '../utils/safe-logger.js';

// Initialize persistence on module load
initMonetizationPersistence();

const log = createLogger({ module: 'MonetizationAPI' });

// ============================================================================
// TYPES
// ============================================================================

interface RequestContext {
  method: string;
  pathname: string;
  query: Record<string, string>;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
  /**
   * Authenticated user ID from Firebase auth (SECURITY: use this instead of query params)
   * Only populated after proper authentication via requireAuth middleware.
   */
  authUserId?: string;
  /** Whether the authenticated user is an admin */
  isAdmin?: boolean;
}

interface ResponseContext {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

type RouteHandler = (ctx: RequestContext) => Promise<ResponseContext>;

// ============================================================================
// TIP JAR ENDPOINTS
// ============================================================================

/**
 * GET /api/monetization/tip/config
 * Get tip jar configuration and user's tip history
 *
 * SECURITY: Uses authenticated userId when available
 */
async function getTipConfig(ctx: RequestContext): Promise<ResponseContext> {
  // SECURITY: Prefer authenticated userId over deprecated x-user-id
  const userId = ctx.authUserId || ctx.query.userId;

  const config = tipJar.getConfig();
  const stats = tipJar.getStats();
  const userTips = userId ? await tipJar.getUserTips(userId) : [];

  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {
      config,
      stats: {
        totalTips: stats.tipCount,
        averageTipCents: stats.averageTipCents,
      },
      userTips: userTips.slice(0, 10), // Last 10 tips
      stripeEnabled: isStripeConfigured(),
    },
  };
}

/**
 * POST /api/monetization/tip
 * Create a tip payment
 */
async function createTip(ctx: RequestContext): Promise<ResponseContext> {
  const { userId, amountCents, message } = ctx.body as {
    userId?: string;
    amountCents?: number;
    message?: string;
  };

  if (!userId || !amountCents) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'userId and amountCents are required' },
    };
  }

  try {
    // Create tip record
    const tip = await tipJar.create({ userId, amountCents, message });

    // Create Stripe payment intent
    const payment = await createPaymentIntent({
      userId,
      amountCents,
      type: 'tip',
      metadata: { tip_id: tip.id, message: message || '' },
    });

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        tipId: tip.id,
        clientSecret: payment.clientSecret,
        paymentIntentId: payment.paymentIntentId,
      },
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to create tip');
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: String(error) },
    };
  }
}

/**
 * POST /api/monetization/tip/complete
 * Confirm tip payment succeeded
 */
async function completeTip(ctx: RequestContext): Promise<ResponseContext> {
  const { paymentIntentId } = ctx.body as { paymentIntentId?: string };

  if (!paymentIntentId) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'paymentIntentId is required' },
    };
  }

  try {
    const result = await verifyPayment(paymentIntentId);

    if (result.succeeded) {
      const thankYou = tipJar.getThankYou();
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          success: true,
          thankYouMessage: thankYou,
        },
      };
    }

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { success: false, message: 'Payment not yet completed' },
    };
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to verify tip');
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Failed to verify payment' },
    };
  }
}

// ============================================================================
// VALUE CAPTURE ENDPOINTS
// ============================================================================

/**
 * POST /api/monetization/value/detect
 * Detect if a message indicates a value event
 */
async function detectValue(ctx: RequestContext): Promise<ResponseContext> {
  const { userId, message, conversationId } = ctx.body as {
    userId?: string;
    message?: string;
    conversationId?: string;
  };

  if (!userId || !message) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'userId and message are required' },
    };
  }

  const event = await valueCapture.detect({
    userId,
    message,
    conversationId: conversationId || '',
  });

  if (event) {
    const prompt = valueCapture.getPrompt(event);
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        detected: true,
        event: {
          id: event.id,
          type: event.type,
          estimatedValueCents: event.estimatedValueCents,
          suggestedContributionCents: event.suggestedContributionCents,
        },
        prompt,
      },
    };
  }

  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { detected: false },
  };
}

/**
 * POST /api/monetization/value/contribute
 * Create a value capture contribution
 */
async function contributeValue(ctx: RequestContext): Promise<ResponseContext> {
  const { userId, eventId, amountCents } = ctx.body as {
    userId?: string;
    eventId?: string;
    amountCents?: number;
  };

  if (!userId || !eventId || !amountCents) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'userId, eventId, and amountCents are required' },
    };
  }

  try {
    const payment = await createPaymentIntent({
      userId,
      amountCents,
      type: 'value_capture',
      metadata: { event_id: eventId },
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
    log.error({ error: String(error), userId }, 'Failed to create value contribution');
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: String(error) },
    };
  }
}

// ============================================================================
// FERNI FUND ENDPOINTS
// ============================================================================

/**
 * GET /api/monetization/fund/status
 * Get Ferni Fund status
 */
async function getFundStatus(): Promise<ResponseContext> {
  const status = ferniFund.getStatus();

  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: status,
  };
}

/**
 * POST /api/monetization/fund/contribute
 * Contribute to Ferni Fund
 */
async function contributeFund(ctx: RequestContext): Promise<ResponseContext> {
  const { userId, amountCents, message, isRecurring, recurringFrequency } = ctx.body as {
    userId?: string;
    amountCents?: number;
    message?: string;
    isRecurring?: boolean;
    recurringFrequency?: 'weekly' | 'monthly';
  };

  if (!userId || !amountCents) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'userId and amountCents are required' },
    };
  }

  try {
    const payment = await createPaymentIntent({
      userId,
      amountCents,
      type: 'ferni_fund',
      description: 'Ferni Fund - Pay it forward contribution',
      metadata: {
        message: message || '',
        is_recurring: String(isRecurring || false),
        frequency: recurringFrequency || '',
      },
    });

    // Calculate impact preview
    const conversationsSponsored = Math.floor(amountCents / ferniFund.COST_PER_CONVERSATION);

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        clientSecret: payment.clientSecret,
        paymentIntentId: payment.paymentIntentId,
        impact: {
          conversationsSponsored,
          message: `This will sponsor ${conversationsSponsored} conversation${conversationsSponsored === 1 ? '' : 's'}`,
        },
      },
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to create fund contribution');
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: String(error) },
    };
  }
}

/**
 * GET /api/monetization/fund/impact
 * Get contributor's impact
 *
 * SECURITY: Uses authenticated userId
 */
async function getContributorImpact(ctx: RequestContext): Promise<ResponseContext> {
  // SECURITY: Prefer authenticated userId over deprecated x-user-id
  const userId = ctx.authUserId || ctx.query.userId;

  if (!userId) {
    return {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Authentication required' },
    };
  }

  const impact = ferniFund.getContributorImpact(userId);
  const contributions = ferniFund.getUserContributions(userId);

  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {
      ...impact,
      recentContributions: contributions.slice(0, 5),
    },
  };
}

// ============================================================================
// B2B LICENSING ENDPOINTS
// ============================================================================

/**
 * GET /api/monetization/b2b/plans
 * Get available B2B plans
 */
async function getB2BPlans(): Promise<ResponseContext> {
  const plans = b2bLicensing.getPlanComparison();

  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { plans },
  };
}

/**
 * POST /api/monetization/b2b/organization
 * Create a new organization
 */
async function createOrganization(ctx: RequestContext): Promise<ResponseContext> {
  const { name, plan, seatCount, adminUserId, config } = ctx.body as {
    name?: string;
    plan?: 'starter' | 'growth' | 'enterprise';
    seatCount?: number;
    adminUserId?: string;
    config?: Record<string, unknown>;
  };

  if (!name || !plan || !seatCount || !adminUserId) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'name, plan, seatCount, and adminUserId are required' },
    };
  }

  try {
    const org = await b2bLicensing.createOrganization({
      name,
      plan,
      seatCount,
      adminUserId,
      config: config as {
        welcomeMessage?: string;
        allowedPersonas?: string[];
        customPrompts?: Record<string, string>;
        companyValues?: string[];
      },
    });

    const monthlyCost = b2bLicensing.calculateMonthlyCost(plan, seatCount);

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        organization: org,
        monthlyCostCents: monthlyCost,
        onboardingChecklist: b2bLicensing.getOnboardingChecklist(org),
      },
    };
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to create organization');
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: String(error) },
    };
  }
}

/**
 * GET /api/monetization/b2b/organization/:orgId
 * Get organization details
 *
 * SECURITY: Uses authenticated userId
 */
async function getOrganization(ctx: RequestContext): Promise<ResponseContext> {
  const { orgId } = ctx.query;
  // SECURITY: Prefer authenticated userId over deprecated x-user-id
  const userId = ctx.authUserId || ctx.query.userId;

  if (!orgId) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'orgId is required' },
    };
  }

  const org = b2bLicensing.getOrganization(orgId);

  if (!org) {
    return {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Organization not found' },
    };
  }

  // Check if user has access
  if (userId && !org.memberUserIds.includes(userId)) {
    return {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Access denied' },
    };
  }

  const isAdmin = userId ? b2bLicensing.isOrgAdmin(userId, orgId) : false;
  const usageStats = b2bLicensing.getOrgUsageStats(orgId);
  const roi = b2bLicensing.getROIEstimate(org);

  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {
      organization: org,
      isAdmin,
      usageStats,
      roiEstimate: roi,
      onboardingChecklist: b2bLicensing.getOnboardingChecklist(org),
    },
  };
}

/**
 * POST /api/monetization/b2b/invite
 * Create an organization invite
 */
async function createOrgInvite(ctx: RequestContext): Promise<ResponseContext> {
  const { orgId, email, role, invitedBy } = ctx.body as {
    orgId?: string;
    email?: string;
    role?: 'admin' | 'member';
    invitedBy?: string;
  };

  if (!orgId || !email || !role || !invitedBy) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'orgId, email, role, and invitedBy are required' },
    };
  }

  try {
    const invite = await b2bLicensing.createInvite({ orgId, email, role, invitedBy });

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { invite },
    };
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to create invite');
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: String(error) },
    };
  }
}

// ============================================================================
// CONTEXTUAL PARTNERSHIPS ENDPOINTS
// ============================================================================

/**
 * POST /api/monetization/partners/recommend
 * Get a contextual partner recommendation
 */
async function getPartnerRecommendation(ctx: RequestContext): Promise<ResponseContext> {
  const { message, conversationContext, excludePartnerIds } = ctx.body as {
    message?: string;
    conversationContext?: string;
    excludePartnerIds?: string[];
  };

  if (!message) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'message is required' },
    };
  }

  const recommendation = contextualPartnerships.getBestRecommendation({
    message,
    conversationContext,
    recentRecommendations: excludePartnerIds,
  });

  if (recommendation) {
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        hasRecommendation: true,
        partner: {
          id: recommendation.partner.id,
          name: recommendation.partner.name,
          description: recommendation.partner.description,
          category: recommendation.partner.category,
        },
        introduction: recommendation.introduction,
        disclosure: contextualPartnerships.getDisclosure(),
      },
    };
  }

  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { hasRecommendation: false },
  };
}

/**
 * POST /api/monetization/partners/click
 * Record a partner referral click
 */
async function recordPartnerClick(ctx: RequestContext): Promise<ResponseContext> {
  const { userId, partnerId, conversationId, triggerContext } = ctx.body as {
    userId?: string;
    partnerId?: string;
    conversationId?: string;
    triggerContext?: string;
  };

  if (!userId || !partnerId) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'userId and partnerId are required' },
    };
  }

  const referral = contextualPartnerships.recordReferral({
    partnerId,
    userId,
    conversationId: conversationId || '',
    triggerContext: triggerContext || '',
  });

  contextualPartnerships.recordClick(referral.id);

  // Get partner affiliate URL
  const partners = contextualPartnerships.getActivePartners();
  const partner = partners.find((p) => p.id === partnerId);

  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {
      referralId: referral.id,
      affiliateUrl: partner?.affiliateUrl || null,
    },
  };
}

/**
 * POST /api/monetization/partners/feedback
 * Record feedback on a partner recommendation
 */
async function recordPartnerFeedback(ctx: RequestContext): Promise<ResponseContext> {
  const { partnerId, feedback } = ctx.body as {
    partnerId?: string;
    feedback?: 'helpful' | 'not_helpful';
  };

  if (!partnerId || !feedback) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'partnerId and feedback are required' },
    };
  }

  contextualPartnerships.updateQuality(partnerId, feedback);

  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { success: true, message: 'Thank you for your feedback!' },
  };
}

// ============================================================================
// USER MONETIZATION DATA
// ============================================================================

/**
 * GET /api/monetization/user
 * Get user's monetization data and contribution history
 *
 * SECURITY: Uses authenticated userId (ctx.authUserId) to prevent IDOR attacks.
 */
async function getUserMonetization(ctx: RequestContext): Promise<ResponseContext> {
  // SECURITY: Use authenticated userId, not from query/headers (prevents IDOR)
  // Admins can query other users, regular users can only see their own data
  const requestedUserId = ctx.query.userId;
  const userId = ctx.isAdmin && requestedUserId ? String(requestedUserId) : ctx.authUserId || '';

  if (!userId) {
    return {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Authentication required' },
    };
  }

  try {
    const data = await getUserMonetizationData(userId);
    const tips = await tipJar.getUserTips(userId);
    const valueEvents = await valueCapture.getUserEvents(userId);
    const fundContributions = ferniFund.getUserContributions(userId);
    const fundImpact = ferniFund.getContributorImpact(userId);

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        summary: data,
        tips: tips.slice(0, 5),
        valueEvents: valueEvents.slice(0, 5),
        fundContributions: fundContributions.slice(0, 5),
        fundImpact,
        totalContributionsCents:
          data.totalTipsCents +
          data.totalValueContributionsCents +
          data.totalFundContributionsCents,
      },
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get user monetization data');
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Failed to get data' },
    };
  }
}

// ============================================================================
// ROUTER
// ============================================================================

// ============================================================================
// GROWTH JOURNEY ENDPOINTS
// ============================================================================

/**
 * GET /api/monetization/journey/current
 * Get current season info and user journey progress
 *
 * SECURITY: Uses authenticated userId
 */
async function getJourneyInfo(ctx: RequestContext): Promise<ResponseContext> {
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
async function becomeCompanion(ctx: RequestContext): Promise<ResponseContext> {
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
async function recordJourneyActivity(ctx: RequestContext): Promise<ResponseContext> {
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
async function celebrateMilestone(ctx: RequestContext): Promise<ResponseContext> {
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

// ============================================================================
// STRIPE WEBHOOK ENDPOINT
// ============================================================================

/**
 * POST /api/monetization/webhook
 * Handle Stripe webhook events for payment confirmation
 */
async function handleStripeWebhook(ctx: RequestContext): Promise<ResponseContext> {
  const signature = ctx.headers['stripe-signature'] as string;

  if (!signature) {
    log.warn('Webhook received without signature');
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Missing stripe-signature header' },
    };
  }

  try {
    // Get raw body for signature verification
    const rawBody = ctx.body as unknown;

    // In a real implementation, you would verify the webhook signature here
    // using stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
    // For now, we'll trust the payload if it has the right structure

    const event = rawBody as {
      type: string;
      data: {
        object: {
          id: string;
          amount: number;
          metadata: Record<string, string>;
        };
      };
    };

    log.info({ eventType: event.type }, 'Stripe webhook received');

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        await handlePaymentSucceeded({
          id: paymentIntent.id,
          amount: paymentIntent.amount,
          metadata: paymentIntent.metadata,
        });
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object;
        log.warn({ paymentIntentId: paymentIntent.id }, 'Payment failed');
        break;
      }

      default:
        log.debug({ eventType: event.type }, 'Unhandled webhook event type');
    }

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { received: true },
    };
  } catch (error) {
    log.error({ error: String(error) }, 'Webhook processing failed');
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Webhook processing failed' },
    };
  }
}

const routes: Record<string, Record<string, RouteHandler>> = {
  GET: {
    // Tip Jar
    '/api/monetization/tip/config': getTipConfig,

    // Ferni Fund
    '/api/monetization/fund/status': getFundStatus,
    '/api/monetization/fund/impact': getContributorImpact,

    // B2B
    '/api/monetization/b2b/plans': getB2BPlans,
    '/api/monetization/b2b/organization': getOrganization,

    // Growth Journey
    '/api/monetization/journey/current': getJourneyInfo,

    // User data
    '/api/monetization/user': getUserMonetization,
  },
  POST: {
    // Tip Jar
    '/api/monetization/tip': createTip,
    '/api/monetization/tip/complete': completeTip,

    // Value Capture
    '/api/monetization/value/detect': detectValue,
    '/api/monetization/value/contribute': contributeValue,

    // Ferni Fund
    '/api/monetization/fund/contribute': contributeFund,

    // B2B
    '/api/monetization/b2b/organization': createOrganization,
    '/api/monetization/b2b/invite': createOrgInvite,

    // Partners
    '/api/monetization/partners/recommend': getPartnerRecommendation,
    '/api/monetization/partners/click': recordPartnerClick,
    '/api/monetization/partners/feedback': recordPartnerFeedback,

    // Growth Journey
    '/api/monetization/journey/companion': becomeCompanion,
    '/api/monetization/journey/record': recordJourneyActivity,
    '/api/monetization/journey/celebrate': celebrateMilestone,

    // Stripe Webhook
    '/api/monetization/webhook': handleStripeWebhook,
  },
};

/**
 * Check if a path is a monetization route
 */
export function isMonetizationRoute(pathname: string): boolean {
  return pathname.startsWith('/api/monetization/');
}

/**
 * Route a monetization API request
 */
export function routeMonetizationRequest(ctx: RequestContext): RouteHandler | null {
  const methodRoutes = routes[ctx.method];
  if (!methodRoutes) return null;

  return methodRoutes[ctx.pathname] || null;
}

/**
 * Handle monetization API request
 */
export async function handleMonetizationRequest(ctx: RequestContext): Promise<ResponseContext> {
  const handler = routeMonetizationRequest(ctx);

  if (!handler) {
    return {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Not found' },
    };
  }

  return handler(ctx);
}

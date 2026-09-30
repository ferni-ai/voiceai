/**
 * Monetization API: contextual partnership and user monetization data endpoints.
 * Extracted from monetization-routes.ts.
 */

import { contextualPartnerships } from '../../services/monetization/contextual-partnerships.js';
import { ferniFund } from '../../services/monetization/ferni-fund.js';
import { tipJar } from '../../services/monetization/tip-jar.js';
import { valueCapture } from '../../services/monetization/value-capture.js';
import { getUserMonetizationData } from '../../services/stripe-payments.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { RequestContext, ResponseContext } from './types.js';

const log = createLogger({ module: 'MonetizationAPI' });

// ============================================================================
// CONTEXTUAL PARTNERSHIPS ENDPOINTS
// ============================================================================

/**
 * POST /api/monetization/partners/recommend
 * Get a contextual partner recommendation
 */
export async function getPartnerRecommendation(ctx: RequestContext): Promise<ResponseContext> {
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
export async function recordPartnerClick(ctx: RequestContext): Promise<ResponseContext> {
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
export async function recordPartnerFeedback(ctx: RequestContext): Promise<ResponseContext> {
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
export async function getUserMonetization(ctx: RequestContext): Promise<ResponseContext> {
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

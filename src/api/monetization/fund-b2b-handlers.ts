/**
 * Monetization API: Ferni Fund and B2B licensing endpoints.
 * Extracted from monetization-routes.ts.
 */

import { b2bLicensing } from '../../services/monetization/b2b-licensing.js';
import { ferniFund } from '../../services/monetization/ferni-fund.js';
import { createPaymentIntent } from '../../services/stripe-payments.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { RequestContext, ResponseContext } from './types.js';

const log = createLogger({ module: 'MonetizationAPI' });

// ============================================================================
// FERNI FUND ENDPOINTS
// ============================================================================

/**
 * GET /api/monetization/fund/status
 * Get Ferni Fund status
 */
export async function getFundStatus(): Promise<ResponseContext> {
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
export async function contributeFund(ctx: RequestContext): Promise<ResponseContext> {
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
export async function getContributorImpact(ctx: RequestContext): Promise<ResponseContext> {
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
export async function getB2BPlans(): Promise<ResponseContext> {
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
export async function createOrganization(ctx: RequestContext): Promise<ResponseContext> {
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
export async function getOrganization(ctx: RequestContext): Promise<ResponseContext> {
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
export async function createOrgInvite(ctx: RequestContext): Promise<ResponseContext> {
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

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

import { initMonetizationPersistence } from '../services/monetization/persistence.js';
import type { RequestContext, ResponseContext, RouteHandler } from './monetization/types.js';
import {
  completeTip,
  contributeValue,
  createTip,
  detectValue,
  getTipConfig,
} from './monetization/tip-value-handlers.js';
import {
  contributeFund,
  createOrgInvite,
  createOrganization,
  getB2BPlans,
  getContributorImpact,
  getFundStatus,
  getOrganization,
} from './monetization/fund-b2b-handlers.js';
import {
  getPartnerRecommendation,
  getUserMonetization,
  recordPartnerClick,
  recordPartnerFeedback,
} from './monetization/partner-user-handlers.js';
import {
  becomeCompanion,
  celebrateMilestone,
  getJourneyInfo,
  recordJourneyActivity,
} from './monetization/journey-handlers.js';
import { handleStripeWebhook, verifyPaymentStatus } from './monetization/payment-handlers.js';

// Initialize persistence on module load
initMonetizationPersistence();

const routes: Record<string, Record<string, RouteHandler>> = {
  GET: {
    // Payment verification (redirect target after Stripe checkout)
    '/api/monetization/tip/verify': verifyPaymentStatus,
    '/api/monetization/fund/verify': verifyPaymentStatus,
    '/api/monetization/value/verify': verifyPaymentStatus,

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

/**
 * Engagement, communication and content routes.
 *
 * Outreach, background results, feature flags, feedback, brand, design tokens,
 * landing, commands, widget, monitoring, workers, performance, concierge,
 * telephony (Twilio, family check-in, outbound calls), proactive suggestions,
 * predictions and year in review.
 *
 * Part of the core API chain: dispatched inside the shared "API route error"
 * boundary in core-routes.ts.
 */

import { handleOutreachRoutes } from '../../../api/outreach.routes.js';
import { handleBackgroundResultsRoutes } from '../../../api/background-results-routes.js';
import { handleFeatureFlagsRoutes } from '../../../api/feature-flags-routes.js';
import { handleFeedbackRoutes, isFeedbackRoute } from '../../../api/feedback-routes.js';
import { handleBrandRoutes } from '../../../api/brand-routes.js';
import { handleCommandsRoutes } from '../../../api/commands-routes.js';
import { handleWidgetRoutes } from '../../../api/widget-routes.js';
import { handleMonitoringRoutes } from '../../../api/monitoring-routes.js';
import { handlePerformanceRoutes } from '../../../api/performance-routes.js';
import { handleConciergeRoutes } from '../../../api/concierge-routes.js';
import { handleProactiveRoutes } from '../../../api/proactive-routes.js';
import { handlePredictionsRoutes } from '../../../api/routes/predictions.js';
import { handleYearInReviewRoutes } from '../../../api/year-in-review-routes.js';
import { handleLandingIntelligenceRoutes } from '../../../api/landing-intelligence.routes.js';
import { handleLandingOptimizationRoutes } from '../../../api/landing-optimization.routes.js';
import { handleDesignTokensRoutes } from '../../../api/design-tokens-routes.js';
import { handleWorkerRoutes } from '../../../api/worker-routes.js';
import { handleTwilioRoutes } from '../../../api/twilio-routes.js';
import { handleFamilyCheckinWebhookRoutes } from '../../../api/family-checkin-webhook-routes.js';
import { handleOutboundCallRoutes } from '../../../api/outbound-call-handler.js';
import type { RouteContext } from './route-context.js';

/**
 * Returns true when the request is finished.
 */
export async function dispatchEngagementRoutes(ctx: RouteContext): Promise<boolean> {
  const { req, res, pathname, parsedUrl } = ctx;

  // Outreach routes
  if (pathname.startsWith('/api/outreach')) {
    const handled = await handleOutreachRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Background results routes (While You Were Away)
  if (pathname.startsWith('/api/background-results')) {
    const handled = await handleBackgroundResultsRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Feature flags routes
  if (pathname.startsWith('/api/flags')) {
    const handled = await handleFeatureFlagsRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Feedback routes (contextual feedback system)
  if (isFeedbackRoute(pathname)) {
    const handled = await handleFeedbackRoutes(req, res);
    if (handled) return true;
  }

  // Brand routes
  if (pathname.startsWith('/api/brand')) {
    const handled = await handleBrandRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Design tokens routes (public - for dynamic theming)
  if (pathname.startsWith('/api/design-tokens')) {
    const handled = await handleDesignTokensRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Landing routes
  if (pathname.startsWith('/api/landing')) {
    if (pathname.startsWith('/api/landing/optimization')) {
      const handled = await handleLandingOptimizationRoutes(req, res, pathname);
      if (handled) return true;
    }
    const handled = await handleLandingIntelligenceRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Commands routes
  if (pathname.startsWith('/api/commands')) {
    const handled = await handleCommandsRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Widget routes
  if (pathname.startsWith('/api/widget')) {
    const handled = await handleWidgetRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Monitoring routes
  if (pathname.startsWith('/api/monitoring')) {
    const handled = await handleMonitoringRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Worker routes (background worker stats and health)
  if (pathname.startsWith('/api/workers')) {
    const handled = await handleWorkerRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Performance routes
  if (pathname.startsWith('/api/performance')) {
    const handled = await handlePerformanceRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Concierge routes (AI-powered outreach)
  if (pathname.startsWith('/api/concierge')) {
    const handled = await handleConciergeRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Twilio routes (two-way conversational calls)
  if (pathname.startsWith('/api/twilio')) {
    const handled = await handleTwilioRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Family check-in webhook routes (Twilio callbacks for family calls)
  if (pathname.startsWith('/api/family-checkin/')) {
    const handled = await handleFamilyCheckinWebhookRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Outbound call routes (conversational calls initiated via API)
  if (pathname.startsWith('/api/outbound-call')) {
    const handled = await handleOutboundCallRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Proactive tool suggestions routes
  if (pathname.startsWith('/api/proactive')) {
    const handled = await handleProactiveRoutes(req, res, pathname);
    if (handled) return true;
  }

  // Predictions routes (Better Than Human - predictive coaching)
  if (pathname.startsWith('/api/predictions')) {
    const handled = await handlePredictionsRoutes(req, res, pathname, parsedUrl);
    if (handled) return true;
  }

  // Year in review ("Your Year with Ferni") routes
  if (pathname.startsWith('/api/year-in-review')) {
    const handled = await handleYearInReviewRoutes(req, res, {
      pathname,
      query: Object.fromEntries(new URLSearchParams(parsedUrl.search || '')),
    });
    if (handled) return true;
  }

  return false;
}

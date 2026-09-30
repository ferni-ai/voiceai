/**
 * Outreach API Handler
 *
 * HTTP handler for outreach routes that works with the raw http server in ui-server.js.
 * Wraps the Express router-style outreach-routes for compatibility.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getLogger } from '../utils/safe-logger.js';
import { rateLimit, requireAuth, type AuthContext } from './auth-middleware.js';
import { verifySchedulerRequest } from './scheduled-jobs/scheduler-auth.js';
import { handleCorsPreflightIfNeeded, parseRawBody, sendJsonResponse } from './helpers.js';
import {
  twilioSignedUrls,
  validateTwilioSignature,
} from '../services/outreach/webhooks/twilio-webhooks.js';
import { handleOutreachWebhookRoutes } from './outreach-webhook-routes.js';
import type { OutreachRouteContext } from './outreach-routes/types.js';
import { handleTwilioCallbackRoutes } from './outreach-routes/twilio-callback-handlers.js';
import { handlePreferenceRoutes, handleTriggerRoutes } from './outreach-routes/preferences-handlers.js';
import { handlePendingRoutes } from './outreach-routes/pending-handlers.js';
import {
  handleAnalyticsRoutes,
  handleRegistrationRoutes,
} from './outreach-routes/analytics-handlers.js';
import { handleContactRoutes } from './outreach-routes/contact-handlers.js';
import { handleMilestoneRoutes } from './outreach-routes/milestone-handlers.js';
import { handleOnboardingRoutes, handleSchedulerRoutes } from './outreach-routes/scheduler-handlers.js';

const log = getLogger().child({ module: 'outreach-handler' });

// Route prefix for early bailout
const OUTREACH_PREFIX = '/api/outreach';

/**
 * Check if a pathname is an outreach route
 */
function isOutreachRoute(pathname: string): boolean {
  return pathname.startsWith(OUTREACH_PREFIX);
}

/**
 * Handle outreach API routes
 * @returns true if route was handled
 */
export async function handleOutreachRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  _parsedUrl: URL
): Promise<boolean> {
  // Early bailout
  if (!isOutreachRoute(pathname)) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  const method = req.method || 'GET';
  const route = pathname.replace(OUTREACH_PREFIX, '');

  try {
    // Handle webhook routes first (webhooks have their own auth via signatures)
    if (route.startsWith('/webhooks')) {
      return handleOutreachWebhookRoutes(req, res, pathname);
    }

    // Apply rate limiting
    if (rateLimit(req, res, { maxRequests: 100, windowMs: 60000 })) {
      return true;
    }

    // =================================================================    // TWILIO WEBHOOKS (before user auth: Twilio signs requests instead)
    // ========================================================================
    const isTwilioCallback =
      method === 'POST' && (route.startsWith('/call/status/') || route.startsWith('/call/machine/'));
    let twilioParams: Record<string, string> = {};
    if (isTwilioCallback) {
      // Twilio posts application/x-www-form-urlencoded
      twilioParams = Object.fromEntries(new URLSearchParams(await parseRawBody(req, { timeoutMs: 10000, maxBytes: 64 * 1024 })));
      const signature = req.headers['x-twilio-signature'];
      if (
        typeof signature !== 'string' ||
        !validateTwilioSignature(signature, twilioSignedUrls(req.headers, req.url), twilioParams)
      ) {
        res.writeHead(403);
        res.end('Forbidden');
        return true;
      }
    }

    if (await handleTwilioCallbackRoutes({ res, method, route, twilioParams })) return true;

    // Scheduler runs (/daily-job, /scheduler/daily) are allowed for Cloud
    // Scheduler's signed OIDC token or an admin. The token isn't a user
    // login, so check it before requireAuth. These routes used to trust
    // headers any logged-in user could set (X-CloudScheduler, or anything
    // containing "Cloud-Scheduler") and would run a real send for everyone.
    let fromScheduler = false;
    if (method === 'POST' && (route === '/daily-job' || route === '/scheduler/daily')) {
      const caller = await verifySchedulerRequest(req, pathname);
      fromScheduler = caller.ok;
      if (!caller.ok) log.info({ route, reason: caller.reason }, 'not a scheduler token');
    }

    // Require authentication for all non-webhook routes
    const auth: AuthContext | null = fromScheduler
      ? { userId: 'cloud-scheduler', isAdmin: false, isDevMode: false, authMethod: 'api_key' }
      : await requireAuth(req, res, { allowDevMode: true });
    if (!auth) {
      return true; // 401 already sent
    }

    // Use authenticated userId (ignore query param to prevent user enumeration)
    const authenticatedUserId = auth.userId;

    // Sub-handlers (outreach-routes/*) each return true once they handle the route
    const ctx: OutreachRouteContext = {
      req,
      res,
      pathname,
      method,
      route,
      auth,
      authenticatedUserId,
      fromScheduler,
    };

    if (await handlePreferenceRoutes(ctx)) return true;
    if (await handleTriggerRoutes(ctx)) return true;
    if (await handlePendingRoutes(ctx)) return true;
    if (await handleAnalyticsRoutes(ctx)) return true;
    if (await handleRegistrationRoutes(ctx)) return true;
    if (await handleContactRoutes(ctx)) return true;
    if (await handleMilestoneRoutes(ctx)) return true;
    if (await handleSchedulerRoutes(ctx)) return true;
    if (await handleOnboardingRoutes(ctx)) return true;

    // Not found in outreach routes
    sendJsonResponse(res, 404, { success: false, error: 'Outreach endpoint not found' });
    return true;
  } catch (error) {
    log.error({ error, pathname }, 'Outreach route error');
    sendJsonResponse(res, 500, { success: false, error: 'Internal server error' });
    return true;
  }
}

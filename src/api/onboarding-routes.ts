/**
 * Onboarding API Routes
 *
 * Endpoints for onboarding arc progress and check-in management.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { requireAuth, rateLimit } from './auth-middleware.js';
import { handleCorsPreflightIfNeeded, sendJSON, sendError } from './helpers.js';
import { createLogger } from '../utils/safe-logger.js';
import {
  getOnboardingProgress,
  getOnboardingState,
  initializeOnboarding,
  recordConversation,
  recordCheckInResponse,
  isInOnboardingPeriod,
} from '../services/outreach/onboarding-checkin-arc.js';

const log = createLogger({ module: 'OnboardingRoutes' });

/**
 * Handle onboarding-related routes
 */
export async function handleOnboardingRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Only handle our routes
  if (!pathname.startsWith('/api/onboarding')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Rate limiting
  if (rateLimit(req, res, { maxRequests: 100, windowMs: 60000 })) {
    return true;
  }

  // Authentication
  const auth = await requireAuth(req, res);
  if (!auth) return true;

  try {
    // GET /api/onboarding/progress - Get onboarding progress
    if (pathname === '/api/onboarding/progress' && req.method === 'GET') {
      const progress = getOnboardingProgress(auth.userId);

      if (!progress) {
        // User not in onboarding, might need to initialize
        if (!getOnboardingState(auth.userId)) {
          sendError(res, 'Not in onboarding period', 404);
          return true;
        }
      }

      sendJSON(
        res,
        progress || {
          arcComplete: true,
          daysSinceSignup: 0,
          milestonesReached: 0,
          checkInsSent: 0,
          engagementLevel: 'high',
        }
      );
      return true;
    }

    // GET /api/onboarding/state - Get full onboarding state
    if (pathname === '/api/onboarding/state' && req.method === 'GET') {
      const state = getOnboardingState(auth.userId);

      if (!state) {
        sendError(res, 'Not in onboarding period', 404);
        return true;
      }

      // Return sanitized state (exclude internal fields)
      sendJSON(res, {
        daysSinceSignup: state.daysSinceSignup,
        signupDate: state.signupDate,
        milestonesReached: state.milestonesReached,
        conversationCount: state.conversationCount,
        engagementLevel: state.engagementLevel,
        checkInsSent: state.checkInsSent.length,
        arcComplete: state.arcComplete,
        primaryConcern: state.primaryConcern,
        preferredPersona: state.preferredPersona,
      });
      return true;
    }

    // POST /api/onboarding/initialize - Initialize onboarding for new user
    if (pathname === '/api/onboarding/initialize' && req.method === 'POST') {
      // Check if already initialized
      if (getOnboardingState(auth.userId)) {
        sendJSON(res, { initialized: false, reason: 'Already in onboarding' });
        return true;
      }

      const state = initializeOnboarding(auth.userId);
      log.info({ userId: auth.userId }, 'Onboarding initialized via API');

      sendJSON(
        res,
        {
          initialized: true,
          daysSinceSignup: state.daysSinceSignup,
          engagementLevel: state.engagementLevel,
        },
        201
      );
      return true;
    }

    // POST /api/onboarding/record-conversation - Record a conversation
    if (pathname === '/api/onboarding/record-conversation' && req.method === 'POST') {
      if (!isInOnboardingPeriod(auth.userId)) {
        sendJSON(res, { recorded: false, reason: 'Not in onboarding period' });
        return true;
      }

      // Parse body for context
      let context: { primaryConcern?: string; persona?: string } = {};
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk as Buffer);
        }
        const body = Buffer.concat(chunks).toString();
        if (body) {
          context = JSON.parse(body) as { primaryConcern?: string; persona?: string };
        }
      } catch {
        // Body parsing failed, continue without context
      }

      recordConversation(auth.userId, context);

      const progress = getOnboardingProgress(auth.userId);
      sendJSON(res, { recorded: true, progress });
      return true;
    }

    // POST /api/onboarding/record-response - Record check-in response
    if (pathname === '/api/onboarding/record-response' && req.method === 'POST') {
      if (!isInOnboardingPeriod(auth.userId)) {
        sendJSON(res, { recorded: false, reason: 'Not in onboarding period' });
        return true;
      }

      recordCheckInResponse(auth.userId);

      sendJSON(res, { recorded: true });
      return true;
    }

    // GET /api/onboarding/is-active - Check if user is in onboarding
    if (pathname === '/api/onboarding/is-active' && req.method === 'GET') {
      const isActive = isInOnboardingPeriod(auth.userId);
      sendJSON(res, { isActive });
      return true;
    }

    // Unknown route
    sendError(res, 'Not found', 404);
    return true;
  } catch (err) {
    log.error({ error: err, userId: auth.userId }, 'Onboarding route error');
    sendError(res, 'Internal error', 500);
    return true;
  }
}

export default handleOnboardingRoutes;

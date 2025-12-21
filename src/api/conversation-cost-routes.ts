/**
 * Conversation Cost API Routes
 *
 * User-facing endpoints for cost transparency feature ("Tip Jar").
 * Allows users to see what their conversation cost and optionally contribute.
 *
 * @module api/conversation-cost-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { z } from 'zod';
import { createLogger } from '../utils/safe-logger.js';
import { finops } from '../services/observability/finops.js';
import { handleCorsPreflightIfNeeded, sendJSON, sendError } from './helpers.js';

const log = createLogger({ module: 'ConversationCostRoutes' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * User-friendly cost breakdown for display
 */
interface ConversationCostResponse {
  sessionId: string | null;
  totalCost: number;
  formattedCost: string;
  durationMinutes: number;
  breakdown: {
    llm: number;
    tts: number;
    stt: number;
    livekit: number;
    infrastructure: number;
  };
  /** Suggested tip amounts based on cost */
  suggestedTips: {
    small: number; // Cost + 50%
    medium: number; // Cost x 2
    large: number; // Cost x 5 (generous)
  };
  /** Friendly message about the cost */
  message: string;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Extract user ID from request headers or query params.
 * Supports Firebase UID, X-User-Id header, or query param.
 */
function extractUserId(req: IncomingMessage, query: URLSearchParams): string | null {
  // Try Authorization header (Firebase token - would need to decode)
  // For now, use simpler X-User-Id header or query param
  const headerUserId = req.headers['x-user-id'] as string | undefined;
  const queryUserId = query.get('userId') || query.get('user_id');

  return headerUserId || queryUserId || null;
}

/**
 * Generate a friendly message about the conversation cost.
 * This is the "true cost" including AI, cloud, and operating costs.
 */
function generateCostMessage(cost: number, durationMinutes: number): string {
  const mins = Math.round(durationMinutes);

  if (cost < 0.01) {
    return `This ${mins}-minute chat cost just a fraction of a cent to run.`;
  }
  if (cost < 0.05) {
    return `This ${mins}-minute conversation cost about ${(cost * 100).toFixed(1)}¢ (AI + cloud + operations).`;
  }
  if (cost < 0.25) {
    return `Our ${mins}-minute chat cost about ${(cost * 100).toFixed(0)}¢ to run (AI, cloud, and keeping the lights on).`;
  }
  return `This ${mins}-minute conversation cost about $${cost.toFixed(2)} to run (AI services, cloud infrastructure, and operations).`;
}

/**
 * Calculate suggested tip amounts based on actual cost.
 */
function calculateSuggestedTips(cost: number): ConversationCostResponse['suggestedTips'] {
  // Minimum tips to make payment processing worthwhile
  const minTip = 0.5;

  return {
    small: Math.max(minTip, Math.ceil(cost * 1.5 * 100) / 100), // Cost + 50%, rounded up
    medium: Math.max(minTip, Math.ceil(cost * 2 * 100) / 100), // Cost x 2
    large: Math.max(1.0, Math.ceil(cost * 5 * 100) / 100), // Cost x 5 (generous)
  };
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

/**
 * Handle conversation cost API routes.
 * Returns true if route was handled.
 *
 * @example
 * GET /api/conversation/cost - Get cost for current/recent conversation
 * GET /api/conversation/cost?sessionId=xxx - Get cost for specific session
 */
export async function handleConversationCostRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // Only handle /api/conversation/cost routes
  if (!pathname.startsWith('/api/conversation/cost')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  const query = parsedUrl.searchParams;

  try {
    // GET /api/conversation/cost
    if (pathname === '/api/conversation/cost' && req.method === 'GET') {
      const userId = extractUserId(req, query);
      const sessionId = query.get('sessionId') || query.get('session_id');

      // Try to find the session cost
      let sessionCost;

      if (sessionId) {
        // Get specific session
        sessionCost = finops.getSessionCost(sessionId);
      } else if (userId) {
        // Get most recent session for user
        sessionCost = finops.getSessionCostByUserId(userId);
      }

      if (!sessionCost) {
        // No session found - return zero cost (user might be checking before conversation)
        sendJSON(res, {
          sessionId: null,
          totalCost: 0,
          formattedCost: '$0.00',
          durationMinutes: 0,
          breakdown: { llm: 0, tts: 0, stt: 0, livekit: 0, infrastructure: 0 },
          suggestedTips: { small: 0.5, medium: 1.0, large: 2.0 },
          message: 'No conversation cost data available yet.',
        } as ConversationCostResponse);
        return true;
      }

      // Use trueCost (includes operating overhead) for user-facing display
      // Fall back to totalCost * 2.5 if trueCost not yet calculated (session still active)
      const displayCost =
        sessionCost.trueCost > 0 ? sessionCost.trueCost : sessionCost.totalCost * 2.5; // Approximate true cost for active sessions

      // Build response
      const response: ConversationCostResponse = {
        sessionId: sessionCost.sessionId,
        totalCost: Math.round(displayCost * 10000) / 10000, // Round to 4 decimal places
        formattedCost:
          displayCost < 0.01 ? `${(displayCost * 100).toFixed(2)}¢` : `$${displayCost.toFixed(2)}`,
        durationMinutes: Math.round(sessionCost.durationMinutes * 10) / 10,
        breakdown: {
          llm: Math.round(sessionCost.costs.llm * 10000) / 10000,
          tts: Math.round(sessionCost.costs.tts * 10000) / 10000,
          stt: Math.round(sessionCost.costs.stt * 10000) / 10000,
          livekit: Math.round(sessionCost.costs.livekit * 10000) / 10000,
          infrastructure: Math.round(sessionCost.costs.infra * 10000) / 10000,
        },
        suggestedTips: calculateSuggestedTips(displayCost),
        message: generateCostMessage(displayCost, sessionCost.durationMinutes),
      };

      log.debug(
        { sessionId: sessionCost.sessionId, apiCost: sessionCost.totalCost, trueCost: displayCost },
        'Cost fetched'
      );
      sendJSON(res, response);
      return true;
    }

    // Route not found
    return false;
  } catch (error) {
    log.error({ error, pathname }, 'Conversation cost route error');
    sendError(res, 'Internal server error', 500);
    return true;
  }
}

export default handleConversationCostRoutes;

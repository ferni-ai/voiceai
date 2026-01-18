/**
 * Action Routes - API for Autonomous Action Approval/Rejection
 *
 * Handles the approval workflow for actions Ferni wants to take on behalf of users.
 * Part of the AGI-like capability - users can approve/reject proposed actions.
 *
 * @module api/action-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import { handleCorsPreflightIfNeeded, parseRequestBody, sendJsonResponse } from './helpers.js';
import { requireAuth, rateLimit } from './auth-middleware.js';
import {
  checkActionPermission,
  getPendingActions,
  resolvePendingAction,
  markActionExecuted,
  getAllTrustProfiles,
  ACTION_TYPES,
  type ActionPreview,
} from '../services/automation/trust-level-system.js';

const log = createLogger({ module: 'ActionRoutes' });

const ACTIONS_PREFIX = '/api/actions';

/**
 * Check if a pathname is an action route
 */
function isActionRoute(pathname: string): boolean {
  return pathname.startsWith(ACTIONS_PREFIX);
}

/**
 * Handle action API routes
 */
export async function handleActionRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  if (!isActionRoute(pathname)) {
    return false;
  }

  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  const method = req.method || 'GET';
  const route = pathname.replace(ACTIONS_PREFIX, '');

  // Apply rate limiting
  if (rateLimit(req, res, { maxRequests: 100, windowMs: 60000 })) {
    return true;
  }

  // Require authentication
  const auth = await requireAuth(req, res, { allowDevMode: true });
  if (!auth) {
    return true;
  }

  const { userId } = auth;

  try {
    // ========================================================================
    // GET /api/actions/pending
    // Get all pending actions for the user
    // ========================================================================
    if (route === '/pending' && method === 'GET') {
      const actions = await getPendingActions(userId);

      sendJsonResponse(res, 200, {
        success: true,
        actions,
        count: actions.length,
      });
      return true;
    }

    // ========================================================================
    // GET /api/actions/trust-profiles
    // Get user's trust profiles for all action types
    // ========================================================================
    if (route === '/trust-profiles' && method === 'GET') {
      const profiles = await getAllTrustProfiles(userId);

      sendJsonResponse(res, 200, {
        success: true,
        profiles,
        actionTypes: Object.keys(ACTION_TYPES),
      });
      return true;
    }

    // ========================================================================
    // POST /api/actions/approve
    // Approve a pending action
    // ========================================================================
    if (route === '/approve' && method === 'POST') {
      const body = await parseRequestBody(req);
      const { actionId } = body as { actionId: string };

      if (!actionId) {
        sendJsonResponse(res, 400, { success: false, error: 'actionId required' });
        return true;
      }

      const result = await resolvePendingAction(userId, actionId, true);

      if (!result) {
        sendJsonResponse(res, 404, { success: false, error: 'Action not found' });
        return true;
      }

      log.info({ userId, actionId }, 'Action approved');

      sendJsonResponse(res, 200, {
        success: true,
        action: result,
        message: 'Action approved and will be executed',
      });
      return true;
    }

    // ========================================================================
    // POST /api/actions/reject
    // Reject a pending action
    // ========================================================================
    if (route === '/reject' && method === 'POST') {
      const body = await parseRequestBody(req);
      const { actionId } = body as { actionId: string };

      if (!actionId) {
        sendJsonResponse(res, 400, { success: false, error: 'actionId required' });
        return true;
      }

      const result = await resolvePendingAction(userId, actionId, false);

      if (!result) {
        sendJsonResponse(res, 404, { success: false, error: 'Action not found' });
        return true;
      }

      log.info({ userId, actionId }, 'Action rejected');

      sendJsonResponse(res, 200, {
        success: true,
        action: result,
        message: 'Action rejected',
      });
      return true;
    }

    // ========================================================================
    // POST /api/actions/check
    // Check if an action can be executed (for LLM to call before taking action)
    // ========================================================================
    if (route === '/check' && method === 'POST') {
      const body = await parseRequestBody(req);
      const { actionType, preview } = body as {
        actionType: string;
        preview: ActionPreview;
      };

      if (!actionType || !preview) {
        sendJsonResponse(res, 400, {
          success: false,
          error: 'actionType and preview required',
        });
        return true;
      }

      const result = await checkActionPermission(userId, actionType, preview);

      log.info(
        {
          userId,
          actionType,
          requiresApproval: result.requiresApproval,
        },
        'Action permission checked'
      );

      sendJsonResponse(res, 200, result);
      return true;
    }

    // ========================================================================
    // POST /api/actions/execute
    // Mark an action as executed (after actual execution)
    // ========================================================================
    if (route === '/execute' && method === 'POST') {
      const body = await parseRequestBody(req);
      const { actionId } = body as { actionId: string };

      if (!actionId) {
        sendJsonResponse(res, 400, { success: false, error: 'actionId required' });
        return true;
      }

      await markActionExecuted(userId, actionId);

      log.info({ userId, actionId }, 'Action marked as executed');

      sendJsonResponse(res, 200, {
        success: true,
        message: 'Action marked as executed',
      });
      return true;
    }

    // ========================================================================
    // GET /api/actions/types
    // Get all available action types
    // ========================================================================
    if (route === '/types' && method === 'GET') {
      sendJsonResponse(res, 200, {
        success: true,
        actionTypes: ACTION_TYPES,
      });
      return true;
    }

    // Route not matched
    return false;
  } catch (error) {
    log.error({ error: String(error), route }, 'Action route error');
    sendJsonResponse(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
    return true;
  }
}

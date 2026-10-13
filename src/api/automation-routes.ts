/**
 * Automation Routes - API for Autonomous Actions
 *
 * Provides HTTP endpoints for:
 * - Undoing a calendar event created on the member's behalf
 * - Viewing audit log of all autonomous actions
 * - Managing message history
 *
 * These work with the trust-level-system to respect user approval preferences.
 *
 * @module api/automation-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import { handleCorsPreflightIfNeeded, parseRequestBody, sendJsonResponse } from './helpers.js';
import { requireAuth, rateLimit } from './auth-middleware.js';

const log = createLogger({ module: 'AutomationRoutes' });

const PREFIX = '/api/automation';

/**
 * Check if a pathname is an automation route
 */
function isAutomationRoute(pathname: string): boolean {
  return pathname.startsWith(PREFIX);
}

/**
 * Handle automation API routes
 */
export async function handleAutomationRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  if (!isAutomationRoute(pathname)) {
    return false;
  }

  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  const method = req.method || 'GET';
  const route = pathname.replace(PREFIX, '');

  // Apply rate limiting
  if (rateLimit(req, res, { maxRequests: 60, windowMs: 60000 })) {
    return true;
  }

  // Require authentication
  const auth = await requireAuth(req, res, { allowDevMode: true });
  if (!auth) {
    return true;
  }

  const { userId } = auth;

  try {
    // Sending a text or email, and creating a calendar event, for the member
    // used to be open here (POST /send-message[/execute], /create-event[/execute]):
    // any signed-in account could relay a message to any number or address.
    // Nothing called them; they are gone. Approvals run through action-routes.ts.

    // GET /api/automation/message-history
    // Get user's message history
    if (route === '/message-history' && method === 'GET') {
      const { getMessageHistory } = await import('../services/automation/send-on-behalf.js');

      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);

      const history = await getMessageHistory(userId, Math.min(limit, 200));

      sendJsonResponse(res, 200, {
        success: true,
        messages: history,
        count: history.length,
      });
      return true;
    }

    // DELETE /api/automation/event/:eventId
    // Delete/undo an event (for undo functionality)
    const deleteEventMatch = route.match(/^\/event\/([^/]+)$/);
    if (deleteEventMatch && method === 'DELETE') {
      const { deleteEvent } = await import('../services/automation/calendar-on-behalf.js');

      const eventId = deleteEventMatch[1];
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const calendarId = url.searchParams.get('calendarId') || 'primary';

      const result = await deleteEvent(userId, eventId, calendarId);

      log.info({ userId, eventId, success: result.success }, 'Event deleted');

      sendJsonResponse(res, result.success ? 200 : 400, result);
      return true;
    }

    // ========================================================================
    // AUDIT LOG
    // ========================================================================

    // GET /api/automation/audit-log
    // Query audit log
    if (route === '/audit-log' && method === 'GET') {
      const { queryAuditLog } = await import('../services/automation/audit-log.js');

      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const category = url.searchParams.get('category') as
        | 'messaging'
        | 'calendar'
        | 'booking'
        | null;
      const status = url.searchParams.get('status');
      const actionType = url.searchParams.get('actionType');
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);
      const offset = parseInt(url.searchParams.get('offset') || '0', 10);

      const entries = await queryAuditLog({
        userId,
        category: category || undefined,
        status: status as 'pending' | 'executed' | undefined,
        actionType: actionType || undefined,
        limit: Math.min(limit, 200),
        offset,
      });

      sendJsonResponse(res, 200, {
        success: true,
        entries,
        count: entries.length,
        hasMore: entries.length === limit,
      });
      return true;
    }

    // GET /api/automation/audit-log/summary
    // Get audit summary
    if (route === '/audit-log/summary' && method === 'GET') {
      const { getAuditSummary } = await import('../services/automation/audit-log.js');

      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const days = parseInt(url.searchParams.get('days') || '30', 10);

      const summary = await getAuditSummary(userId, Math.min(days, 365));

      sendJsonResponse(res, 200, {
        success: true,
        summary,
      });
      return true;
    }

    // GET /api/automation/audit-log/undoable
    // Get actions that can be undone
    if (route === '/audit-log/undoable' && method === 'GET') {
      const { getUndoableActions } = await import('../services/automation/audit-log.js');

      const actions = await getUndoableActions(userId);

      sendJsonResponse(res, 200, {
        success: true,
        actions,
        count: actions.length,
      });
      return true;
    }

    // POST /api/automation/audit-log/:id/undo
    // Undo an action
    const undoMatch = route.match(/^\/audit-log\/([^/]+)\/undo$/);
    if (undoMatch && method === 'POST') {
      const { markUndone } = await import('../services/automation/audit-log.js');

      const auditId = undoMatch[1];
      const body = await parseRequestBody(req);
      const { reason } = body as { reason?: string };

      await markUndone(userId, auditId, reason);

      log.info({ userId, auditId, reason }, 'Action marked as undone');

      sendJsonResponse(res, 200, {
        success: true,
        message: 'Action marked as undone',
      });
      return true;
    }

    // ========================================================================
    // PATTERN REINFORCEMENT
    // ========================================================================

    // GET /api/automation/patterns
    // Get pattern summary for a user (behavioral patterns detected over time)
    if (route === '/patterns' && method === 'GET') {
      const { getPatternSummary } = await import('../services/automation/pattern-reinforcement.js');

      const summary = await getPatternSummary(userId);

      sendJsonResponse(res, 200, {
        success: true,
        ...summary,
      });
      return true;
    }

    // GET /api/automation/patterns/reinforcements
    // Get pending reinforcement messages ready for delivery
    if (route === '/patterns/reinforcements' && method === 'GET') {
      const { processReinforcementOpportunities } =
        await import('../services/automation/pattern-reinforcement.js');

      const messages = await processReinforcementOpportunities(userId);

      sendJsonResponse(res, 200, {
        success: true,
        messages,
        count: messages.length,
      });
      return true;
    }

    // POST /api/automation/patterns/reinforcements/:id/deliver
    // Mark a reinforcement message as delivered
    const deliverMatch = route.match(/^\/patterns\/reinforcements\/([^/]+)\/deliver$/);
    if (deliverMatch && method === 'POST') {
      const { deliverReinforcement, processReinforcementOpportunities } =
        await import('../services/automation/pattern-reinforcement.js');

      const messageId = deliverMatch[1];

      // First, get the reinforcement messages to find the one being delivered
      const messages = await processReinforcementOpportunities(userId);
      const message = messages.find((m) => m.patternId === messageId);

      if (!message) {
        sendJsonResponse(res, 404, {
          success: false,
          error: 'Reinforcement message not found',
        });
        return true;
      }

      await deliverReinforcement(message);

      log.info({ userId, messageId }, 'Reinforcement delivered');

      sendJsonResponse(res, 200, {
        success: true,
        message: 'Reinforcement marked as delivered',
      });
      return true;
    }

    // POST /api/automation/patterns/reinforcements/:id/feedback
    // Record user reaction to a reinforcement
    const feedbackMatch = route.match(/^\/patterns\/reinforcements\/([^/]+)\/feedback$/);
    if (feedbackMatch && method === 'POST') {
      const { recordReinforcementReaction } =
        await import('../services/automation/pattern-reinforcement.js');

      const messageId = feedbackMatch[1];
      const body = await parseRequestBody(req);
      const { reaction } = body as {
        reaction: 'acknowledged' | 'dismissed' | 'engaged' | 'emotional';
      };

      if (!reaction) {
        sendJsonResponse(res, 400, {
          success: false,
          error: 'reaction is required (acknowledged, dismissed, engaged, or emotional)',
        });
        return true;
      }

      await recordReinforcementReaction(userId, messageId, reaction);

      log.info({ userId, messageId, reaction }, 'Reinforcement feedback recorded');

      sendJsonResponse(res, 200, {
        success: true,
        message: 'Feedback recorded',
      });
      return true;
    }

    // Route not matched
    return false;
  } catch (error) {
    log.error({ error: String(error), route }, 'Automation route error');
    sendJsonResponse(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
    return true;
  }
}

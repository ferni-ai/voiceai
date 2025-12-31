/**
 * Concierge API Routes
 *
 * Handles API endpoints for the AI Concierge feature:
 * - Status queries for user requests
 * - Webhook handlers for outreach callbacks
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import { requireAuth, rateLimit } from './auth-middleware.js';
import { handleCorsPreflightIfNeeded, parseBody, sendJSON, sendError } from './helpers.js';
import { getTaskTracker } from '../services/concierge/index.js';

const log = createLogger({ module: 'concierge-routes' });

// ============================================================================
// TYPES
// ============================================================================

interface WebhookPayload {
  requestId?: string;
  targetId?: string;
  status?: string;
  callSid?: string;
  messageSid?: string;
  from?: string;
  body?: string;
  [key: string]: unknown;
}

// ============================================================================
// MAIN ROUTER
// ============================================================================

export async function handleConciergeRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Only handle concierge routes
  if (!pathname.startsWith('/api/concierge')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  try {
    // Webhook endpoints (no auth, but verify signature)
    if (pathname.startsWith('/api/concierge/webhooks/')) {
      return await handleWebhooks(req, res, pathname);
    }

    // Rate limiting for non-webhook routes
    if (rateLimit(req, res, { maxRequests: 100, windowMs: 60000 })) {
      return true;
    }

    // Authentication required for user endpoints
    const auth = await requireAuth(req, res);
    if (!auth) return true;

    // GET /api/concierge/requests - List user's requests
    if (pathname === '/api/concierge/requests' && req.method === 'GET') {
      return await handleListRequests(req, res, auth.userId);
    }

    // GET /api/concierge/requests/:id - Get specific request
    const requestMatch = pathname.match(/^\/api\/concierge\/requests\/([^/]+)$/);
    if (requestMatch && req.method === 'GET') {
      return await handleGetRequest(req, res, auth.userId, requestMatch[1]);
    }

    // POST /api/concierge/requests/:id/cancel - Cancel a request
    const cancelMatch = pathname.match(/^\/api\/concierge\/requests\/([^/]+)\/cancel$/);
    if (cancelMatch && req.method === 'POST') {
      return await handleCancelRequest(req, res, auth.userId, cancelMatch[1]);
    }

    // Not found
    sendError(res, 'Not found', 404);
    return true;
  } catch (error) {
    log.error({ error: String(error), pathname }, 'Concierge route error');
    sendError(res, 'Internal error', 500);
    return true;
  }
}

// ============================================================================
// USER ENDPOINTS
// ============================================================================

async function handleListRequests(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<boolean> {
  try {
    const tracker = getTaskTracker();
    const requests = await tracker.getUserRequests(userId);

    // Map to API response format
    const response = requests.map((req) => ({
      id: req.id,
      domain: req.domain,
      type: req.type,
      description: req.description,
      status: req.status,
      statusMessage: req.statusMessage,
      targetCount: req.targets.length,
      completedCount: req.results.length,
      createdAt: req.createdAt,
      updatedAt: req.updatedAt,
      hasRecommendation: !!req.recommendation,
    }));

    sendJSON(res, { requests: response });
    return true;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to list requests');
    sendError(res, 'Failed to list requests', 500);
    return true;
  }
}

async function handleGetRequest(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  requestId: string
): Promise<boolean> {
  try {
    const tracker = getTaskTracker();
    const request = await tracker.getRequest(requestId);

    if (!request) {
      sendError(res, 'Request not found', 404);
      return true;
    }

    // Verify user owns this request
    if (request.userId !== userId) {
      sendError(res, 'Not authorized', 403);
      return true;
    }

    // Return full request with details
    sendJSON(res, {
      request: {
        id: request.id,
        domain: request.domain,
        type: request.type,
        description: request.description,
        status: request.status,
        statusMessage: request.statusMessage,
        requirements: request.requirements,
        targets: request.targets.map((t) => ({
          id: t.id,
          name: t.name,
          status: t.status,
          attempts: t.attempts,
          lastAttemptAt: t.lastAttemptAt,
        })),
        results: request.results,
        recommendation: request.recommendation,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt,
        completedAt: request.completedAt,
      },
    });
    return true;
  } catch (error) {
    log.error({ error: String(error), userId, requestId }, 'Failed to get request');
    sendError(res, 'Failed to get request', 500);
    return true;
  }
}

async function handleCancelRequest(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  requestId: string
): Promise<boolean> {
  try {
    const tracker = getTaskTracker();
    const request = await tracker.getRequest(requestId);

    if (!request) {
      sendError(res, 'Request not found', 404);
      return true;
    }

    // Verify user owns this request
    if (request.userId !== userId) {
      sendError(res, 'Not authorized', 403);
      return true;
    }

    // Check if cancellable
    if (request.status === 'completed' || request.status === 'cancelled') {
      sendError(res, 'Request already finished', 400);
      return true;
    }

    // Cancel the request
    await tracker.updateStatus(requestId, 'cancelled', 'Cancelled by user');

    sendJSON(res, { success: true, message: 'Request cancelled' });
    return true;
  } catch (error) {
    log.error({ error: String(error), userId, requestId }, 'Failed to cancel request');
    sendError(res, 'Failed to cancel request', 500);
    return true;
  }
}

// ============================================================================
// WEBHOOK HANDLERS
// ============================================================================

async function handleWebhooks(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Parse webhook body
  const body = await parseBody<WebhookPayload>(req);

  // POST /api/concierge/webhooks/call-status - Twilio call status
  if (pathname === '/api/concierge/webhooks/call-status' && req.method === 'POST') {
    return handleCallStatusWebhook(res, body);
  }

  // POST /api/concierge/webhooks/sms-reply - Inbound SMS from business
  if (pathname === '/api/concierge/webhooks/sms-reply' && req.method === 'POST') {
    return handleSmsReplyWebhook(res, body);
  }

  // POST /api/concierge/webhooks/email-reply - Email response from business
  if (pathname === '/api/concierge/webhooks/email-reply' && req.method === 'POST') {
    return handleEmailReplyWebhook(res, body);
  }

  sendError(res, 'Unknown webhook endpoint', 404);
  return true;
}

async function handleCallStatusWebhook(
  res: ServerResponse,
  body: WebhookPayload
): Promise<boolean> {
  const { requestId, targetId, status, callSid } = body;

  log.info({ requestId, targetId, status, callSid }, 'Call status webhook received');

  if (!requestId || !targetId) {
    log.warn({ body }, 'Missing required fields in call status webhook');
    sendJSON(res, { received: true, warning: 'Missing fields' });
    return true;
  }

  try {
    const tracker = getTaskTracker();

    // Map Twilio status to our target status
    let targetStatus: 'completed' | 'no_answer' | 'failed' | 'calling' = 'calling';
    if (status === 'completed') {
      targetStatus = 'completed';
    } else if (status === 'no-answer' || status === 'busy') {
      targetStatus = 'no_answer';
    } else if (status === 'failed' || status === 'canceled') {
      targetStatus = 'failed';
    }

    await tracker.updateTargetStatus(requestId, targetId, targetStatus);

    sendJSON(res, { received: true });
    return true;
  } catch (error) {
    log.error({ error: String(error), requestId, targetId }, 'Failed to process call status');
    sendJSON(res, { received: true, error: 'Processing failed' });
    return true;
  }
}

async function handleSmsReplyWebhook(res: ServerResponse, body: WebhookPayload): Promise<boolean> {
  const { from, body: messageBody } = body;

  log.info({ from, bodyLength: messageBody?.length }, 'SMS reply webhook received');

  if (!from) {
    sendJSON(res, { received: true, error: 'Missing sender phone number' });
    return true;
  }

  try {
    // Match phone number to active request target
    const tracker = getTaskTracker();
    const match = await tracker.findRequestByTargetPhone(from);

    if (match) {
      const { request, target } = match;
      log.info(
        { from, requestId: request.id, targetId: target.id, targetName: target.name },
        'SMS reply matched to concierge request'
      );

      // Add result to the request
      await tracker.addResult(request.id, {
        requestId: request.id,
        targetId: target.id,
        channel: 'sms',
        attemptNumber: target.attempts + 1,
        success: true,
        summary: `SMS reply from ${target.name}`,
        data: {
          messageBody: messageBody?.substring(0, 500), // Limit size
          notes: 'Business replied via SMS',
        },
        timestamp: new Date(),
      });
    } else {
      log.info({ from, message: messageBody }, 'SMS reply received - no matching request found');
    }

    sendJSON(res, { received: true, matched: !!match });
    return true;
  } catch (error) {
    log.error({ error: String(error), from }, 'Failed to process SMS reply');
    sendJSON(res, { received: true, error: 'Processing failed' });
    return true;
  }
}

async function handleEmailReplyWebhook(
  res: ServerResponse,
  body: WebhookPayload
): Promise<boolean> {
  const { from, body: emailBody } = body;

  log.info({ from, bodyLength: emailBody?.length }, 'Email reply webhook received');

  if (!from) {
    sendJSON(res, { received: true, error: 'Missing sender email address' });
    return true;
  }

  try {
    // Match email address to active request target
    const tracker = getTaskTracker();
    const match = await tracker.findRequestByTargetEmail(from);

    if (match) {
      const { request, target } = match;
      log.info(
        { from, requestId: request.id, targetId: target.id, targetName: target.name },
        'Email reply matched to concierge request'
      );

      // Add result to the request
      await tracker.addResult(request.id, {
        requestId: request.id,
        targetId: target.id,
        channel: 'email',
        attemptNumber: target.attempts + 1,
        success: true,
        summary: `Email reply from ${target.name}`,
        data: {
          emailBody: emailBody?.substring(0, 2000), // Limit size
          notes: 'Business replied via email',
        },
        timestamp: new Date(),
        emailThreadId: `email_${Date.now()}`,
      });
    } else {
      log.info({ from }, 'Email reply received - no matching request found');
    }

    sendJSON(res, { received: true, matched: !!match });
    return true;
  } catch (error) {
    log.error({ error: String(error), from }, 'Failed to process email reply');
    sendJSON(res, { received: true, error: 'Processing failed' });
    return true;
  }
}

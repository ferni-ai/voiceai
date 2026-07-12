/**
 * Webhook API Routes
 *
 * CRUD operations for webhooks and Siri tokens.
 * Incoming webhook endpoint for Siri Shortcuts and external triggers.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  createSiriToken,
  createWebhook,
  deleteSiriToken,
  deleteWebhook,
  executeWebhook,
  getWebhook,
  listSiriTokens,
  listWebhooks,
  testWebhook,
  updateWebhook,
  validateSiriToken,
  validateWebhookInput,
  type WebhookPlatform,
} from '../../../services/webhooks/index.js';
import { requireAuth } from '../../../api/auth-middleware.js';
import { setCorsHeaders, handleCorsPreflightRequest } from '../../shared/cors.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { handleTwilioCallStatus } from './twilio-call-status.js';

const log = createLogger({ module: 'webhook-routes' });

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Parse JSON body from request
 */
async function parseBody<T>(req: IncomingMessage): Promise<T | null> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body) as T);
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => {
      resolve(null);
    });
  });
}

/**
 * Send JSON response
 */
function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * Send error response
 */
function sendError(res: ServerResponse, statusCode: number, message: string): void {
  sendJson(res, statusCode, { error: message });
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

/**
 * Handle webhook API routes
 */
export async function handleWebhookRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  _parsedUrl: URL
): Promise<boolean> {
  // SECURITY: Use allowlisted CORS origins (never Access-Control-Allow-Origin: *)
  setCorsHeaders(req, res, {
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    headers: [
      'Content-Type',
      'Authorization',
      'X-API-Key',
      'X-Admin-Key',
      'X-Siri-Token',
      'X-Request-Id',
    ],
  });

  if (handleCorsPreflightRequest(req, res)) {
    return true;
  }

  // ============================================================================
  // TWILIO CALL STATUS WEBHOOK (for on-behalf calls)
  // POST /api/webhooks/call-status
  // ============================================================================
  if (pathname === '/api/webhooks/call-status' && req.method === 'POST') {
    log.info('Received Twilio call status webhook');
    const handled = await handleTwilioCallStatus(req, res);
    if (handled) return true;
  }

  // ============================================================================
  // INCOMING WEBHOOK (from Siri Shortcuts)
  // POST /api/webhooks/incoming/trigger
  // Auth: X-Siri-Token secret + userId lookup key (token hash binds identity).
  // Not Firebase Bearer — Shortcuts cannot send ID tokens easily.
  // ============================================================================
  if (pathname === '/api/webhooks/incoming/trigger' && req.method === 'POST') {
    const siriToken = req.headers['x-siri-token'] as string | undefined;
    const body = await parseBody<{
      webhookId?: string;
      webhookName?: string;
      userId?: string;
    }>(req);

    // userId is a lookup key for the hashed Siri token — not standalone auth
    const userId =
      (body?.userId && typeof body.userId === 'string' ? body.userId : undefined) ||
      (typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'] : undefined);

    if (!siriToken || !userId) {
      sendError(res, 401, 'Missing X-Siri-Token or userId');
      return true;
    }

    // Validate token (secret proves possession; userId scopes the lookup)
    const tokenData = await validateSiriToken(userId, siriToken);
    if (!tokenData) {
      log.warn({ userId }, 'Invalid Siri token used');
      sendError(res, 401, 'Invalid or expired token');
      return true;
    }

    // Check scope
    if (!tokenData.scopes.includes('trigger_webhook')) {
      sendError(res, 403, 'Token does not have trigger_webhook scope');
      return true;
    }

    if (!body || (!body.webhookId && !body.webhookName)) {
      sendError(res, 400, 'Request body must include webhookId or webhookName');
      return true;
    }

    // Get webhook
    let webhook;
    if (body.webhookId) {
      const result = await getWebhook(userId, body.webhookId);
      if (result.success) {
        webhook = result.data;
      }
    }

    if (!webhook) {
      sendError(res, 404, 'Webhook not found');
      return true;
    }

    // Execute
    const result = await executeWebhook(userId, webhook, 'siri');
    log.info(
      { userId, webhookId: webhook.id, success: result.success },
      'Incoming webhook triggered via Siri'
    );

    sendJson(res, result.success ? 200 : 500, result);
    return true;
  }

  // Only handle remaining /api/webhooks* CRUD after this point
  if (!pathname.startsWith('/api/webhooks')) {
    return false;
  }

  // All other routes require Firebase/API-key authentication
  const auth = await requireAuth(req, res);
  if (!auth) return true;
  const userId = auth.userId;

  // ============================================================================
  // LIST WEBHOOKS
  // GET /api/webhooks
  // ============================================================================
  if (pathname === '/api/webhooks' && req.method === 'GET') {
    const result = await listWebhooks(userId);
    if (!result.success) {
      sendError(res, 500, result.error || 'Failed to list webhooks');
      return true;
    }
    sendJson(res, 200, result.data);
    return true;
  }

  // ============================================================================
  // CREATE WEBHOOK
  // POST /api/webhooks
  // ============================================================================
  if (pathname === '/api/webhooks' && req.method === 'POST') {
    const body = await parseBody<{
      name: string;
      url: string;
      method?: 'GET' | 'POST' | 'PUT';
      voiceTriggers: string[];
      platform?: string;
      cooldownSeconds?: number;
      headers?: Record<string, string>;
      payloadTemplate?: string;
    }>(req);

    if (!body) {
      sendError(res, 400, 'Invalid JSON body');
      return true;
    }

    // Validate input
    const validation = validateWebhookInput({
      name: body.name,
      url: body.url,
      voiceTriggers: body.voiceTriggers,
      payloadTemplate: body.payloadTemplate,
    });

    if (!validation.valid) {
      sendError(res, 400, validation.errors.join(', '));
      return true;
    }

    // Create webhook
    const result = await createWebhook(userId, {
      name: validation.normalized!.name,
      url: validation.normalized!.url,
      method: body.method,
      voiceTriggers: validation.normalized!.voiceTriggers,
      platform: validation.normalized!.platform,
      cooldownSeconds: body.cooldownSeconds,
      headers: body.headers,
      payloadTemplate: body.payloadTemplate,
    });

    if (!result.success) {
      sendError(res, 500, result.error || 'Failed to create webhook');
      return true;
    }

    log.info({ userId, webhookId: result.data?.id }, 'Webhook created via API');
    sendJson(res, 201, result.data);
    return true;
  }

  // ============================================================================
  // GET SINGLE WEBHOOK
  // GET /api/webhooks/:id
  // ============================================================================
  const webhookIdMatch = pathname.match(/^\/api\/webhooks\/([a-f0-9-]+)$/);
  if (webhookIdMatch && req.method === 'GET') {
    const webhookId = webhookIdMatch[1] ?? '';
    const result = await getWebhook(userId, webhookId);

    if (!result.success) {
      sendError(res, 404, 'Webhook not found');
      return true;
    }

    sendJson(res, 200, result.data);
    return true;
  }

  // ============================================================================
  // UPDATE WEBHOOK
  // PUT /api/webhooks/:id
  // ============================================================================
  if (webhookIdMatch && req.method === 'PUT') {
    const webhookId = webhookIdMatch[1] ?? '';
    const body = await parseBody<{
      name?: string;
      url?: string;
      method?: 'GET' | 'POST' | 'PUT';
      voiceTriggers?: string[];
      platform?: WebhookPlatform;
      cooldownSeconds?: number;
      headers?: Record<string, string>;
      payloadTemplate?: string;
      enabled?: boolean;
    }>(req);

    if (!body) {
      sendError(res, 400, 'Invalid JSON body');
      return true;
    }

    const result = await updateWebhook(userId, {
      id: webhookId,
      ...body,
    });

    if (!result.success) {
      sendError(
        res,
        result.error === 'Webhook not found' ? 404 : 500,
        result.error || 'Failed to update'
      );
      return true;
    }

    log.info({ userId, webhookId }, 'Webhook updated via API');
    sendJson(res, 200, result.data);
    return true;
  }

  // ============================================================================
  // DELETE WEBHOOK
  // DELETE /api/webhooks/:id
  // ============================================================================
  if (webhookIdMatch && req.method === 'DELETE') {
    const webhookId = webhookIdMatch[1] ?? '';
    const result = await deleteWebhook(userId, webhookId);

    if (!result.success) {
      sendError(
        res,
        result.error === 'Webhook not found' ? 404 : 500,
        result.error || 'Failed to delete'
      );
      return true;
    }

    log.info({ userId, webhookId }, 'Webhook deleted via API');
    sendJson(res, 200, { success: true });
    return true;
  }

  // ============================================================================
  // TEST WEBHOOK
  // POST /api/webhooks/:id/test
  // ============================================================================
  const testMatch = pathname.match(/^\/api\/webhooks\/([a-f0-9-]+)\/test$/);
  if (testMatch && req.method === 'POST') {
    const webhookId = testMatch[1] ?? '';
    const webhookResult = await getWebhook(userId, webhookId);

    if (!webhookResult.success || !webhookResult.data) {
      sendError(res, 404, 'Webhook not found');
      return true;
    }

    const result = await testWebhook(userId, webhookResult.data);
    log.info({ userId, webhookId, success: result.success }, 'Webhook tested via API');
    sendJson(res, result.success ? 200 : 500, result);
    return true;
  }

  // ============================================================================
  // LIST SIRI TOKENS
  // GET /api/webhooks/siri-tokens
  // ============================================================================
  if (pathname === '/api/webhooks/siri-tokens' && req.method === 'GET') {
    const tokens = await listSiriTokens(userId);
    sendJson(res, 200, { tokens });
    return true;
  }

  // ============================================================================
  // CREATE SIRI TOKEN
  // POST /api/webhooks/siri-tokens
  // ============================================================================
  if (pathname === '/api/webhooks/siri-tokens' && req.method === 'POST') {
    const body = await parseBody<{
      name: string;
      scopes: ('trigger_webhook' | 'send_message')[];
    }>(req);

    if (!body || !body.name || !body.scopes || body.scopes.length === 0) {
      sendError(res, 400, 'name and scopes are required');
      return true;
    }

    const result = await createSiriToken(userId, {
      name: body.name,
      scopes: body.scopes,
    });

    if (!result.success) {
      sendError(res, 500, result.error || 'Failed to create token');
      return true;
    }

    log.info({ userId, tokenId: result.data?.id }, 'Siri token created');
    sendJson(res, 201, result.data);
    return true;
  }

  // ============================================================================
  // DELETE SIRI TOKEN
  // DELETE /api/webhooks/siri-tokens/:id
  // ============================================================================
  const tokenMatch = pathname.match(/^\/api\/webhooks\/siri-tokens\/([a-f0-9-]+)$/);
  if (tokenMatch && req.method === 'DELETE') {
    const tokenId = tokenMatch[1] ?? '';
    const result = await deleteSiriToken(userId, tokenId);

    if (!result.success) {
      sendError(res, 500, result.error || 'Failed to delete token');
      return true;
    }

    log.info({ userId, tokenId }, 'Siri token deleted');
    sendJson(res, 200, { success: true });
    return true;
  }

  // Not a webhook route we handle
  return false;
}

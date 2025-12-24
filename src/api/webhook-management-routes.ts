/**
 * Webhook Management API Routes
 *
 * Admin endpoints for managing outbound webhooks and webhook logs.
 *
 * Endpoints:
 * - GET /api/admin/webhooks - List configured webhooks
 * - POST /api/admin/webhooks - Create a new webhook
 * - GET /api/admin/webhooks/:id - Get webhook details
 * - PUT /api/admin/webhooks/:id - Update a webhook
 * - DELETE /api/admin/webhooks/:id - Delete a webhook
 * - POST /api/admin/webhooks/:id/test - Test a webhook
 * - GET /api/admin/webhooks/:id/logs - Get webhook delivery logs
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import { handleCorsPreflightIfNeeded, sendJSON, sendError, parseBody } from './helpers.js';
import { requireAdmin } from './auth-middleware.js';
import crypto from 'crypto';

const log = createLogger({ module: 'WebhookManagementAPI' });

// Webhook configuration interface
interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  events: string[];
  secret: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  headers?: Record<string, string>;
  retryPolicy?: {
    maxRetries: number;
    backoffMs: number;
  };
}

// Webhook delivery log interface
interface WebhookDeliveryLog {
  id: string;
  webhookId: string;
  event: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'success' | 'failed';
  responseCode?: number;
  responseBody?: string;
  attempts: number;
  createdAt: string;
  deliveredAt?: string;
  error?: string;
}

// In-memory storage (in production, use Firestore)
const webhooks = new Map<string, WebhookConfig>();
const webhookLogs = new Map<string, WebhookDeliveryLog[]>();

interface CreateWebhookRequest {
  name: string;
  url: string;
  events: string[];
  headers?: Record<string, string>;
  retryPolicy?: {
    maxRetries: number;
    backoffMs: number;
  };
}

interface UpdateWebhookRequest {
  name?: string;
  url?: string;
  events?: string[];
  enabled?: boolean;
  headers?: Record<string, string>;
  retryPolicy?: {
    maxRetries: number;
    backoffMs: number;
  };
}

/**
 * Handle webhook management routes
 */
export async function handleWebhookManagementRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Only handle /api/admin/webhooks/* routes
  if (!pathname.startsWith('/api/admin/webhooks')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Require admin for all webhook routes
  const auth = await requireAdmin(req, res);
  if (!auth) return true;

  try {
    // GET /api/admin/webhooks - List configured webhooks
    if (pathname === '/api/admin/webhooks' && req.method === 'GET') {
      const allWebhooks = Array.from(webhooks.values()).map((w) => ({
        ...w,
        secret: '***hidden***', // Don't expose secrets in list
      }));

      sendJSON(res, { webhooks: allWebhooks, count: allWebhooks.length });
      return true;
    }

    // POST /api/admin/webhooks - Create a new webhook
    if (pathname === '/api/admin/webhooks' && req.method === 'POST') {
      const body = await parseBody<CreateWebhookRequest>(req);

      if (!body?.name || !body?.url || !body?.events?.length) {
        sendError(res, 'name, url, and events are required', 400);
        return true;
      }

      // Validate URL
      try {
        new URL(body.url);
      } catch {
        sendError(res, 'Invalid webhook URL', 400);
        return true;
      }

      // Generate ID and secret
      const id = `wh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const secret = generateWebhookSecret();

      const webhook: WebhookConfig = {
        id,
        name: body.name,
        url: body.url,
        events: body.events,
        secret,
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        headers: body.headers,
        retryPolicy: body.retryPolicy ?? { maxRetries: 3, backoffMs: 1000 },
      };

      webhooks.set(id, webhook);
      webhookLogs.set(id, []);

      log.info({ userId: auth.userId, webhookId: id, name: body.name }, 'Webhook created');
      sendJSON(res, { webhook: { ...webhook, secret } }, 201); // Include secret only on create
      return true;
    }

    // Match specific webhook routes
    const webhookIdMatch = pathname.match(/^\/api\/admin\/webhooks\/([^/]+)$/);
    const webhookTestMatch = pathname.match(/^\/api\/admin\/webhooks\/([^/]+)\/test$/);
    const webhookLogsMatch = pathname.match(/^\/api\/admin\/webhooks\/([^/]+)\/logs$/);

    // GET /api/admin/webhooks/:id - Get webhook details
    if (webhookIdMatch && req.method === 'GET') {
      const webhookId = webhookIdMatch[1];
      const webhook = webhooks.get(webhookId);

      if (!webhook) {
        sendError(res, 'Webhook not found', 404);
        return true;
      }

      sendJSON(res, { webhook: { ...webhook, secret: '***hidden***' } });
      return true;
    }

    // PUT /api/admin/webhooks/:id - Update a webhook
    if (webhookIdMatch && req.method === 'PUT') {
      const webhookId = webhookIdMatch[1];
      const webhook = webhooks.get(webhookId);

      if (!webhook) {
        sendError(res, 'Webhook not found', 404);
        return true;
      }

      const body = await parseBody<UpdateWebhookRequest>(req);

      if (body?.url) {
        try {
          new URL(body.url);
        } catch {
          sendError(res, 'Invalid webhook URL', 400);
          return true;
        }
      }

      // Update fields
      if (body?.name) webhook.name = body.name;
      if (body?.url) webhook.url = body.url;
      if (body?.events) webhook.events = body.events;
      if (body?.enabled !== undefined) webhook.enabled = body.enabled;
      if (body?.headers) webhook.headers = body.headers;
      if (body?.retryPolicy) webhook.retryPolicy = body.retryPolicy;
      webhook.updatedAt = new Date().toISOString();

      log.info({ userId: auth.userId, webhookId }, 'Webhook updated');
      sendJSON(res, { webhook: { ...webhook, secret: '***hidden***' } });
      return true;
    }

    // DELETE /api/admin/webhooks/:id - Delete a webhook
    if (webhookIdMatch && req.method === 'DELETE') {
      const webhookId = webhookIdMatch[1];

      if (!webhooks.has(webhookId)) {
        sendError(res, 'Webhook not found', 404);
        return true;
      }

      webhooks.delete(webhookId);
      webhookLogs.delete(webhookId);

      log.info({ userId: auth.userId, webhookId }, 'Webhook deleted');
      sendJSON(res, { deleted: true });
      return true;
    }

    // POST /api/admin/webhooks/:id/test - Test a webhook
    if (webhookTestMatch && req.method === 'POST') {
      const webhookId = webhookTestMatch[1];
      const webhook = webhooks.get(webhookId);

      if (!webhook) {
        sendError(res, 'Webhook not found', 404);
        return true;
      }

      const testPayload = {
        event: 'webhook.test',
        timestamp: new Date().toISOString(),
        data: { message: 'This is a test webhook delivery' },
      };

      const result = await deliverWebhook(webhook, testPayload);

      log.info(
        { userId: auth.userId, webhookId, success: result.success },
        'Webhook test executed'
      );
      sendJSON(res, result);
      return true;
    }

    // GET /api/admin/webhooks/:id/logs - Get webhook delivery logs
    if (webhookLogsMatch && req.method === 'GET') {
      const webhookId = webhookLogsMatch[1];

      if (!webhooks.has(webhookId)) {
        sendError(res, 'Webhook not found', 404);
        return true;
      }

      const logs = webhookLogs.get(webhookId) ?? [];
      const recentLogs = logs
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 100);

      sendJSON(res, { logs: recentLogs, count: recentLogs.length });
      return true;
    }

    // Unknown webhook route
    sendError(res, 'Webhook endpoint not found', 404);
    return true;
  } catch (err) {
    log.error({ error: String(err) }, 'Webhook management route error');
    sendError(res, 'Internal error', 500);
    return true;
  }
}

/**
 * Generate a secure webhook secret
 */
function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(32).toString('hex')}`;
}

/**
 * Sign a webhook payload with HMAC-SHA256
 */
export function signWebhookPayload(secret: string, payload: Record<string, unknown>): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const payloadString = JSON.stringify(payload);
  const signatureInput = `${timestamp}.${payloadString}`;

  const signature = crypto.createHmac('sha256', secret).update(signatureInput).digest('hex');

  return `t=${timestamp},v1=${signature}`;
}

/**
 * Verify a webhook signature
 */
export function verifyWebhookSignature(
  secret: string,
  payload: string,
  signatureHeader: string,
  toleranceSeconds = 300
): boolean {
  const parts = signatureHeader.split(',');
  const timestampPart = parts.find((p) => p.startsWith('t='));
  const signaturePart = parts.find((p) => p.startsWith('v1='));

  if (!timestampPart || !signaturePart) {
    return false;
  }

  const timestamp = parseInt(timestampPart.slice(2), 10);
  const expectedSignature = signaturePart.slice(3);

  // Check timestamp tolerance
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    return false;
  }

  // Compute expected signature
  const signatureInput = `${timestamp}.${payload}`;
  const computedSignature = crypto
    .createHmac('sha256', secret)
    .update(signatureInput)
    .digest('hex');

  // Constant-time comparison
  return crypto.timingSafeEqual(Buffer.from(computedSignature), Buffer.from(expectedSignature));
}

/**
 * Deliver a webhook
 */
async function deliverWebhook(
  webhook: WebhookConfig,
  payload: Record<string, unknown>
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  const logEntry: WebhookDeliveryLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    webhookId: webhook.id,
    event: (payload.event as string) ?? 'unknown',
    payload,
    status: 'pending',
    attempts: 0,
    createdAt: new Date().toISOString(),
  };

  const logs = webhookLogs.get(webhook.id) ?? [];
  logs.push(logEntry);
  webhookLogs.set(webhook.id, logs);

  const signature = signWebhookPayload(webhook.secret, payload);
  const maxRetries = webhook.retryPolicy?.maxRetries ?? 3;
  const backoffMs = webhook.retryPolicy?.backoffMs ?? 1000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    logEntry.attempts = attempt;

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-ID': webhook.id,
          ...webhook.headers,
        },
        body: JSON.stringify(payload),
      });

      logEntry.responseCode = response.status;

      if (response.ok) {
        logEntry.status = 'success';
        logEntry.deliveredAt = new Date().toISOString();
        return { success: true, statusCode: response.status };
      }

      logEntry.responseBody = await response.text();

      // Retry on 5xx errors
      if (response.status >= 500 && attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, backoffMs * attempt));
        continue;
      }

      logEntry.status = 'failed';
      logEntry.error = `HTTP ${response.status}`;
      return { success: false, statusCode: response.status, error: `HTTP ${response.status}` };
    } catch (err) {
      logEntry.error = String(err);

      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, backoffMs * attempt));
        continue;
      }

      logEntry.status = 'failed';
      return { success: false, error: String(err) };
    }
  }

  logEntry.status = 'failed';
  return { success: false, error: 'Max retries exceeded' };
}

/**
 * Dispatch a webhook event to all matching webhooks
 */
export async function dispatchWebhookEvent(
  event: string,
  data: Record<string, unknown>
): Promise<{ dispatched: number; failed: number }> {
  const payload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  let dispatched = 0;
  let failed = 0;

  for (const webhook of webhooks.values()) {
    if (!webhook.enabled) continue;
    if (!webhook.events.includes(event) && !webhook.events.includes('*')) continue;

    const result = await deliverWebhook(webhook, payload);
    if (result.success) {
      dispatched++;
    } else {
      failed++;
    }
  }

  return { dispatched, failed };
}

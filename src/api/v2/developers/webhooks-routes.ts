/**
 * Developer Platform API v2 - Webhooks Routes
 *
 * Manages developer webhook subscriptions for real-time event notifications.
 *
 * Endpoints:
 *   POST   /api/v2/developers/webhooks          - Create subscription
 *   GET    /api/v2/developers/webhooks          - List subscriptions
 *   GET    /api/v2/developers/webhooks/:id      - Get subscription
 *   PUT    /api/v2/developers/webhooks/:id      - Update subscription
 *   DELETE /api/v2/developers/webhooks/:id      - Delete subscription
 *   POST   /api/v2/developers/webhooks/:id/test - Send test event
 *   GET    /api/v2/developers/webhooks/:id/logs - Get delivery logs
 *
 * @module api/v2/developers/webhooks-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import crypto from 'crypto';
import { getLogger } from '../../../utils/safe-logger.js';
import { sendSuccess, sendError } from '../../helpers.js';
import {
  requireApiKeyAuth,
  extractIdFromPath,
  parseJsonBody,
  generateId,
} from './shared/middleware.js';
import { CreateWebhookSchema, UpdateWebhookSchema, PaginationSchema } from './shared/validation.js';
import type {
  DeveloperWebhook,
  CreateWebhookInput,
  UpdateWebhookInput,
  WebhookPayload,
  WebhookDeliveryLog,
} from './shared/types.js';
import { COLLECTIONS, ID_PREFIXES } from './shared/types.js';

const log = getLogger().child({ module: 'webhooks-routes' });

/** Base path for webhooks API */
const BASE_PATH = '/api/v2/developers/webhooks';

/** Secret length for webhook signing */
const SECRET_LENGTH = 32;

// ============================================================================
// HELPERS
// ============================================================================

/** Generate a secure random webhook secret */
function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(SECRET_LENGTH).toString('hex')}`;
}

/** Generate HMAC signature for webhook payload */
export function signWebhookPayload(secret: string, payload: unknown): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

/** Helper to convert Firestore timestamp to Date */
function convertTimestamp(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    return (value as { toDate: () => Date }).toDate();
  }
  if (value instanceof Date) return value;
  if (typeof value === 'string') return new Date(value);
  return undefined;
}

// ============================================================================
// MAIN ROUTER
// ============================================================================

/**
 * Handle all webhooks routes
 *
 * Returns true if request was handled, false otherwise.
 */
export async function handleWebhooksRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  if (!pathname.startsWith(BASE_PATH)) {
    return false;
  }

  const method = req.method?.toUpperCase() || 'GET';
  const subPath = pathname.slice(BASE_PATH.length);

  log.debug({ method, subPath }, 'Handling webhooks request');

  try {
    // POST /webhooks - Create new subscription
    if (method === 'POST' && (subPath === '' || subPath === '/')) {
      return handleCreateWebhook(req, res);
    }

    // GET /webhooks - List subscriptions
    if (method === 'GET' && (subPath === '' || subPath === '/')) {
      return handleListWebhooks(req, res);
    }

    // Routes with :id parameter
    const webhookId = extractIdFromPath(subPath, '/');

    if (!webhookId) {
      return false;
    }

    // POST /webhooks/:id/test - Test webhook
    if (method === 'POST' && subPath.endsWith('/test')) {
      return handleTestWebhook(req, res, webhookId);
    }

    // GET /webhooks/:id/logs - Get delivery logs
    if (method === 'GET' && subPath.endsWith('/logs')) {
      return handleGetWebhookLogs(req, res, webhookId);
    }

    // GET /webhooks/:id - Get webhook
    if (method === 'GET' && subPath === `/${webhookId}`) {
      return handleGetWebhook(req, res, webhookId);
    }

    // PUT /webhooks/:id - Update webhook
    if (method === 'PUT' && subPath === `/${webhookId}`) {
      return handleUpdateWebhook(req, res, webhookId);
    }

    // DELETE /webhooks/:id - Delete webhook
    if (method === 'DELETE' && subPath === `/${webhookId}`) {
      return handleDeleteWebhook(req, res, webhookId);
    }

    return false;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message, pathname }, 'Error handling webhooks request');
    sendError(res, 'Internal server error', 500);
    return true;
  }
}

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

/**
 * POST /webhooks - Create a new webhook subscription
 */
async function handleCreateWebhook(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  // Authenticate
  const auth = await requireApiKeyAuth(req, res);
  if (!auth) return true;

  // Parse body
  const body = await parseJsonBody(req);
  if (!body) {
    sendError(res, 'Invalid JSON body', 400);
    return true;
  }

  // Validate input
  const parseResult = CreateWebhookSchema.safeParse(body);
  if (!parseResult.success) {
    sendError(res, parseResult.error.issues[0]?.message || 'Invalid input', 400);
    return true;
  }

  const input = parseResult.data as CreateWebhookInput;

  try {
    const { getFirestore } = await import('../../v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    // Check for duplicate name
    const existingSnapshot = await db
      .collection(COLLECTIONS.WEBHOOKS)
      .where('publisherId', '==', auth.publisherId)
      .where('name', '==', input.name)
      .limit(1)
      .get();

    if (!existingSnapshot.empty) {
      sendError(res, `Webhook with name "${input.name}" already exists`, 409);
      return true;
    }

    // Generate ID and secret
    const webhookId = generateId(ID_PREFIXES.WEBHOOK);
    const secret = generateWebhookSecret();
    const now = new Date();

    const webhook: DeveloperWebhook = {
      id: webhookId,
      publisherId: auth.publisherId,
      personaId: input.personaId,
      name: input.name,
      url: input.url,
      events: input.events,
      secret,
      enabled: input.enabled ?? true,
      retryPolicy: input.retryPolicy,
      failureCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    await db.collection(COLLECTIONS.WEBHOOKS).doc(webhookId).set(webhook);

    log.info(
      { webhookId, publisherId: auth.publisherId, name: input.name, events: input.events },
      'Webhook created'
    );

    sendSuccess(res, webhook, 201);
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message }, 'Failed to create webhook');
    sendError(res, 'Failed to create webhook', 500);
    return true;
  }
}

/**
 * GET /webhooks - List all webhooks for publisher
 */
async function handleListWebhooks(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  // Authenticate
  const auth = await requireApiKeyAuth(req, res);
  if (!auth) return true;

  // Parse pagination
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const paginationResult = PaginationSchema.safeParse({
    page: url.searchParams.get('page'),
    limit: url.searchParams.get('limit'),
    cursor: url.searchParams.get('cursor'),
  });

  const pagination = paginationResult.success ? paginationResult.data : { page: 1, limit: 20 };

  try {
    const { getFirestore } = await import('../../v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    // Query webhooks for this publisher
    let query = db
      .collection(COLLECTIONS.WEBHOOKS)
      .where('publisherId', '==', auth.publisherId)
      .orderBy('createdAt', 'desc')
      .limit(pagination.limit);

    // Use cursor if provided
    if (pagination.cursor) {
      const cursorDoc = await db.collection(COLLECTIONS.WEBHOOKS).doc(pagination.cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.get();

    const webhooks: DeveloperWebhook[] = snapshot.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return {
        ...data,
        id: doc.id,
        createdAt: convertTimestamp(data.createdAt),
        updatedAt: convertTimestamp(data.updatedAt),
        lastDeliveredAt: convertTimestamp(data.lastDeliveredAt),
      } as DeveloperWebhook;
    });

    // Get next cursor
    const nextCursor =
      webhooks.length === pagination.limit ? webhooks[webhooks.length - 1]?.id : undefined;

    sendSuccess(res, {
      items: webhooks,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        nextCursor,
        hasMore: !!nextCursor,
      },
    });
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message }, 'Failed to list webhooks');
    sendError(res, 'Failed to list webhooks', 500);
    return true;
  }
}

/**
 * GET /webhooks/:id - Get a specific webhook
 */
async function handleGetWebhook(
  req: IncomingMessage,
  res: ServerResponse,
  webhookId: string
): Promise<boolean> {
  // Authenticate
  const auth = await requireApiKeyAuth(req, res);
  if (!auth) return true;

  try {
    const { getFirestore } = await import('../../v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    const doc = await db.collection(COLLECTIONS.WEBHOOKS).doc(webhookId).get();

    if (!doc.exists) {
      sendError(res, 'Webhook not found', 404);
      return true;
    }

    const data = doc.data() as Record<string, unknown> | undefined;

    // Verify ownership
    if (data?.publisherId !== auth.publisherId) {
      sendError(res, 'Webhook not found', 404);
      return true;
    }

    const webhook: DeveloperWebhook = {
      ...data,
      id: doc.id,
      createdAt: convertTimestamp(data?.createdAt),
      updatedAt: convertTimestamp(data?.updatedAt),
      lastDeliveredAt: convertTimestamp(data?.lastDeliveredAt),
    } as DeveloperWebhook;

    sendSuccess(res, webhook);
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message, webhookId }, 'Failed to get webhook');
    sendError(res, 'Failed to get webhook', 500);
    return true;
  }
}

/**
 * PUT /webhooks/:id - Update a webhook
 */
async function handleUpdateWebhook(
  req: IncomingMessage,
  res: ServerResponse,
  webhookId: string
): Promise<boolean> {
  // Authenticate
  const auth = await requireApiKeyAuth(req, res);
  if (!auth) return true;

  // Parse body
  const body = await parseJsonBody(req);
  if (!body) {
    sendError(res, 'Invalid JSON body', 400);
    return true;
  }

  // Validate input
  const parseResult = UpdateWebhookSchema.safeParse(body);
  if (!parseResult.success) {
    sendError(res, parseResult.error.issues[0]?.message || 'Invalid input', 400);
    return true;
  }

  const input = parseResult.data as UpdateWebhookInput;

  try {
    const { getFirestore } = await import('../../v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    // Verify ownership
    const doc = await db.collection(COLLECTIONS.WEBHOOKS).doc(webhookId).get();

    if (!doc.exists) {
      sendError(res, 'Webhook not found', 404);
      return true;
    }

    const existingData = doc.data();
    if (existingData?.publisherId !== auth.publisherId) {
      sendError(res, 'Webhook not found', 404);
      return true;
    }

    // Update
    const updates: Record<string, unknown> = {
      ...input,
      updatedAt: new Date(),
    };

    await db.collection(COLLECTIONS.WEBHOOKS).doc(webhookId).update(updates);

    // Return updated webhook
    const updatedDoc = await db.collection(COLLECTIONS.WEBHOOKS).doc(webhookId).get();
    const data = updatedDoc.data() as Record<string, unknown> | undefined;

    const webhook: DeveloperWebhook = {
      ...data,
      id: updatedDoc.id,
      createdAt: convertTimestamp(data?.createdAt),
      updatedAt: convertTimestamp(data?.updatedAt),
      lastDeliveredAt: convertTimestamp(data?.lastDeliveredAt),
    } as DeveloperWebhook;

    log.info({ webhookId, publisherId: auth.publisherId }, 'Webhook updated');

    sendSuccess(res, webhook);
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message, webhookId }, 'Failed to update webhook');
    sendError(res, 'Failed to update webhook', 500);
    return true;
  }
}

/**
 * DELETE /webhooks/:id - Delete a webhook
 */
async function handleDeleteWebhook(
  req: IncomingMessage,
  res: ServerResponse,
  webhookId: string
): Promise<boolean> {
  // Authenticate
  const auth = await requireApiKeyAuth(req, res);
  if (!auth) return true;

  try {
    const { getFirestore } = await import('../../v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    // Verify ownership
    const doc = await db.collection(COLLECTIONS.WEBHOOKS).doc(webhookId).get();

    if (!doc.exists) {
      sendError(res, 'Webhook not found', 404);
      return true;
    }

    const data = doc.data();
    if (data?.publisherId !== auth.publisherId) {
      sendError(res, 'Webhook not found', 404);
      return true;
    }

    // Delete webhook and its logs
    const batch = db.batch();

    // Delete webhook
    batch.delete(db.collection(COLLECTIONS.WEBHOOKS).doc(webhookId));

    // Delete delivery logs (limited batch)
    const logsSnapshot = await db
      .collection(COLLECTIONS.WEBHOOK_LOGS)
      .where('webhookId', '==', webhookId)
      .limit(500)
      .get();

    for (const logDoc of logsSnapshot.docs) {
      batch.delete(logDoc.ref);
    }

    await batch.commit();

    log.info({ webhookId, publisherId: auth.publisherId }, 'Webhook deleted');

    sendSuccess(res, { deleted: true });
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message, webhookId }, 'Failed to delete webhook');
    sendError(res, 'Failed to delete webhook', 500);
    return true;
  }
}

/**
 * POST /webhooks/:id/test - Send a test event to webhook
 */
async function handleTestWebhook(
  req: IncomingMessage,
  res: ServerResponse,
  webhookId: string
): Promise<boolean> {
  // Authenticate
  const auth = await requireApiKeyAuth(req, res);
  if (!auth) return true;

  try {
    const { getFirestore } = await import('../../v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    // Get webhook
    const doc = await db.collection(COLLECTIONS.WEBHOOKS).doc(webhookId).get();

    if (!doc.exists) {
      sendError(res, 'Webhook not found', 404);
      return true;
    }

    const data = doc.data() as Record<string, unknown> | undefined;
    if (data?.publisherId !== auth.publisherId) {
      sendError(res, 'Webhook not found', 404);
      return true;
    }

    const webhook = data as unknown as DeveloperWebhook;

    // Create test payload
    const testPayload: WebhookPayload = {
      id: `evt_test_${Date.now()}`,
      type: 'session.started',
      timestamp: new Date().toISOString(),
      publisherId: auth.publisherId,
      data: {
        test: true,
        message: 'This is a test webhook event',
      },
    };

    // Sign and send
    const signature = signWebhookPayload(webhook.secret, testPayload);
    const startTime = Date.now();

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'User-Agent': 'Ferni-Webhooks/1.0',
        },
        body: JSON.stringify(testPayload),
      });

      const executionTimeMs = Date.now() - startTime;

      if (response.ok) {
        log.info({ webhookId, statusCode: response.status, executionTimeMs }, 'Test webhook sent');

        sendSuccess(res, {
          success: true,
          statusCode: response.status,
          executionTimeMs,
          payload: testPayload,
        });
      } else {
        const errorBody = await response.text().catch(() => '');

        log.warn(
          { webhookId, statusCode: response.status, error: errorBody },
          'Test webhook failed'
        );

        sendSuccess(res, {
          success: false,
          statusCode: response.status,
          error: `HTTP ${response.status}: ${response.statusText}`,
          responseBody: errorBody.slice(0, 500),
          executionTimeMs,
          payload: testPayload,
        });
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      sendSuccess(res, {
        success: false,
        error: `Connection failed: ${err.message}`,
        executionTimeMs: Date.now() - startTime,
        payload: testPayload,
      });
    }

    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message, webhookId }, 'Failed to test webhook');
    sendError(res, 'Failed to test webhook', 500);
    return true;
  }
}

/**
 * GET /webhooks/:id/logs - Get delivery logs for a webhook
 */
async function handleGetWebhookLogs(
  req: IncomingMessage,
  res: ServerResponse,
  webhookId: string
): Promise<boolean> {
  // Authenticate
  const auth = await requireApiKeyAuth(req, res);
  if (!auth) return true;

  // Parse pagination
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);
  const cursor = url.searchParams.get('cursor');

  try {
    const { getFirestore } = await import('../../v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    // Verify ownership
    const webhookDoc = await db.collection(COLLECTIONS.WEBHOOKS).doc(webhookId).get();

    if (!webhookDoc.exists) {
      sendError(res, 'Webhook not found', 404);
      return true;
    }

    const webhookData = webhookDoc.data();
    if (webhookData?.publisherId !== auth.publisherId) {
      sendError(res, 'Webhook not found', 404);
      return true;
    }

    // Query logs
    let query = db
      .collection(COLLECTIONS.WEBHOOK_LOGS)
      .where('webhookId', '==', webhookId)
      .orderBy('createdAt', 'desc')
      .limit(limit);

    if (cursor) {
      const cursorDoc = await db.collection(COLLECTIONS.WEBHOOK_LOGS).doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.get();

    const logs: WebhookDeliveryLog[] = snapshot.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return {
        ...data,
        id: doc.id,
        createdAt: convertTimestamp(data.createdAt),
        deliveredAt: convertTimestamp(data.deliveredAt),
      } as WebhookDeliveryLog;
    });

    const nextCursor = logs.length === limit ? logs[logs.length - 1]?.id : undefined;

    sendSuccess(res, {
      items: logs,
      pagination: {
        limit,
        nextCursor,
        hasMore: !!nextCursor,
      },
    });
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message, webhookId }, 'Failed to get webhook logs');
    sendError(res, 'Failed to get webhook logs', 500);
    return true;
  }
}

export default { handleWebhooksRoutes };

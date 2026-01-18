/**
 * Developer Console Webhook Routes
 *
 * Provides CRUD operations for webhooks:
 * - GET    /api/v2/developers/webhooks - List all webhooks
 * - POST   /api/v2/developers/webhooks - Create webhook
 * - GET    /api/v2/developers/webhooks/:id - Get webhook
 * - PUT    /api/v2/developers/webhooks/:id - Update webhook
 * - DELETE /api/v2/developers/webhooks/:id - Delete webhook
 * - POST   /api/v2/developers/webhooks/:id/test - Send test event
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getLogger } from '../../../utils/safe-logger.js';
import { handleCorsPreflightIfNeeded, parseBody, sendJSON, sendError } from '../../helpers.js';
import { getPublisherFromToken } from './shared/developer-auth.js';
import { z } from 'zod';
import * as crypto from 'crypto';
import { getFirestoreDb } from '../../../utils/firestore-utils.js';
import { COLLECTIONS, type DeveloperWebhook, type WebhookEventType as WebhookEventTypeValue } from '../../../types/developer-platform.js';

const log = getLogger().child({ module: 'developers-webhooks' });

// ============================================================================
// TYPES & VALIDATION
// ============================================================================

// Use the official WebhookEventType values from developer-platform.ts
const WebhookEventType = z.enum([
  'session.started',
  'session.ended',
  'conversation.turn.completed',
  'conversation.transcript.ready',
  'tool.called',
  'tool.completed',
  'tool.failed',
  'persona.handoff',
  'persona.installed',
  'activity.created',
] as [WebhookEventTypeValue, ...WebhookEventTypeValue[]]);

const CreateWebhookSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  events: z.array(WebhookEventType).min(1),
  personaId: z.string().optional(),
  enabled: z.boolean().default(true),
});

const UpdateWebhookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().optional(),
  events: z.array(WebhookEventType).min(1).optional(),
  enabled: z.boolean().optional(),
});

type CreateWebhookRequest = z.infer<typeof CreateWebhookSchema>;
type UpdateWebhookRequest = z.infer<typeof UpdateWebhookSchema>;

interface Webhook {
  id: string;
  publisherId: string;
  personaId?: string;
  name: string;
  url: string;
  events: string[];
  secret: string;
  enabled: boolean;
  failureCount: number;
  createdAt: Date;
  lastDeliveredAt?: Date;
}

// ============================================================================
// FIRESTORE STORAGE IMPLEMENTATION
// ============================================================================

/**
 * Get Firestore collection reference for webhooks
 * @throws Error if Firestore is not initialized
 */
function getWebhooksCollection() {
  const db = getFirestoreDb();
  if (!db) {
    throw new Error('Firestore not initialized');
  }
  return db.collection(COLLECTIONS.WEBHOOKS);
}

/**
 * Convert Firestore document to Webhook object
 */
function docToWebhook(doc: FirebaseFirestore.DocumentSnapshot): Webhook | null {
  if (!doc.exists) return null;
  const data = doc.data();
  if (!data) return null;
  const webhookData = data as DeveloperWebhook;

  // Helper to convert Firestore Timestamp to Date
  const toDate = (val: unknown): Date | undefined => {
    if (!val) return undefined;
    if (val instanceof Date) return val;
    if (typeof val === 'object' && 'toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
      return (val as { toDate: () => Date }).toDate();
    }
    return undefined;
  };

  return {
    id: doc.id,
    publisherId: webhookData.publisherId,
    personaId: webhookData.personaId,
    name: webhookData.name,
    url: webhookData.url,
    events: webhookData.events,
    secret: webhookData.secret,
    enabled: webhookData.enabled ?? true,
    failureCount: webhookData.failureCount ?? 0,
    createdAt: toDate(webhookData.createdAt) ?? new Date(),
    lastDeliveredAt: toDate(webhookData.lastDeliveredAt),
  };
}

async function listWebhooks(
  publisherId: string,
  limit = 20,
  cursor?: string
): Promise<{ items: Webhook[]; nextCursor?: string; hasMore: boolean }> {
  const collection = getWebhooksCollection();
  
  let query = collection
    .where('publisherId', '==', publisherId)
    .orderBy('createdAt', 'desc')
    .limit(limit + 1); // Fetch one extra to check if there are more

  // If cursor provided, start after that document
  if (cursor) {
    const cursorDoc = await collection.doc(cursor).get();
    if (cursorDoc.exists) {
      query = query.startAfter(cursorDoc);
    }
  }

  const snapshot = await query.get();
  const docs = snapshot.docs;
  
  // Check if there are more results
  const hasMore = docs.length > limit;
  const items = docs.slice(0, limit).map((doc) => docToWebhook(doc)!).filter(Boolean);
  const nextCursor = hasMore && docs.length > 0 ? docs[limit - 1].id : undefined;

  return { items, nextCursor, hasMore };
}

async function createWebhook(
  publisherId: string,
  data: CreateWebhookRequest
): Promise<Webhook> {
  const id = `webhook_${crypto.randomBytes(16).toString('hex')}`;
  const secret = crypto.randomBytes(32).toString('hex');
  const now = new Date();

  const webhookData: Omit<DeveloperWebhook, 'id'> = {
    publisherId,
    personaId: data.personaId,
    name: data.name,
    url: data.url,
    events: data.events,
    secret,
    enabled: data.enabled,
    failureCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  const collection = getWebhooksCollection();
  await collection.doc(id).set(webhookData);

  log.info({ publisherId, webhookId: id, events: data.events }, 'Webhook created');

  return {
    id,
    publisherId,
    personaId: data.personaId,
    name: data.name,
    url: data.url,
    events: data.events,
    secret,
    enabled: data.enabled,
    failureCount: 0,
    createdAt: now,
  };
}

async function getWebhook(publisherId: string, webhookId: string): Promise<Webhook | null> {
  const collection = getWebhooksCollection();
  const doc = await collection.doc(webhookId).get();
  
  const webhook = docToWebhook(doc);

  if (!webhook || webhook.publisherId !== publisherId) {
    return null;
  }

  return webhook;
}

async function updateWebhook(
  publisherId: string,
  webhookId: string,
  updates: UpdateWebhookRequest
): Promise<Webhook | null> {
  const webhook = await getWebhook(publisherId, webhookId);

  if (!webhook) {
    return null;
  }

  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };
  
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.url !== undefined) updateData.url = updates.url;
  if (updates.events !== undefined) updateData.events = updates.events;
  if (updates.enabled !== undefined) updateData.enabled = updates.enabled;

  const collection = getWebhooksCollection();
  await collection.doc(webhookId).update(updateData);

  log.info({ publisherId, webhookId, updates }, 'Webhook updated');

  // Return updated webhook
  return {
    ...webhook,
    ...(updates.name && { name: updates.name }),
    ...(updates.url && { url: updates.url }),
    ...(updates.events && { events: updates.events }),
    ...(updates.enabled !== undefined && { enabled: updates.enabled }),
  };
}

async function deleteWebhook(publisherId: string, webhookId: string): Promise<boolean> {
  const webhook = await getWebhook(publisherId, webhookId);

  if (!webhook) {
    return false;
  }

  const collection = getWebhooksCollection();
  await collection.doc(webhookId).delete();

  log.info({ publisherId, webhookId }, 'Webhook deleted');

  return true;
}

async function sendTestWebhook(
  publisherId: string,
  webhookId: string
): Promise<{ success: boolean; statusCode?: number; executionTimeMs: number; error?: string }> {
  const webhook = await getWebhook(publisherId, webhookId);

  if (!webhook) {
    throw new Error('Webhook not found');
  }

  const testPayload = {
    id: `evt_${crypto.randomBytes(8).toString('hex')}`,
    type: 'session.started',
    timestamp: new Date().toISOString(),
    publisherId,
    data: {
      sessionId: 'test_session',
      personaId: webhook.personaId || 'test_persona',
      message: 'This is a test webhook event',
    },
  };

  const startTime = Date.now();

  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Ferni-Webhooks/1.0',
        'X-Webhook-Signature': generateWebhookSignature(webhook.secret, testPayload),
      },
      body: JSON.stringify(testPayload),
    });

    const executionTimeMs = Date.now() - startTime;

    // Update lastDeliveredAt in Firestore on success
    if (response.ok) {
      const collection = getWebhooksCollection();
      await collection.doc(webhookId).update({
        lastDeliveredAt: new Date(),
        failureCount: 0, // Reset failure count on success
      });
    }

    log.info(
      { publisherId, webhookId, statusCode: response.status, executionTimeMs },
      'Test webhook sent'
    );

    return {
      success: response.ok,
      statusCode: response.status,
      executionTimeMs,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    const executionTimeMs = Date.now() - startTime;
    const err = error instanceof Error ? error : new Error(String(error));

    // Increment failure count in Firestore
    const collection = getWebhooksCollection();
    await collection.doc(webhookId).update({
      failureCount: (webhook.failureCount || 0) + 1,
    });

    log.error({ publisherId, webhookId, error: err.message }, 'Test webhook failed');

    return {
      success: false,
      executionTimeMs,
      error: err.message,
    };
  }
}

function generateWebhookSignature(secret: string, payload: unknown): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const payloadString = JSON.stringify(payload);
  const signedPayload = `${timestamp}.${payloadString}`;

  const signature = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

  return `t=${timestamp},v1=${signature}`;
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleDeveloperWebhooksRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Only handle our routes (v2 API)
  if (!pathname.startsWith('/api/v2/developers/webhooks')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  const method = req.method?.toUpperCase();

  // Authenticate
  const publisherId = await getPublisherFromToken(req);
  if (!publisherId) {
    sendError(res, 'Authentication required', 401);
    return true;
  }

  try {
    // GET /api/v2/developers/webhooks - List webhooks
    if (pathname === '/api/v2/developers/webhooks' && method === 'GET') {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const limit = parseInt(url.searchParams.get('limit') || '20', 10);
      const cursor = url.searchParams.get('cursor') || undefined;

      const result = await listWebhooks(publisherId, limit, cursor);

      sendJSON(res, {
        success: true,
        items: result.items.map((w) => ({
          id: w.id,
          publisherId: w.publisherId,
          personaId: w.personaId,
          name: w.name,
          url: w.url,
          events: w.events,
          secret: w.secret, // Only show in list/get (not in delivery logs)
          enabled: w.enabled,
          failureCount: w.failureCount,
          createdAt: w.createdAt.toISOString(),
          lastDeliveredAt: w.lastDeliveredAt?.toISOString(),
        })),
        pagination: {
          limit,
          nextCursor: result.nextCursor,
          hasMore: result.hasMore,
        },
      });
      return true;
    }

    // POST /api/v2/developers/webhooks - Create webhook
    if (pathname === '/api/v2/developers/webhooks' && method === 'POST') {
      const body = await parseBody<CreateWebhookRequest>(req);

      // Validate input
      const validation = CreateWebhookSchema.safeParse(body);
      if (!validation.success) {
        sendError(res, `Invalid input: ${validation.error.issues[0].message}`, 400);
        return true;
      }

      // Check webhook limit (max 10 per publisher)
      const existing = await listWebhooks(publisherId, 100);
      if (existing.items.length >= 10) {
        sendError(res, 'Maximum 10 webhooks allowed. Delete unused webhooks first.', 400);
        return true;
      }

      const webhook = await createWebhook(publisherId, validation.data);

      sendJSON(
        res,
        {
          success: true,
          data: {
            id: webhook.id,
            publisherId: webhook.publisherId,
            personaId: webhook.personaId,
            name: webhook.name,
            url: webhook.url,
            events: webhook.events,
            secret: webhook.secret,
            enabled: webhook.enabled,
            failureCount: webhook.failureCount,
            createdAt: webhook.createdAt.toISOString(),
          },
        },
        201
      );
      return true;
    }

    // GET /api/v2/developers/webhooks/:id - Get webhook
    const getMatch = pathname.match(/^\/api\/v2\/developers\/webhooks\/([^/]+)$/);
    if (getMatch && method === 'GET') {
      const webhookId = getMatch[1];

      const webhook = await getWebhook(publisherId, webhookId);

      if (!webhook) {
        sendError(res, 'Webhook not found', 404);
        return true;
      }

      sendJSON(res, {
        success: true,
        data: {
          id: webhook.id,
          publisherId: webhook.publisherId,
          personaId: webhook.personaId,
          name: webhook.name,
          url: webhook.url,
          events: webhook.events,
          secret: webhook.secret,
          enabled: webhook.enabled,
          failureCount: webhook.failureCount,
          createdAt: webhook.createdAt.toISOString(),
          lastDeliveredAt: webhook.lastDeliveredAt?.toISOString(),
        },
      });
      return true;
    }

    // PUT /api/v2/developers/webhooks/:id - Update webhook
    const updateMatch = pathname.match(/^\/api\/v2\/developers\/webhooks\/([^/]+)$/);
    if (updateMatch && method === 'PUT') {
      const webhookId = updateMatch[1];
      const body = await parseBody<UpdateWebhookRequest>(req);

      // Validate input
      const validation = UpdateWebhookSchema.safeParse(body);
      if (!validation.success) {
        sendError(res, `Invalid input: ${validation.error.issues[0].message}`, 400);
        return true;
      }

      const webhook = await updateWebhook(publisherId, webhookId, validation.data);

      if (!webhook) {
        sendError(res, 'Webhook not found', 404);
        return true;
      }

      sendJSON(res, {
        success: true,
        data: {
          id: webhook.id,
          publisherId: webhook.publisherId,
          personaId: webhook.personaId,
          name: webhook.name,
          url: webhook.url,
          events: webhook.events,
          secret: webhook.secret,
          enabled: webhook.enabled,
          failureCount: webhook.failureCount,
          createdAt: webhook.createdAt.toISOString(),
          lastDeliveredAt: webhook.lastDeliveredAt?.toISOString(),
        },
      });
      return true;
    }

    // DELETE /api/v2/developers/webhooks/:id - Delete webhook
    const deleteMatch = pathname.match(/^\/api\/v2\/developers\/webhooks\/([^/]+)$/);
    if (deleteMatch && method === 'DELETE') {
      const webhookId = deleteMatch[1];

      const deleted = await deleteWebhook(publisherId, webhookId);

      if (!deleted) {
        sendError(res, 'Webhook not found', 404);
        return true;
      }

      sendJSON(res, {
        success: true,
        data: {
          deleted: true,
        },
      });
      return true;
    }

    // POST /api/v2/developers/webhooks/:id/test - Send test event
    const testMatch = pathname.match(/^\/api\/v2\/developers\/webhooks\/([^/]+)\/test$/);
    if (testMatch && method === 'POST') {
      const webhookId = testMatch[1];

      try {
        const result = await sendTestWebhook(publisherId, webhookId);

        sendJSON(res, {
          success: true,
          data: {
            success: result.success,
            statusCode: result.statusCode,
            executionTimeMs: result.executionTimeMs,
            error: result.error,
            payload: {
              type: 'session.started',
              data: {
                message: 'Test webhook event',
              },
            },
          },
        });
        return true;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));

        if (err.message.includes('not found')) {
          sendError(res, 'Webhook not found', 404);
          return true;
        }

        throw err;
      }
    }

    // Unknown webhooks route
    sendError(res, 'Not found', 404);
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message, pathname, publisherId }, 'Developer webhooks error');
    sendError(res, 'Internal server error', 500);
    return true;
  }
}

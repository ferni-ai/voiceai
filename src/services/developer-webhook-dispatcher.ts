/**
 * Developer Webhook Dispatcher
 *
 * Dispatches events to developer-registered webhooks with:
 * - HMAC signature verification
 * - Retry with exponential backoff
 * - Delivery logging
 *
 * Usage:
 *   // Fire an event
 *   await dispatchWebhookEvent({
 *     type: 'session.started',
 *     publisherId: 'pub_123',
 *     data: { sessionId: 'sess_456' }
 *   });
 *
 * @module services/developer-webhook-dispatcher
 */

import crypto from 'crypto';
import { getLogger } from '../utils/safe-logger.js';
import {
  COLLECTIONS,
  type WebhookPayload,
  type WebhookEventType,
  type DeveloperWebhook,
  type WebhookDeliveryLog,
  type WebhookDeliveryStatus,
} from '../types/developer-platform.js';

const log = getLogger().child({ module: 'webhook-dispatcher' });

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Maximum retry attempts */
const MAX_RETRIES = 3;

/** Base delay between retries (ms) */
const BASE_RETRY_DELAY = 1000;

/** Maximum delay between retries (ms) */
const MAX_RETRY_DELAY = 30000;

/** Webhook request timeout (ms) */
const REQUEST_TIMEOUT = 10000;

// ============================================================================
// TYPES
// ============================================================================

/** Event dispatch options */
export interface DispatchEventOptions {
  type: WebhookEventType;
  publisherId: string;
  personaId?: string;
  userId?: string;
  sessionId?: string;
  data: Record<string, unknown>;
}

/** Delivery result */
export interface DeliveryResult {
  webhookId: string;
  success: boolean;
  statusCode?: number;
  error?: string;
  attempt: number;
  executionTimeMs: number;
}

// ============================================================================
// SIGNATURE GENERATION
// ============================================================================

/**
 * Generate HMAC-SHA256 signature for webhook payload
 *
 * Format: t={timestamp},v1={signature}
 */
export function signPayload(secret: string, payload: WebhookPayload): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

/**
 * Verify webhook signature (for receiving webhooks)
 *
 * @param signature - The X-Webhook-Signature header value
 * @param secret - The webhook secret
 * @param body - The raw request body
 * @param tolerance - Timestamp tolerance in seconds (default: 300)
 */
export function verifySignature(
  signature: string,
  secret: string,
  body: string,
  tolerance = 300
): boolean {
  // Parse signature
  const parts = signature.split(',');
  const timestamp = parseInt(parts.find((p) => p.startsWith('t='))?.slice(2) || '0', 10);
  const expectedSig = parts.find((p) => p.startsWith('v1='))?.slice(3);

  if (!timestamp || !expectedSig) {
    return false;
  }

  // Check timestamp tolerance
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > tolerance) {
    return false;
  }

  // Compute expected signature
  const computedSig = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');

  // Constant-time comparison
  return crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(computedSig));
}

// ============================================================================
// MAIN DISPATCHER
// ============================================================================

/**
 * Dispatch an event to all matching webhooks
 *
 * This is the main entry point for firing webhook events.
 * It finds all matching webhooks and delivers to each with retries.
 */
export async function dispatchWebhookEvent(options: DispatchEventOptions): Promise<void> {
  const { type, publisherId, personaId, userId, sessionId, data } = options;

  try {
    // Get matching webhooks
    const webhooks = await getMatchingWebhooks(publisherId, type, personaId);

    if (webhooks.length === 0) {
      log.debug({ type, publisherId }, 'No webhooks registered for event');
      return;
    }

    // Create payload
    const payload: WebhookPayload = {
      id: `evt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      type,
      timestamp: new Date().toISOString(),
      publisherId,
      personaId,
      userId,
      sessionId,
      data,
    };

    // Dispatch to all webhooks in parallel (fire and forget with logging)
    const deliveryPromises = webhooks.map(async (webhook) =>
      deliverWebhook(webhook, payload).catch((error) => {
        log.error(
          { webhookId: webhook.id, error: String(error) },
          'Webhook delivery failed unexpectedly'
        );
      })
    );

    // Don't await - let deliveries happen in background
    Promise.all(deliveryPromises).catch(() => {
      // Swallow - individual errors already logged
    });

    log.info(
      { type, publisherId, webhookCount: webhooks.length, eventId: payload.id },
      'Webhook event dispatched'
    );
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ type, publisherId, error: err.message }, 'Failed to dispatch webhook event');
  }
}

// ============================================================================
// WEBHOOK LOOKUP
// ============================================================================

/**
 * Get webhooks that match the event type
 */
async function getMatchingWebhooks(
  publisherId: string,
  eventType: WebhookEventType,
  personaId?: string
): Promise<DeveloperWebhook[]> {
  try {
    const { getFirestore } = await import('../api/v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    // Query enabled webhooks for this publisher that listen to this event type
    const snapshot = await db
      .collection(COLLECTIONS.WEBHOOKS)
      .where('publisherId', '==', publisherId)
      .where('enabled', '==', true)
      .where('events', 'array-contains', eventType)
      .get();

    const webhooks: DeveloperWebhook[] = [];

    for (const doc of snapshot.docs) {
      const data = doc.data() as Record<string, unknown>;

      // If personaId specified, only include webhooks for that persona or all personas
      const webhookPersonaId = data.personaId as string | undefined;
      if (personaId && webhookPersonaId && webhookPersonaId !== personaId) {
        continue;
      }

      webhooks.push({
        ...data,
        id: doc.id,
      } as DeveloperWebhook);
    }

    return webhooks;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ publisherId, eventType, error: err.message }, 'Failed to get matching webhooks');
    return [];
  }
}

// ============================================================================
// DELIVERY
// ============================================================================

/**
 * Deliver webhook with retries
 */
async function deliverWebhook(
  webhook: DeveloperWebhook,
  payload: WebhookPayload
): Promise<DeliveryResult> {
  const maxAttempts = webhook.retryPolicy?.maxAttempts ?? MAX_RETRIES;
  const baseDelay = webhook.retryPolicy?.backoffMs ?? BASE_RETRY_DELAY;
  const multiplier = webhook.retryPolicy?.backoffMultiplier ?? 2;

  let lastResult: DeliveryResult = {
    webhookId: webhook.id,
    success: false,
    attempt: 0,
    executionTimeMs: 0,
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    lastResult = await attemptDelivery(webhook, payload, attempt);

    if (lastResult.success) {
      // Log successful delivery
      await logDelivery(webhook.id, payload, lastResult, 'delivered');
      await updateWebhookStatus(webhook.id, true);
      return lastResult;
    }

    // Calculate retry delay with exponential backoff
    if (attempt < maxAttempts) {
      const delay = Math.min(baseDelay * Math.pow(multiplier, attempt - 1), MAX_RETRY_DELAY);
      log.debug(
        { webhookId: webhook.id, attempt, delay, error: lastResult.error },
        'Retrying webhook delivery'
      );
      await sleep(delay);
    }
  }

  // All attempts failed
  await logDelivery(webhook.id, payload, lastResult, 'failed');
  await updateWebhookStatus(webhook.id, false);

  log.warn(
    { webhookId: webhook.id, attempts: maxAttempts, error: lastResult.error },
    'Webhook delivery failed after all retries'
  );

  return lastResult;
}

/**
 * Single delivery attempt
 */
async function attemptDelivery(
  webhook: DeveloperWebhook,
  payload: WebhookPayload,
  attempt: number
): Promise<DeliveryResult> {
  const startTime = Date.now();
  const signature = signPayload(webhook.secret, payload);

  try {
    const controller = new globalThis.AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Id': webhook.id,
        'X-Event-Id': payload.id,
        'User-Agent': 'Ferni-Webhooks/1.0',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const executionTimeMs = Date.now() - startTime;

    if (response.ok) {
      log.debug(
        { webhookId: webhook.id, statusCode: response.status, executionTimeMs, attempt },
        'Webhook delivered'
      );

      return {
        webhookId: webhook.id,
        success: true,
        statusCode: response.status,
        attempt,
        executionTimeMs,
      };
    }

    // Non-2xx response
    const errorBody = await response.text().catch(() => '');

    return {
      webhookId: webhook.id,
      success: false,
      statusCode: response.status,
      error: `HTTP ${response.status}: ${errorBody.slice(0, 200)}`,
      attempt,
      executionTimeMs,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const executionTimeMs = Date.now() - startTime;

    const errorMessage = err.name === 'AbortError' ? 'Request timeout' : err.message;

    return {
      webhookId: webhook.id,
      success: false,
      error: errorMessage,
      attempt,
      executionTimeMs,
    };
  }
}

// ============================================================================
// LOGGING & STATUS
// ============================================================================

/**
 * Log webhook delivery attempt
 */
async function logDelivery(
  webhookId: string,
  payload: WebhookPayload,
  result: DeliveryResult,
  status: WebhookDeliveryStatus
): Promise<void> {
  try {
    const { getFirestore } = await import('../api/v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    const logEntry: Omit<WebhookDeliveryLog, 'id'> = {
      webhookId,
      eventId: payload.id,
      eventType: payload.type,
      status,
      statusCode: result.statusCode,
      error: result.error,
      attempt: result.attempt,
      deliveredAt: result.success ? new Date() : undefined,
      createdAt: new Date(),
    };

    // Use type assertion for Firestore add method
    await (db.collection(COLLECTIONS.WEBHOOK_LOGS) as any).add(logEntry);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ webhookId, error: err.message }, 'Failed to log webhook delivery');
  }
}

/**
 * Update webhook status after delivery
 */
async function updateWebhookStatus(webhookId: string, success: boolean): Promise<void> {
  try {
    const { getFirestore } = await import('../api/v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (success) {
      updates.lastDeliveredAt = new Date();
      updates.failureCount = 0;
    } else {
      // Increment failure count - auto-disable after too many failures
      const doc = await db.collection(COLLECTIONS.WEBHOOKS).doc(webhookId).get();
      const currentFailures = (doc.data()?.failureCount as number) || 0;
      const newFailureCount = currentFailures + 1;
      updates.failureCount = newFailureCount;

      // Auto-disable after 10 consecutive failures
      if (newFailureCount >= 10) {
        updates.enabled = false;
        log.warn({ webhookId, failureCount: newFailureCount }, 'Webhook auto-disabled');
      }
    }

    await db.collection(COLLECTIONS.WEBHOOKS).doc(webhookId).update(updates);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ webhookId, error: err.message }, 'Failed to update webhook status');
  }
}

// ============================================================================
// HELPERS
// ============================================================================

async function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Dispatch session.started event
 */
export async function dispatchSessionStarted(
  publisherId: string,
  sessionId: string,
  options: {
    personaId?: string;
    userId?: string;
    data?: Record<string, unknown>;
  } = {}
): Promise<void> {
  return dispatchWebhookEvent({
    type: 'session.started',
    publisherId,
    sessionId,
    personaId: options.personaId,
    userId: options.userId,
    data: {
      sessionId,
      ...options.data,
    },
  });
}

/**
 * Dispatch session.ended event
 */
export async function dispatchSessionEnded(
  publisherId: string,
  sessionId: string,
  options: {
    personaId?: string;
    userId?: string;
    duration?: number;
    data?: Record<string, unknown>;
  } = {}
): Promise<void> {
  return dispatchWebhookEvent({
    type: 'session.ended',
    publisherId,
    sessionId,
    personaId: options.personaId,
    userId: options.userId,
    data: {
      sessionId,
      duration: options.duration,
      ...options.data,
    },
  });
}

/**
 * Dispatch tool.called event
 */
export async function dispatchToolCalled(
  publisherId: string,
  options: {
    sessionId?: string;
    personaId?: string;
    userId?: string;
    toolName: string;
    toolDomain: string;
    args?: Record<string, unknown>;
  }
): Promise<void> {
  return dispatchWebhookEvent({
    type: 'tool.called',
    publisherId,
    sessionId: options.sessionId,
    personaId: options.personaId,
    userId: options.userId,
    data: {
      toolName: options.toolName,
      toolDomain: options.toolDomain,
      args: options.args,
    },
  });
}

/**
 * Dispatch tool.completed event
 */
export async function dispatchToolCompleted(
  publisherId: string,
  options: {
    sessionId?: string;
    personaId?: string;
    userId?: string;
    toolName: string;
    toolDomain: string;
    result?: unknown;
    executionTimeMs?: number;
  }
): Promise<void> {
  return dispatchWebhookEvent({
    type: 'tool.completed',
    publisherId,
    sessionId: options.sessionId,
    personaId: options.personaId,
    userId: options.userId,
    data: {
      toolName: options.toolName,
      toolDomain: options.toolDomain,
      result: options.result,
      executionTimeMs: options.executionTimeMs,
    },
  });
}

/**
 * Dispatch tool.failed event
 */
export async function dispatchToolFailed(
  publisherId: string,
  options: {
    sessionId?: string;
    personaId?: string;
    userId?: string;
    toolName: string;
    toolDomain: string;
    error: string;
  }
): Promise<void> {
  return dispatchWebhookEvent({
    type: 'tool.failed',
    publisherId,
    sessionId: options.sessionId,
    personaId: options.personaId,
    userId: options.userId,
    data: {
      toolName: options.toolName,
      toolDomain: options.toolDomain,
      error: options.error,
    },
  });
}

export default {
  dispatchWebhookEvent,
  dispatchSessionStarted,
  dispatchSessionEnded,
  dispatchToolCalled,
  dispatchToolCompleted,
  dispatchToolFailed,
  signPayload,
  verifySignature,
};

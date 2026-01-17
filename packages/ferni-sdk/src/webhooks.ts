/**
 * Webhook signature verification utilities
 *
 * Verify webhook authenticity using HMAC-SHA256:
 * signature = HMAC-SHA256(secret, timestamp + "." + payload)
 *
 * Header format: X-Webhook-Signature: t=1234567890,v1=abc123...
 */

import type { WebhookPayload, WebhookEventType } from './types.js';

const TOLERANCE_SECONDS = 300; // 5 minutes

export interface WebhookSignature {
  timestamp: number;
  signature: string;
}

/**
 * Parse the X-Webhook-Signature header
 */
export function parseSignatureHeader(header: string): WebhookSignature | null {
  const parts = header.split(',');
  let timestamp: number | undefined;
  let signature: string | undefined;

  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key === 't') {
      timestamp = parseInt(value, 10);
    } else if (key === 'v1') {
      signature = value;
    }
  }

  if (timestamp === undefined || signature === undefined) {
    return null;
  }

  return { timestamp, signature };
}

/**
 * Compute the expected signature for a webhook payload
 */
export async function computeSignature(
  secret: string,
  timestamp: number,
  payload: string
): Promise<string> {
  const signatureInput = `${timestamp}.${payload}`;

  // Use Web Crypto API (works in Node 18+ and browsers)
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(signatureInput)
  );

  // Convert to hex string
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Verify a webhook signature
 *
 * @param payload The raw request body as a string
 * @param signature The X-Webhook-Signature header value
 * @param secret Your webhook secret
 * @param toleranceSeconds Max age of webhook in seconds (default 300)
 * @returns True if signature is valid
 *
 * @example
 * ```typescript
 * import { verifyWebhookSignature } from '@ferni/sdk';
 *
 * const isValid = await verifyWebhookSignature(
 *   request.body,
 *   request.headers['x-webhook-signature'],
 *   process.env.WEBHOOK_SECRET
 * );
 * ```
 */
export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
  toleranceSeconds: number = TOLERANCE_SECONDS
): Promise<boolean> {
  const parsed = parseSignatureHeader(signature);
  if (!parsed) {
    return false;
  }

  const { timestamp, signature: receivedSig } = parsed;

  // Check timestamp is within tolerance
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    return false;
  }

  // Compute expected signature
  const expectedSig = await computeSignature(secret, timestamp, payload);

  // Constant-time comparison to prevent timing attacks
  if (receivedSig.length !== expectedSig.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < receivedSig.length; i++) {
    result |= receivedSig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Parse and validate a webhook payload
 *
 * @param body Raw request body
 * @param signature X-Webhook-Signature header
 * @param secret Your webhook secret
 * @returns Parsed and validated webhook payload
 * @throws Error if signature is invalid
 *
 * @example
 * ```typescript
 * import { parseWebhookEvent } from '@ferni/sdk';
 *
 * const event = await parseWebhookEvent(
 *   req.body,
 *   req.headers['x-webhook-signature'],
 *   process.env.WEBHOOK_SECRET
 * );
 *
 * switch (event.type) {
 *   case 'session.started':
 *     console.log('Session started:', event.data);
 *     break;
 *   case 'transcript.ready':
 *     console.log('Transcript:', event.data.transcript);
 *     break;
 * }
 * ```
 */
export async function parseWebhookEvent(
  body: string,
  signature: string,
  secret: string
): Promise<WebhookPayload> {
  const isValid = await verifyWebhookSignature(body, signature, secret);

  if (!isValid) {
    throw new Error('Invalid webhook signature');
  }

  return JSON.parse(body) as WebhookPayload;
}

/**
 * Type guard for specific webhook event types
 */
export function isEventType<T extends WebhookEventType>(
  event: WebhookPayload,
  type: T
): event is WebhookPayload & { type: T } {
  return event.type === type;
}

/**
 * Webhook event handlers type for type-safe event handling
 */
export type WebhookEventHandlers = {
  [K in WebhookEventType]?: (event: WebhookPayload & { type: K }) => void | Promise<void>;
};

/**
 * Create a typed webhook event router
 *
 * @example
 * ```typescript
 * import { createWebhookRouter } from '@ferni/sdk';
 *
 * const router = createWebhookRouter({
 *   'session.started': async (event) => {
 *     console.log('Session started:', event.data);
 *   },
 *   'session.ended': async (event) => {
 *     console.log('Session ended after', event.data.duration, 'seconds');
 *   },
 *   'transcript.ready': async (event) => {
 *     await saveTranscript(event.data.transcript);
 *   },
 * });
 *
 * // In your webhook handler:
 * const event = await parseWebhookEvent(body, signature, secret);
 * await router(event);
 * ```
 */
export function createWebhookRouter(
  handlers: WebhookEventHandlers
): (event: WebhookPayload) => Promise<void> {
  return async (event: WebhookPayload) => {
    const handler = handlers[event.type];
    if (handler) {
      await handler(event as never);
    }
  };
}

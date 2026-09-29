/**
 * Webhook signature helpers for raw-HTTP routes.
 *
 * - Twilio: HMAC-SHA1 over URL + sorted form params (`X-Twilio-Signature`).
 * - SendGrid Signed Event Webhook: ECDSA P-256/SHA-256 over timestamp + raw body
 *   (`X-Twilio-Email-Event-Webhook-Signature` / `-Timestamp`), verified with the
 *   base64 DER public key from the SendGrid dashboard (`SENDGRID_WEBHOOK_KEY`).
 */

import { createPublicKey, verify as cryptoVerify } from 'crypto';
import type { IncomingMessage } from 'http';
import { parseRawBody } from './helpers.js';
import {
  twilioSignedUrls,
  validateTwilioSignature,
} from '../services/outreach/webhooks/twilio-webhooks.js';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'webhook-signatures' });

const MAX_WEBHOOK_BYTES = 64 * 1024;

/** Maximum clock skew accepted for SendGrid signed events (seconds). */
const SENDGRID_MAX_SKEW_SECONDS = 10 * 60;

export const SENDGRID_SIGNATURE_HEADER = 'x-twilio-email-event-webhook-signature';
export const SENDGRID_TIMESTAMP_HEADER = 'x-twilio-email-event-webhook-timestamp';

function headerValue(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Read a Twilio form-encoded callback and verify its signature.
 *
 * @returns the form params when the signature is valid, `null` otherwise
 *          (missing header, bad signature, or no TWILIO_AUTH_TOKEN).
 */
export async function readSignedTwilioParams(
  req: IncomingMessage
): Promise<Record<string, string> | null> {
  const raw = await parseRawBody(req, { timeoutMs: 10000, maxBytes: MAX_WEBHOOK_BYTES });
  const params = Object.fromEntries(new URLSearchParams(raw));
  const signature = headerValue(req, 'x-twilio-signature');
  if (!signature) {
    log.warn({ path: req.url }, 'Twilio webhook rejected: missing signature header');
    return null;
  }
  if (!validateTwilioSignature(signature, twilioSignedUrls(req.headers, req.url), params)) {
    log.warn({ path: req.url }, 'Twilio webhook rejected: invalid signature');
    return null;
  }
  return params;
}

/**
 * Verify a SendGrid Signed Event Webhook payload.
 *
 * @param publicKeyBase64 - base64 DER (SPKI) ECDSA public key from SendGrid
 * @param rawBody - exact request body bytes as a string
 * @param signature - base64 DER ECDSA signature header
 * @param timestamp - timestamp header (unix seconds)
 */
export function verifySendGridSignature(
  publicKeyBase64: string,
  rawBody: string,
  signature: string | undefined,
  timestamp: string | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): boolean {
  if (!signature || !timestamp) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > SENDGRID_MAX_SKEW_SECONDS) {
    return false;
  }
  try {
    const key = createPublicKey({
      key: Buffer.from(publicKeyBase64, 'base64'),
      format: 'der',
      type: 'spki',
    });
    return cryptoVerify(
      'sha256',
      Buffer.from(timestamp + rawBody),
      key,
      Buffer.from(signature, 'base64')
    );
  } catch (error) {
    log.warn({ error: String(error) }, 'SendGrid signature verification error');
    return false;
  }
}

export type SendGridWebhookCheck =
  | { ok: true; rawBody: string }
  | { ok: false; status: 403 | 503; reason: string };

/**
 * Read a SendGrid webhook body and verify it when `SENDGRID_WEBHOOK_KEY` is set.
 *
 * - Key configured: rejects (403) on a missing or invalid signature.
 * - Key not configured: rejects (503) in production so the endpoint is never an
 *   unauthenticated write path; allowed (with a warning) in development.
 */
export async function readSignedSendGridBody(req: IncomingMessage): Promise<SendGridWebhookCheck> {
  const rawBody = await parseRawBody(req, { timeoutMs: 10000, maxBytes: MAX_WEBHOOK_BYTES });
  const publicKey = process.env.SENDGRID_WEBHOOK_KEY;

  if (!publicKey) {
    if (process.env.NODE_ENV === 'production') {
      log.error('SendGrid webhook rejected: SENDGRID_WEBHOOK_KEY not configured');
      return { ok: false, status: 503, reason: 'Webhook verification not configured' };
    }
    log.warn('SENDGRID_WEBHOOK_KEY not set; accepting unsigned webhook (non-production)');
    return { ok: true, rawBody };
  }

  const valid = verifySendGridSignature(
    publicKey,
    rawBody,
    headerValue(req, SENDGRID_SIGNATURE_HEADER),
    headerValue(req, SENDGRID_TIMESTAMP_HEADER)
  );
  if (!valid) {
    log.warn({ path: req.url }, 'SendGrid webhook rejected: invalid or missing signature');
    return { ok: false, status: 403, reason: 'Invalid signature' };
  }
  return { ok: true, rawBody };
}

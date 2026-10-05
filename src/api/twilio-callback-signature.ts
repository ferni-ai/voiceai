/**
 * Twilio-signed callbacks: requests Twilio makes carry no user, so they are
 * admitted on a valid X-Twilio-Signature instead — never on a user token, and
 * never with the header missing.
 *
 * Under /api/group, the voice agent's ConferenceCallManager points Twilio at
 * two paths that skip the engagement router's user check (engagement-routes.ts).
 *
 * @module api/twilio-callback-signature
 */

import type { IncomingMessage } from 'http';
import type { NextFunction, Request, Response } from 'express';
import { validateTwilioSignature } from '../services/outreach/webhooks/twilio-webhooks.js';
import { getLogger } from '../utils/safe-logger.js';

const log = getLogger();

/** Exact pathnames Twilio calls back on (see conference-call-manager.ts initiateCall). */
export const GROUP_TWILIO_CALLBACK_PATHS: ReadonlySet<string> = new Set([
  '/api/group/call/answer',
  '/api/group/call/status',
]);

/** Form fields Twilio posted; a repeated or non-string field can't match a signature. */
function postedParams(req: Request): Record<string, string> {
  const body = req.body as unknown;
  if (req.method !== 'POST' || typeof body !== 'object' || body === null) return {};
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'string') params[key] = value;
  }
  return params;
}

/**
 * True only when X-Twilio-Signature is present and matches the URL Twilio
 * called (rebuilt behind the proxy the same way twilio-routes.ts and
 * family-checkin-webhook-routes.ts do) plus the posted form fields. With no
 * auth token configured the validator refuses everything.
 */
export function isSignedByTwilio(
  req: IncomingMessage,
  pathAndQuery: string,
  params: Record<string, string>
): boolean {
  const signature = req.headers['x-twilio-signature'];
  if (typeof signature !== 'string' || !signature) return false;
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = typeof forwardedProto === 'string' ? forwardedProto : 'https';
  const host = req.headers.host ?? '';
  return validateTwilioSignature(signature, `${protocol}://${host}${pathAndQuery}`, params);
}

/** Express middleware: 403 unless isSignedByTwilio. */
export function requireTwilioSignature(req: Request, res: Response, next: NextFunction): void {
  if (!isSignedByTwilio(req, req.originalUrl, postedParams(req))) {
    log.warn({ path: req.path }, 'Missing or invalid Twilio signature');
    res.status(403).json({ error: 'Invalid signature' });
    return;
  }
  next();
}

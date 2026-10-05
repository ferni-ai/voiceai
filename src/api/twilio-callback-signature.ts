/**
 * Twilio-signed callbacks under /api/group.
 *
 * The voice agent's ConferenceCallManager points Twilio at two paths on this
 * server. Twilio has no user to sign in as, so these paths skip the engagement
 * router's user check (engagement-routes.ts) and are admitted on a valid
 * X-Twilio-Signature instead — never on a user token.
 *
 * @module api/twilio-callback-signature
 */

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
 * Express middleware: 403 unless X-Twilio-Signature matches the URL Twilio
 * called (rebuilt behind the proxy the same way twilio-routes.ts and
 * family-checkin-webhook-routes.ts do) plus, for a POST, its form fields.
 * With no auth token configured the validator refuses everything.
 */
export function requireTwilioSignature(req: Request, res: Response, next: NextFunction): void {
  const signature = req.headers['x-twilio-signature'];
  if (typeof signature !== 'string' || !signature) {
    log.warn({ path: req.path }, 'Missing Twilio signature header');
    res.status(403).json({ error: 'Missing signature' });
    return;
  }

  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = typeof forwardedProto === 'string' ? forwardedProto : 'https';
  const host = req.headers.host ?? '';
  const fullUrl = `${protocol}://${host}${req.originalUrl}`;

  if (!validateTwilioSignature(signature, fullUrl, postedParams(req))) {
    log.warn({ path: req.path }, 'Invalid Twilio signature');
    res.status(403).json({ error: 'Invalid signature' });
    return;
  }
  next();
}

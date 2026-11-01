/**
 * Twilio-signed callbacks: requests Twilio makes carry no user, so they are
 * admitted on a valid X-Twilio-Signature instead — never on a user token, and
 * never with the header missing. Every Twilio webhook route checks through
 * here.
 *
 * Under /api/group, the voice agent's ConferenceCallManager points Twilio at
 * two paths that skip the engagement router's user check (engagement-routes.ts).
 *
 * @module api/twilio-callback-signature
 */

import type { IncomingMessage } from 'http';
import type { NextFunction, Request, Response } from 'express';
import { twilioCallbackOrigins } from '../services/outreach/webhooks/twilio-callback-url.js';
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
 * The public URL this request's X-Twilio-Signature is valid for, or null.
 *
 * Twilio signed the URL we gave it: one of our configured public origins plus
 * the path and query as received. The Host and X-Forwarded-* headers are not
 * read — behind Firebase Hosting the Host is the run.app host, and a header
 * the caller controls must not choose what is checked (#2679). With no auth
 * token configured the validator refuses everything.
 */
export function twilioSignedUrl(
  req: IncomingMessage,
  pathAndQuery: string,
  params: Record<string, string>
): string | null {
  const signature = req.headers['x-twilio-signature'];
  if (typeof signature !== 'string' || !signature || !pathAndQuery.startsWith('/')) return null;
  const urls = twilioCallbackOrigins().map((origin) => `${origin}${pathAndQuery}`);
  return urls.find((url) => validateTwilioSignature(signature, url, params)) ?? null;
}

/** True only when X-Twilio-Signature is present and valid (see twilioSignedUrl). */
export function isSignedByTwilio(
  req: IncomingMessage,
  pathAndQuery: string,
  params: Record<string, string>
): boolean {
  return twilioSignedUrl(req, pathAndQuery, params) !== null;
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

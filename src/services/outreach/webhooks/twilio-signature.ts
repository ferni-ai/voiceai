/**
 * Twilio webhook signature validation (and the auth token it uses).
 * Extracted from twilio-webhooks.ts.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import type { IncomingHttpHeaders } from 'http';
import { getLogger } from '../../../utils/safe-logger.js';

const log = getLogger().child({ module: 'twilio-webhooks' });

let twilioAuthToken: string | null = null;

/**
 * Initialize webhook handlers with Twilio auth token
 */
export function initializeTwilioWebhooks(authToken: string): void {
  twilioAuthToken = authToken;
  log.info('✅ Twilio webhook handlers initialized');
}

/**
 * URLs Twilio may have signed for this request. Behind Firebase Hosting the
 * Host header is the Cloud Run host, while Twilio signed the public URL
 * (x-forwarded-host / PUBLIC_URL), so each candidate is tried.
 */
export function twilioSignedUrls(headers: IncomingHttpHeaders, path: string | undefined): string[] {
  const first = (v: string | string[] | undefined) =>
    (Array.isArray(v) ? v[0] : v)?.split(',')[0]?.trim();
  const proto = first(headers['x-forwarded-proto']) || 'https';
  const hosts = [first(headers['x-forwarded-host']), first(headers.host)].filter(
    Boolean
  ) as string[];
  const urls = hosts.map((host) => `${proto}://${host}${path ?? ''}`);
  if (process.env.PUBLIC_URL)
    urls.push(`${process.env.PUBLIC_URL.replace(/\/$/, '')}${path ?? ''}`);
  return [...new Set(urls)];
}

/**
 * Validate Twilio webhook signature (HMAC-SHA1 of URL + sorted params).
 * Reads TWILIO_AUTH_TOKEN from the environment unless initialised explicitly,
 * so webhooks work without the (disabled) outreach bootstrap.
 */
export function validateTwilioSignature(
  signature: string,
  url: string | string[],
  params: Record<string, string>
): boolean {
  const token = twilioAuthToken ?? process.env.TWILIO_AUTH_TOKEN;
  if (!token) {
    log.warn('Cannot validate signature - TWILIO_AUTH_TOKEN not set');
    return false;
  }

  try {
    const sortedKeys = Object.keys(params).sort();
    const given = Buffer.from(signature);
    return (Array.isArray(url) ? url : [url]).some((candidate) => {
      let data = candidate;
      for (const key of sortedKeys) {
        data += key + params[key];
      }
      const expected = Buffer.from(createHmac('sha1', token).update(data).digest('base64'));
      return expected.length === given.length && timingSafeEqual(expected, given);
    });
  } catch (error) {
    log.error({ error }, 'Signature validation error');
    return false;
  }
}

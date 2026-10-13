/**
 * One-click waitlist approval links: signing and verification.
 *
 * The signing key comes only from WAITLIST_APPROVAL_SECRET. There is no
 * default: this repo is public, so any fallback value is a published key that
 * lets anyone mint approval links. When the env var is unset (or too short to
 * be a real key) nothing is signed and every link is refused.
 *
 * @module WaitlistApprovalToken
 */

import crypto from 'crypto';

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'waitlist-approval-token' });

const DAY_MS = 24 * 60 * 60 * 1000;
/** `openssl rand -hex 32` gives 64; anything under 32 is not a real key. */
const MIN_SECRET_LENGTH = 32;
const APPROVE_URL_BASE = 'https://app.ferni.ai/api/waitlist/approve/';
/** Where the admin email points when links can't be signed (manual approval lives there). */
export const WAITLIST_ADMIN_URL = 'https://ferni.ai/admin/waitlist/';

/** The approval signing key, or null when it is missing or too short to trust. */
export function getApprovalSecret(): string | null {
  const secret = process.env.WAITLIST_APPROVAL_SECRET?.trim();
  if (!secret) return null;
  if (secret.length < MIN_SECRET_LENGTH) {
    log.error(
      { env: 'WAITLIST_APPROVAL_SECRET', length: secret.length, minLength: MIN_SECRET_LENGTH },
      'Waitlist approval secret is too short; one-click approval disabled'
    );
    return null;
  }
  return secret;
}

function signForDay(email: string, secret: string, day: number): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`${email}:${day}`)
    .digest('hex')
    .substring(0, 32);
}

/** Token for `email`, valid today and tomorrow (the day it was minted plus one rollover). */
export function generateApprovalToken(email: string, secret: string, now = Date.now()): string {
  return signForDay(email, secret, Math.floor(now / DAY_MS));
}

/** True when `token` was signed with `secret` for `email` today or yesterday. */
export function verifyApprovalToken(
  email: string,
  token: string,
  secret: string,
  now = Date.now()
): boolean {
  const today = Math.floor(now / DAY_MS);
  const given = Buffer.from(token);
  return [today, today - 1].some((day) => {
    const expected = Buffer.from(signForDay(email, secret, day));
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}

/**
 * The one-click approve link for the admin email, or the admin waitlist page
 * when no secret is configured (so signups still notify, just without a link).
 */
export function buildApprovalUrl(email: string): string {
  const secret = getApprovalSecret();
  if (!secret) {
    log.error(
      { env: 'WAITLIST_APPROVAL_SECRET' },
      'Waitlist approval secret unset; admin email links to the admin page instead'
    );
    return WAITLIST_ADMIN_URL;
  }
  const token = generateApprovalToken(email, secret);
  return `${APPROVE_URL_BASE}${token}?email=${encodeURIComponent(email)}`;
}

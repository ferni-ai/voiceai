/**
 * Who a request is, for rate limiting.
 *
 * The synchronous authenticate() can't verify Firebase tokens, so the global
 * limiter keyed every signed-in user by IP as if anonymous: people behind one
 * office or mobile-carrier address shared a single bucket, and an app load (a
 * few dozen API calls) could throttle all of them. Verifying the token once and
 * caching the uid until it nears expiry lets the limiter count per person.
 */

import type { IncomingMessage } from 'http';
import { isVerifiedToken, verifyFirebaseToken } from '../services/identity/firebase-auth.js';
import { getClientIp } from '../utils/ddos-protection.js';
import { checkRateLimit } from './auth-middleware.js';

/** How long a rejected token stays rejected before it is checked again */
const INVALID_TTL_MS = 30_000;
/** Stop trusting a cached uid this long before its token expires */
const EXPIRY_MARGIN_MS = 60_000;
const MAX_ENTRIES = 10_000;
/**
 * Unseen tokens one IP may have verified per minute. Verification runs before
 * the limiter, so without this a stream of random tokens is free work; past
 * the budget a request is simply limited by its IP.
 */
const VERIFY_BUDGET_PER_IP = 30;

const cache = new Map<string, { uid: string | null; until: number }>();

function remember(token: string, uid: string | null, until: number): void {
  if (cache.size >= MAX_ENTRIES) {
    // Maps iterate in insertion order: drop the oldest entry
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(token, { uid, until });
}

/** The verified uid behind the request's Bearer token, or null for anonymous/invalid. */
export async function rateLimitUid(req: IncomingMessage, now = Date.now()): Promise<string | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7);

  const hit = cache.get(token);
  if (hit && hit.until > now) return hit.uid;
  if (!checkRateLimit(`verify-token:${getClientIp(req)}`, VERIFY_BUDGET_PER_IP, 60_000).allowed) return null;

  let uid: string | null = null;
  let until = now + INVALID_TTL_MS;
  try {
    const result = await verifyFirebaseToken(token);
    if (isVerifiedToken(result)) {
      uid = result.uid;
      until = Math.max(now, result.expiresAt * 1000 - EXPIRY_MARGIN_MS);
    }
  } catch {
    // Verification unavailable: fall back to the IP key, never fail the request here
  }
  remember(token, uid, until);
  return uid;
}

/** For tests */
export function clearRateLimitIdentityCache(): void {
  cache.clear();
}

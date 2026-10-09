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

/** Stop trusting a cached uid this long before its token expires */
const EXPIRY_MARGIN_MS = 60_000;
const MAX_ENTRIES = 10_000;

const cache = new Map<string, { uid: string; until: number }>();

function remember(token: string, uid: string, until: number): void {
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

  // Verification is a signature check against cached Google keys: cheap enough to
  // run per unseen token. Nothing here is keyed on the client IP, which a caller
  // can spoof through X-Forwarded-For to lock someone else out.
  try {
    const result = await verifyFirebaseToken(token);
    if (!isVerifiedToken(result)) return null;
    // Only real tokens are cached, so a flood of junk can't evict them
    remember(token, result.uid, Math.max(now, result.expiresAt * 1000 - EXPIRY_MARGIN_MS));
    return result.uid;
  } catch {
    return null; // verification unavailable: limited by IP, never failed here
  }
}

/** For tests */
export function clearRateLimitIdentityCache(): void {
  cache.clear();
}

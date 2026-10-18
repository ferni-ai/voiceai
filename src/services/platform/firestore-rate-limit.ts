/**
 * A rate limit counted in Firestore, so it holds across every instance.
 *
 * rateLimiter.checkShared is for spend caps (journal transcription, web search)
 * that must hold across instances. Redis held them until it was dropped. Counting
 * in each instance's memory instead would multiply every cap by the instance count
 * (john-bogle-ui scales to 10), so without Redis the count lives in Firestore: one
 * document per key and window in `rate_limits`, changed in a transaction.
 *
 * Old windows are never read again. A Firestore TTL policy on
 * `rate_limits.expireAt` deletes them; creating that policy is an infra step.
 *
 * @module services/platform/firestore-rate-limit
 */

import { createHash } from 'crypto';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { RateLimitResult } from './rate-limiter.js';

const log = createLogger({ module: 'FirestoreRateLimit' });

export const RATE_LIMIT_COLLECTION = 'rate_limits';

/** Keys longer than this (encoded) are hashed, to stay well inside Firestore's id limit. */
const MAX_ENCODED_KEY_CHARS = 400;

/**
 * Whether checkShared should count in Firestore when no Redis is configured: on
 * Google Cloud (Cloud Run sets K_SERVICE) or against the Firestore emulator. Local
 * development with neither counts in memory, as before.
 */
export function wantsFirestoreSharedLimits(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.NODE_ENV === 'production' ||
    !!env.K_SERVICE ||
    !!env.GOOGLE_CLOUD_PROJECT ||
    !!env.FIRESTORE_EMULATOR_HOST
  );
}

/**
 * The document id for a key's window. encodeURIComponent turns `/` (not allowed in an
 * id) and `@` into escapes, so the `@` before the window start can't collide with a key.
 */
export function rateLimitDocId(key: string, windowStart: number): string {
  const encoded = encodeURIComponent(key);
  const id =
    encoded.length <= MAX_ENCODED_KEY_CHARS
      ? encoded
      : createHash('sha256').update(key).digest('hex');
  return `${id}@${windowStart}`;
}

/**
 * Count `cost` against `key` in its fixed window, atomically across instances.
 * Refuses, without counting, when the count would pass `maxRequests`. Throws on any
 * Firestore error; the caller fails closed.
 */
export async function countInFirestore(
  key: string,
  maxRequests: number,
  windowMs: number,
  cost: number,
  now = Date.now()
): Promise<RateLimitResult> {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore unavailable');
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const resetAt = windowStart + windowMs;
  const ref = db.collection(RATE_LIMIT_COLLECTION).doc(rateLimitDocId(key, windowStart));

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const stored: unknown = snap.exists ? snap.get('count') : 0;
    const count = typeof stored === 'number' && Number.isFinite(stored) ? stored : 0;
    if (count + cost > maxRequests) {
      return { allowed: false, remaining: Math.max(0, maxRequests - count), resetAt };
    }
    tx.set(ref, { key, count: count + cost, resetAt, expireAt: new Date(resetAt) });
    return { allowed: true, remaining: maxRequests - count - cost, resetAt };
  });
}

/** countInFirestore, or null (fail closed) on any Firestore error. */
export async function checkSharedInFirestore(
  key: string,
  maxRequests: number,
  windowMs: number,
  cost: number
): Promise<RateLimitResult | null> {
  try {
    return await countInFirestore(key, maxRequests, windowMs, cost);
  } catch (error) {
    log.error(
      { error: String(error), keyPrefix: key.split(':')[0] },
      'rate_limit_firestore_unavailable'
    );
    return null;
  }
}

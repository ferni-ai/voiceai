/**
 * Spend limits for POST /api/journal/transcribe.
 *
 * rateLimit() counts in the memory of one Cloud Run instance, so its real
 * limit is N times the number of instances. These checks go through
 * checkRateLimitAsync, which counts in Redis when REDIS_URL is set (shared by
 * every instance) and falls back to memory otherwise.
 *
 * Every key has a per-minute and a per-hour cap, so a steady caller can't
 * spend a day's budget a minute at a time. There is no shared ceiling for
 * everyone: a global hourly cap let one address drain it in minutes and lock
 * out real people. Instead anonymous callers, whose uids are free to mint,
 * share one hourly pool (TRANSCRIBE_ANON_MAX_PER_HOUR, default 200).
 * Signed-in people are never blocked by a shared pool.
 *
 * @module api/journal-transcribe-limits
 */

import type { ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import { checkRateLimitAsync } from './auth-middleware.js';
import { sendJSON } from './helpers.js';

const log = createLogger({ module: 'journal-transcribe-limits' });

const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;

/** Calls per key per window. An IP is an IPv4 address or an IPv6 /64 (rate-limit-ip-key.ts). */
export const TRANSCRIBE_LIMITS = {
  /** Everyone behind one IP together. */
  ip: { perMinute: 30, perHour: 90 },
  /** One signed-in person, by verified uid. */
  user: { perMinute: 10, perHour: 60 },
  /** Anonymous callers, by IP: their uids are minted on demand, so the uid means nothing. */
  anon: { perMinute: 10, perHour: 20 },
} as const;

export const DEFAULT_ANON_MAX_PER_HOUR = 200;
export const ANON_POOL_KEY = 'expensive:journal-transcribe:anon-pool';

/** TRANSCRIBE_ANON_MAX_PER_HOUR, or the default when unset or not a positive whole number. */
export function anonMaxPerHour(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.TRANSCRIBE_ANON_MAX_PER_HOUR?.trim() ?? '';
  const value = /^\d+$/.test(raw) ? Number(raw) : NaN;
  return value > 0 ? value : DEFAULT_ANON_MAX_PER_HOUR;
}

function retryAfterSeconds(resetAt: number): number {
  return Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
}

/** True, with a 429 sent, when `key` has used its `max` calls in this window. */
async function overLimit(
  res: ServerResponse,
  key: string,
  max: number,
  windowMs: number
): Promise<boolean> {
  const result = await checkRateLimitAsync(key, max, windowMs);
  res.setHeader('X-RateLimit-Limit', max);
  res.setHeader('X-RateLimit-Remaining', result.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));
  if (result.allowed) return false;
  const retryAfter = retryAfterSeconds(result.resetAt);
  res.setHeader('Retry-After', retryAfter);
  sendJSON(res, { error: 'Rate limit exceeded. Please try again later.', retryAfter }, 429);
  return true;
}

let warnedForWindow = -1;

/** True, with a 503 sent, when the anonymous pool for this hour is used up. Warns once per window. */
async function overAnonPool(res: ServerResponse): Promise<boolean> {
  const max = anonMaxPerHour();
  const result = await checkRateLimitAsync(ANON_POOL_KEY, max, HOUR_MS);
  if (result.allowed) return false;
  if (warnedForWindow !== result.resetAt) {
    warnedForWindow = result.resetAt;
    log.warn(
      { maxPerHour: max, resetAt: new Date(result.resetAt).toISOString() },
      'Anonymous journal transcription pool used up; anonymous callers refused until it resets'
    );
  }
  const retryAfter = retryAfterSeconds(result.resetAt);
  res.setHeader('Retry-After', retryAfter);
  sendJSON(res, { error: 'Busy right now, try again soon.', retryAfter, transcript: '' }, 503);
  return true;
}

/**
 * True, with a 429 or 503 sent, when this call is over any limit. In order:
 * the IP's minute and hour, the person's minute and hour (uid, or the IP for
 * an anonymous caller), then the anonymous pool for anonymous callers only.
 */
export async function refusedByTranscribeLimits(
  res: ServerResponse,
  ip: string,
  caller: { userId: string; isAnonymous?: boolean }
): Promise<boolean> {
  const ipKey = `expensive:journal-transcribe-ip:ip:${ip}`;
  if (await overLimit(res, ipKey, TRANSCRIBE_LIMITS.ip.perMinute, MINUTE_MS)) return true;
  if (await overLimit(res, `${ipKey}:hour`, TRANSCRIBE_LIMITS.ip.perHour, HOUR_MS)) return true;

  const anonymous = caller.isAnonymous === true;
  const tier = anonymous ? TRANSCRIBE_LIMITS.anon : TRANSCRIBE_LIMITS.user;
  const personKey = `expensive:journal-transcribe:${anonymous ? `anon-ip:${ip}` : `user:${caller.userId}`}`;
  if (await overLimit(res, personKey, tier.perMinute, MINUTE_MS)) return true;
  if (await overLimit(res, `${personKey}:hour`, tier.perHour, HOUR_MS)) return true;

  if (!anonymous) return false;
  return overAnonPool(res);
}

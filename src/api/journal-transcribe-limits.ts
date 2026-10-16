/**
 * Spend limits for POST /api/journal/transcribe.
 *
 * rateLimit() counts in the memory of one Cloud Run instance, so its real
 * limit is N times the number of instances. These checks go through
 * checkRateLimitAsync, which counts in Redis when REDIS_URL is set (shared by
 * every instance) and falls back to memory otherwise.
 *
 * Every key has a per-minute and a per-hour cap, so a steady caller can't
 * spend a day's budget a minute at a time. Anonymous callers, whose uids are
 * free to mint, share one hourly pool (TRANSCRIBE_ANON_MAX_PER_HOUR, default
 * 200). Above that, one emergency breaker caps everyone together
 * (TRANSCRIBE_MAX_PER_HOUR, default 2000). It is set far above real use: it
 * exists to bound the bill if many accounts on many addresses spend at once,
 * and tripping it pauses transcription for an hour rather than letting the
 * spend run. Pair it with a billing budget alert.
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
export const DEFAULT_GLOBAL_MAX_PER_HOUR = 2000;
export const GLOBAL_BREAKER_KEY = 'expensive:journal-transcribe:global';

/** `env[name]` as a positive whole number, or `fallback` when unset or anything else. */
function positiveIntEnv(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]?.trim() ?? '';
  const value = /^\d+$/.test(raw) ? Number(raw) : NaN;
  return value > 0 ? value : fallback;
}

/** TRANSCRIBE_ANON_MAX_PER_HOUR, or the default when unset or not a positive whole number. */
export function anonMaxPerHour(env: NodeJS.ProcessEnv = process.env): number {
  return positiveIntEnv(env, 'TRANSCRIBE_ANON_MAX_PER_HOUR', DEFAULT_ANON_MAX_PER_HOUR);
}

/** TRANSCRIBE_MAX_PER_HOUR, or the default when unset or not a positive whole number. */
export function globalMaxPerHour(env: NodeJS.ProcessEnv = process.env): number {
  return positiveIntEnv(env, 'TRANSCRIBE_MAX_PER_HOUR', DEFAULT_GLOBAL_MAX_PER_HOUR);
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

const warnedForWindow = new Map<string, number>();

/** True, with a 503 sent, when the shared pool `key` is used up this hour. Warns once per window. */
async function overSharedPool(
  res: ServerResponse,
  key: string,
  max: number,
  warning: string
): Promise<boolean> {
  const result = await checkRateLimitAsync(key, max, HOUR_MS);
  if (result.allowed) return false;
  if (warnedForWindow.get(key) !== result.resetAt) {
    warnedForWindow.set(key, result.resetAt);
    log.warn({ maxPerHour: max, resetAt: new Date(result.resetAt).toISOString() }, warning);
  }
  const retryAfter = retryAfterSeconds(result.resetAt);
  res.setHeader('Retry-After', retryAfter);
  sendJSON(res, { error: 'Busy right now, try again soon.', retryAfter, transcript: '' }, 503);
  return true;
}

/**
 * True, with a 429 or 503 sent, when this call is over any limit. In order:
 * the IP's minute and hour, the person's minute and hour (uid, or the IP for
 * an anonymous caller), the anonymous pool for anonymous callers only, then
 * the breaker for everyone. A call refused earlier never counts toward a
 * later pool, so per-key abuse can't trip the breaker by itself.
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

  if (
    anonymous &&
    (await overSharedPool(
      res,
      ANON_POOL_KEY,
      anonMaxPerHour(),
      'Anonymous journal transcription pool used up; anonymous callers refused until it resets'
    ))
  ) {
    return true;
  }

  return overSharedPool(
    res,
    GLOBAL_BREAKER_KEY,
    globalMaxPerHour(),
    'Journal transcription breaker tripped; every caller refused until it resets. Check for abuse and the billing alert'
  );
}

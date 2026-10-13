/**
 * Spend limits for POST /api/journal/transcribe.
 *
 * rateLimit() counts in the memory of one Cloud Run instance, so its real
 * limit is N times the number of instances. These checks go through
 * checkRateLimitAsync, which counts in Redis when REDIS_URL is set (shared by
 * every instance) and falls back to memory otherwise.
 *
 * On top of the per-IP and per-person limits there is a ceiling on
 * transcriptions per hour across everyone (TRANSCRIBE_MAX_PER_HOUR, default
 * 300): a circuit breaker on spend, whatever mix of callers and addresses.
 *
 * @module api/journal-transcribe-limits
 */

import type { ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import { checkRateLimitAsync, RATE_LIMIT_TIERS } from './auth-middleware.js';
import { sendJSON } from './helpers.js';

const log = createLogger({ module: 'journal-transcribe-limits' });

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
export const DEFAULT_TRANSCRIBE_MAX_PER_HOUR = 300;

/** Per person: the expensive tier, 10 a minute. */
export const PER_PERSON_PER_MINUTE = RATE_LIMIT_TIERS.expensive.maxRequests;
/** Everyone behind one address (or one IPv6 /64) together: three people's worth. */
export const PER_IP_PER_MINUTE = PER_PERSON_PER_MINUTE * 3;

/** TRANSCRIBE_MAX_PER_HOUR, or the default when unset or not a positive whole number. */
export function transcribeMaxPerHour(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.TRANSCRIBE_MAX_PER_HOUR?.trim();
  const value = raw ? Number(raw) : NaN;
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_TRANSCRIBE_MAX_PER_HOUR;
}

/** True, with a 429 sent, when `key` has used its `max` calls in this window. */
export async function overLimit(
  res: ServerResponse,
  key: string,
  max: number,
  windowMs = MINUTE_MS
): Promise<boolean> {
  const result = await checkRateLimitAsync(key, max, windowMs);
  res.setHeader('X-RateLimit-Limit', max);
  res.setHeader('X-RateLimit-Remaining', result.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));
  if (result.allowed) return false;
  const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  res.setHeader('Retry-After', retryAfter);
  sendJSON(res, { error: 'Rate limit exceeded. Please try again later.', retryAfter }, 429);
  return true;
}

let warnedForWindow = -1;

/**
 * True, with a 503 sent, when this hour's transcriptions across everyone are
 * used up. Warns once per window, not once per refused call.
 */
export async function overHourlyCeiling(res: ServerResponse): Promise<boolean> {
  const max = transcribeMaxPerHour();
  const result = await checkRateLimitAsync('expensive:journal-transcribe:all', max, HOUR_MS);
  if (result.allowed) return false;
  if (warnedForWindow !== result.resetAt) {
    warnedForWindow = result.resetAt;
    log.warn(
      { maxPerHour: max, resetAt: new Date(result.resetAt).toISOString() },
      'Journal transcription hourly ceiling reached; refusing until the window resets'
    );
  }
  const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  res.setHeader('Retry-After', retryAfter);
  sendJSON(res, { error: 'Busy right now, try again soon.', retryAfter, transcript: '' }, 503);
  return true;
}

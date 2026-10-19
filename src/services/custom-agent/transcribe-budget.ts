/**
 * The shared spend bound on journal transcription, in the unit Vertex bills.
 *
 * Vertex bills audio by length (about 25 tokens a second, whatever the
 * encoding), and the only per-clip bound upstream is 10 MB, which can hold
 * hours of speech. So every clip is measured before it is transcribed,
 * refused over TRANSCRIBE_MAX_CLIP_MINUTES (default 10), and charged to one
 * hourly budget for everyone together, TRANSCRIBE_MAX_AUDIO_MINUTES_PER_HOUR
 * (default 45: about $0.20 an hour at worst on gemini-3.5-flash). It lives
 * here, beside the transcriber, so every route that transcribes is bound by
 * it. A charge is never refunded when transcription then fails, so retrying
 * can't get past the budget.
 *
 * Each person (or, for anonymous callers, each address) also has their own
 * share, TRANSCRIBE_MAX_AUDIO_MINUTES_PER_PERSON_HOUR (default 15), charged
 * first, so no one caller can spend the whole hour. Routes name the caller
 * with withTranscribeCaller. Both counts live in Redis. If Redis is
 * configured but unreachable the clip is refused (fail closed) rather than
 * counted per instance, which would multiply the cap by the instance count.
 *
 * @module services/custom-agent/transcribe-budget
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { rateLimiter } from '../rate-limiter.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'transcribe-budget' });

/** Measured 2026-10-16 on gemini-3.5-flash: 1,550 tokens for 62 s, as WAV and as 32 kbps AAC. */
export const AUDIO_TOKENS_PER_SECOND = 25;
export const DEFAULT_MAX_AUDIO_MINUTES_PER_HOUR = 45;
export const DEFAULT_MAX_AUDIO_MINUTES_PER_PERSON_HOUR = 15;
export const DEFAULT_MAX_CLIP_MINUTES = 10;
export const AUDIO_BUDGET_KEY = 'expensive:journal-transcribe:audio-tokens';
const HOUR_MS = 60 * 60_000;
/** Retry-After when the shared count can't be reached. */
const UNREACHABLE_RETRY_SECONDS = 60;

/** A clip longer than TRANSCRIBE_MAX_CLIP_MINUTES. */
export class ClipTooLongError extends Error {
  constructor(
    readonly tokens: number,
    readonly maxMinutes: number
  ) {
    super(`Audio clip is over ${maxMinutes} minutes`);
    this.name = 'ClipTooLongError';
  }
}

/** This caller's share, or everyone's hour, is spent (or the count can't be reached). */
export class TranscribeBudgetSpentError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super('Journal transcription budget for this hour is spent');
    this.name = 'TranscribeBudgetSpentError';
  }
}

/** `env[name]` as a positive whole number, or `fallback` when unset or anything else. */
function positiveIntEnv(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]?.trim() ?? '';
  const value = /^\d+$/.test(raw) ? Number(raw) : NaN;
  return value > 0 ? value : fallback;
}

const tokensFor = (minutes: number) => minutes * 60 * AUDIO_TOKENS_PER_SECOND;

export function maxClipMinutes(env: NodeJS.ProcessEnv = process.env): number {
  return positiveIntEnv(env, 'TRANSCRIBE_MAX_CLIP_MINUTES', DEFAULT_MAX_CLIP_MINUTES);
}

export function maxAudioTokensPerHour(env: NodeJS.ProcessEnv = process.env): number {
  return tokensFor(
    positiveIntEnv(env, 'TRANSCRIBE_MAX_AUDIO_MINUTES_PER_HOUR', DEFAULT_MAX_AUDIO_MINUTES_PER_HOUR)
  );
}

export function maxPersonAudioTokensPerHour(env: NodeJS.ProcessEnv = process.env): number {
  return tokensFor(
    positiveIntEnv(
      env,
      'TRANSCRIBE_MAX_AUDIO_MINUTES_PER_PERSON_HOUR',
      DEFAULT_MAX_AUDIO_MINUTES_PER_PERSON_HOUR
    )
  );
}

const caller = new AsyncLocalStorage<string>();

/**
 * Runs `work` with `principal` ('user:<uid>', or 'anon-ip:<ip>' for an
 * anonymous caller) as the one charged for any transcription inside it.
 */
export function withTranscribeCaller<T>(principal: string, work: () => Promise<T>): Promise<T> {
  return caller.run(principal, work);
}

const retryAfter = (resetAt: number) => Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));

/** Charges `cost` to `key`: null when allowed, else the window's reset time. Throws when unreachable. */
async function charge(key: string, max: number, cost: number): Promise<number | null> {
  const result = await rateLimiter.checkShared(key, max, HOUR_MS, cost);
  if (!result) {
    log.warn({ key }, 'Journal clip refused: the shared audio budget is unreachable');
    throw new TranscribeBudgetSpentError(UNREACHABLE_RETRY_SECONDS);
  }
  return result.allowed ? null : result.resetAt;
}

let warnedForWindow = -1;

/**
 * Charges a measured clip of `tokens` to this hour's shared budget, then to the
 * caller's share (so a spent or unreachable shared budget never uses up the
 * caller's hour), or throws: ClipTooLongError over the clip cap (nothing
 * charged), TranscribeBudgetSpentError when either can't afford it or the count
 * can't be reached (warns once per window for the shared one).
 */
export async function chargeAudioBudget(tokens: number): Promise<void> {
  const clipMinutes = maxClipMinutes();
  if (tokens > tokensFor(clipMinutes)) {
    log.warn({ tokens, maxClipMinutes: clipMinutes }, 'Journal clip refused: over the clip cap');
    throw new ClipTooLongError(tokens, clipMinutes);
  }
  const cost = Math.ceil(tokens);
  const max = maxAudioTokensPerHour();
  const resetAt = await charge(AUDIO_BUDGET_KEY, max, cost);
  if (resetAt !== null) {
    if (warnedForWindow !== resetAt) {
      warnedForWindow = resetAt;
      log.warn(
        { maxTokensPerHour: max, resetAt: new Date(resetAt).toISOString() },
        'Journal transcription budget spent (audio minutes this hour); every caller refused until it resets. Check for abuse and the billing alert'
      );
    }
    throw new TranscribeBudgetSpentError(retryAfter(resetAt));
  }
  const principal = caller.getStore();
  if (!principal) return;
  const key = `${AUDIO_BUDGET_KEY}:${principal}`;
  const personReset = await charge(key, maxPersonAudioTokensPerHour(), cost);
  if (personReset !== null) throw new TranscribeBudgetSpentError(retryAfter(personReset));
}

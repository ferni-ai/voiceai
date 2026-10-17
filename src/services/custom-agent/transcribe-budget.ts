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
 * can't get past the budget. Counted in Redis when REDIS_URL is set.
 *
 * @module services/custom-agent/transcribe-budget
 */

import { rateLimiter } from '../rate-limiter.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'transcribe-budget' });

/** Measured 2026-10-16 on gemini-3.5-flash: 1,550 tokens for 62 s, as WAV and as 32 kbps AAC. */
export const AUDIO_TOKENS_PER_SECOND = 25;
export const DEFAULT_MAX_AUDIO_MINUTES_PER_HOUR = 45;
export const DEFAULT_MAX_CLIP_MINUTES = 10;
export const AUDIO_BUDGET_KEY = 'expensive:journal-transcribe:audio-tokens';
const HOUR_MS = 60 * 60_000;

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

/** The hour's shared audio budget is spent. */
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

export function maxClipMinutes(env: NodeJS.ProcessEnv = process.env): number {
  return positiveIntEnv(env, 'TRANSCRIBE_MAX_CLIP_MINUTES', DEFAULT_MAX_CLIP_MINUTES);
}

export function maxAudioTokensPerHour(env: NodeJS.ProcessEnv = process.env): number {
  const minutes = positiveIntEnv(
    env,
    'TRANSCRIBE_MAX_AUDIO_MINUTES_PER_HOUR',
    DEFAULT_MAX_AUDIO_MINUTES_PER_HOUR
  );
  return minutes * 60 * AUDIO_TOKENS_PER_SECOND;
}

let warnedForWindow = -1;

/**
 * Charges a measured clip of `tokens` to this hour's budget, or throws:
 * ClipTooLongError over the clip cap (nothing charged), TranscribeBudgetSpentError
 * when the hour can't afford it (warns once per window).
 */
export async function chargeAudioBudget(tokens: number): Promise<void> {
  const clipMinutes = maxClipMinutes();
  if (tokens > clipMinutes * 60 * AUDIO_TOKENS_PER_SECOND) {
    log.warn({ tokens, maxClipMinutes: clipMinutes }, 'Journal clip refused: over the clip cap');
    throw new ClipTooLongError(tokens, clipMinutes);
  }
  const max = maxAudioTokensPerHour();
  const result = await rateLimiter.check(AUDIO_BUDGET_KEY, max, HOUR_MS, Math.ceil(tokens));
  if (result.allowed) return;
  if (warnedForWindow !== result.resetAt) {
    warnedForWindow = result.resetAt;
    log.warn(
      { maxTokensPerHour: max, resetAt: new Date(result.resetAt).toISOString() },
      'Journal transcription budget spent (audio minutes this hour); every caller refused until it resets. Check for abuse and the billing alert'
    );
  }
  throw new TranscribeBudgetSpentError(
    Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))
  );
}

/**
 * Answers a transcription the shared audio budget refused
 * (services/custom-agent/transcribe-budget.ts), for every route that transcribes.
 *
 * @module api/transcribe-refusal
 */

import type { ServerResponse } from 'http';
import {
  ClipTooLongError,
  TranscribeBudgetSpentError,
} from '../services/custom-agent/transcribe-budget.js';
import { sendJSON } from './helpers.js';

/** Who a transcription is charged to: the person, or the address for an anonymous caller. */
export function transcribePrincipal(
  ip: string,
  caller: { userId: string; isAnonymous?: boolean }
): string {
  return caller.isAnonymous === true ? `anon-ip:${ip}` : `user:${caller.userId}`;
}

/** True, with a 413 or 503 sent, when `error` is a budget refusal; false for any other error. */
export function sentTranscribeRefusal(res: ServerResponse, error: unknown): boolean {
  if (error instanceof ClipTooLongError) {
    sendJSON(
      res,
      {
        error: `That one's long. Try a shorter one, under ${error.maxMinutes} minutes.`,
        reason: 'too_long',
        maxMinutes: error.maxMinutes,
        transcript: '',
      },
      413
    );
    return true;
  }
  if (error instanceof TranscribeBudgetSpentError) {
    res.setHeader('Retry-After', error.retryAfterSeconds);
    sendJSON(
      res,
      {
        error: 'Busy right now, try again soon.',
        retryAfter: error.retryAfterSeconds,
        transcript: '',
      },
      503
    );
    return true;
  }
  return false;
}

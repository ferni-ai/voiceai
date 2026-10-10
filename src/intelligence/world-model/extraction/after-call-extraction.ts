/**
 * After a call ends, read its transcript once and write down what the caller
 * said about their life: people and how they relate, things scheduled (with
 * real dates), how things turned out, goals, promises and open threads.
 *
 * The end-of-call signal extractor only looks for birthdays, values, dreams,
 * fears and inside jokes, and never knew the call's date: on prod it saved
 * nothing from a week of calls (2026-10-03..10), and a caller's martial-arts
 * training reached the summary but no structured store. These observations
 * feed the temporal world model, which is what lets Ferni ask "how did the
 * surgery go?" on the right day.
 *
 * Runs after the call, never on the live path. Off unless
 * AFTER_CALL_EXTRACTION=on.
 *
 * @module intelligence/world-model/extraction/after-call-extraction
 */
import type { WorldObservation } from '../temporal/types.js';
import { buildExtractionPrompt, callMomentFor } from './extraction-prompt.js';
import { parseObservations } from './parse-observations.js';

export function isAfterCallExtractionOn(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.AFTER_CALL_EXTRACTION === 'on';
}

export interface CallTurn {
  role: string;
  content: string;
}

export interface CallFacts {
  sessionId: string;
  startedAt: Date;
  /** IANA timezone of the caller; UTC when unknown. */
  timezone?: string;
}

/** One model call: prompt in, reply text out (null on failure). */
export type ExtractionLlm = (prompt: string) => Promise<string | null>;

/** Long calls keep their start and end, where plans and goodbyes live. */
const MAX_TRANSCRIPT = 16_000;

export function transcriptOf(turns: CallTurn[]): string {
  const lines = turns
    .filter((t) => t.content?.trim())
    .map((t) => `${t.role === 'user' ? 'CALLER' : 'FERNI'}: ${t.content.trim()}`);
  const text = lines.join('\n');
  if (text.length <= MAX_TRANSCRIPT) return text;
  const half = MAX_TRANSCRIPT / 2;
  return `${text.slice(0, half)}\n[... middle of the call left out ...]\n${text.slice(-half)}`;
}

/** The call's observations; [] when the caller said nothing or the model failed. */
export async function extractWorldObservations(
  turns: CallTurn[],
  call: CallFacts,
  llm: ExtractionLlm
): Promise<WorldObservation[]> {
  if (!turns.some((t) => t.role === 'user' && (t.content?.trim() ?? '') !== '')) return [];
  const moment = callMomentFor(call.startedAt, call.timezone ?? 'UTC');
  const reply = await llm(buildExtractionPrompt(transcriptOf(turns), moment));
  return parseObservations(reply, {
    sessionId: call.sessionId,
    observedAt: call.startedAt.toISOString(),
    callDate: moment.date,
  });
}

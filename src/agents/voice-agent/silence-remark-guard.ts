/**
 * Fewer remarks into a quiet caller (SILENCE_REMARK_GUARD).
 *
 * Seth's prod call 2026-10-12 (AJ_4NnxgzjEHHX8): about ten unprompted "Mm?",
 * "Yeah?", "You there?" and "You still there?" in nine minutes, most of them
 * while the music he had asked for was playing, two of them starting just as he
 * began to talk. Three gaps let them through:
 *
 * - The long-silence remark (session-state-handler.ts, user `away`) had no
 *   music check, although the early dead-air path has had one for months.
 * - Its allowance resets whenever the caller speaks, so a one-word answer
 *   re-armed it: remarks went out 22 s and 26 s apart.
 * - A bare "Mm?" is not a "you still there?" to PRESENCE_CHECK_CAP, and the
 *   model says it despite the instruction not to check on them.
 *
 * With the flag on: no remark while music plays; at most one remark per
 * SILENCE_REMARK_MIN_GAP_MS across the caller's turns; and a remark that is
 * nothing but a check ("Mm?", "Yeah? You there?") is dropped unless the
 * caller's audio really dropped (presence-check.ts, filterSilenceReply).
 *
 * @module voice-agent/silence-remark-guard
 */

import { getDJController } from '../../audio/index.js';
import { flagOn, type Env } from '../../config/env-flag.js';
import { diag } from '../../services/diagnostic-logger.js';

/** At most one remark into silence per this long, however often the caller speaks. */
export const SILENCE_REMARK_MIN_GAP_MS = 60_000;

/** SILENCE_REMARK_GUARD=on. */
export function silenceRemarkGuardOn(env: Env = process.env): boolean {
  return flagOn('SILENCE_REMARK_GUARD', env);
}

/** True when the caller's music is playing (or ducked under Ferni, fading, changing track). */
export function musicIsPlaying(): boolean {
  try {
    return getDJController().isMusicActive();
  } catch {
    return false; // no DJ controller in this session: no music
  }
}

/**
 * SILENCE_REMARK_GUARD: hold the long-silence remark while the caller's music
 * plays. He asked for it and is listening; "Mm?" over it is an interruption.
 */
export function musicHoldsRemark(silenceSec: number, env: Env = process.env): boolean {
  const held = silenceRemarkGuardOn(env) && musicIsPlaying();
  if (held)
    diag.state('🤫 [SILENCE] Skipped - music is playing', { silenceSec: Math.round(silenceSec) });
  return held;
}

/** True when the last remark into silence went out less than `gapMs` ago. */
export function remarkTooSoon(
  lastRemarkAt: number | undefined,
  now: number,
  gapMs: number = SILENCE_REMARK_MIN_GAP_MS
): boolean {
  return lastRemarkAt !== undefined && now - lastRemarkAt < gapMs;
}

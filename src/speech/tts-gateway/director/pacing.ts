/**
 * Pacing: one speed per reply, smoothed across turns.
 *
 * The target follows the reply's weight (slower for heavy news, a touch
 * quicker for bright banter) and moves half-way toward it each turn, inside
 * 0.9-1.08, so Ferni's pace drifts rather than jumps between replies. Within
 * a reply the pace is fixed: Cartesia's <speed> goes on the opening push only.
 *
 * Professional Voice Clones ignore <speed> (spec §2.6). Ferni's voice is
 * almost certainly a stock/instant voice, not a PVC, but that is unconfirmed
 * (needs GET /voices/{id}); a voice listed in PRO_VOICE_IDS gets no speed tag
 * and P3 can route pacing to the Rust SOLA stretch instead.
 *
 * @module speech/tts-gateway/director/pacing
 */

import type { StableEmotion, Valence } from './emotion.js';

/** Voice ids known to be Professional Voice Clones (`is_pro: true`). */
export const PRO_VOICE_IDS = new Set<string>();

const TARGET: Record<Valence, number> = {
  heavy: 0.94,
  bright: 1.03,
  inquisitive: 1,
  neutral: 1,
};
const PULL = 0.5;
const MIN_SPEED = 0.9;
const MAX_SPEED = 1.08;

export interface SpeedInput {
  valence: Valence;
  emotion?: StableEmotion;
  voiceId: string;
  /** The previous reply's speed in this session (1 when none). */
  previous?: number;
}

export function decideSpeed(input: SpeedInput): { speed: number; supported: boolean } {
  if (PRO_VOICE_IDS.has(input.voiceId)) return { speed: 1, supported: false };
  let target = TARGET[input.valence];
  // The voice slows with care: a sympathetic reply never runs brisk.
  if (input.emotion === 'sympathetic') target = Math.min(target, TARGET.heavy);
  if (input.emotion === 'contemplative') target = Math.min(target, 0.96);
  const previous = input.previous ?? 1;
  const next = previous + PULL * (target - previous);
  const clamped = Math.min(MAX_SPEED, Math.max(MIN_SPEED, next));
  return { speed: Math.round(clamped * 100) / 100, supported: true };
}

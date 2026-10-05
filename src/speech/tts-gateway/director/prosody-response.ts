/**
 * How Ferni answers the way the caller sounds, not just what they said.
 *
 * A friend picks up a little with someone excited, steadies someone tense
 * rather than matching them, and slows and softens for someone low. Each is
 * a small speed nudge (the pacing lever still smooths and clamps the
 * result), and a tone only where the reply's opening words agree: Cartesia
 * honours an emotion only when it fits the transcript.
 *
 * Thresholds are relative to the caller's own baseline (caller-prosody.ts).
 *
 * @module speech/tts-gateway/director/prosody-response
 */

import type { CallerProsody } from '../../audio-prosody/caller-prosody.js';
import type { StableEmotion, Valence } from './emotion.js';

export interface ProsodyResponse {
  speedNudge: number;
  emotion?: StableEmotion;
  reason: 'no-reading' | 'steady' | 'excited' | 'tense' | 'low';
}

export function respondToProsody(p: CallerProsody | undefined, valence: Valence): ProsodyResponse {
  if (!p) return { speedNudge: 0, reason: 'no-reading' };
  const louder = p.energyRelDb >= 3;
  // Tense: faster, louder and higher than usual. Answer calm, a touch slower.
  if (p.rateRel >= 1.15 && louder && p.pitchRelSt >= 2) {
    return { speedNudge: -0.03, emotion: 'calm', reason: 'tense' };
  }
  // Excited: faster and louder. Pick up a little; brighten only bright words.
  if (p.rateRel >= 1.2 && louder) {
    return valence === 'bright'
      ? { speedNudge: 0.03, emotion: 'content', reason: 'excited' }
      : { speedNudge: 0.03, reason: 'excited' };
  }
  // Low: slower, quieter, falling. Slow down; soften unless the words are bright.
  if (p.rateRel <= 0.85 && p.energyRelDb <= -3 && p.pitchSlopeStPerS < -2) {
    if (valence === 'bright') return { speedNudge: -0.06, reason: 'low' };
    return { speedNudge: -0.06, emotion: valence === 'heavy' ? 'sympathetic' : 'calm', reason: 'low' };
  }
  return { speedNudge: 0, reason: 'steady' };
}

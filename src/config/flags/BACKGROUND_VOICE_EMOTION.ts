import type { FlagSpec } from '../flag-spec.js';

// on: the background turn-intelligence pass (multi-agent/turn-intelligence.ts) gives its turn the caller voice emotion as a measured-only view (multi-agent/background-voice-emotion.ts): stress, anxiety markers, valence and the emotion label re-derived with jitter, shimmer and breathiness held at the fixed values the native analyzer writes (NATIVE_VOICE_QUALITY), so no decision reads them; arousal and dominance pass through, prosody is left out. So the voice-vs-words read (voice-mismatch.ts) and the turn crisis read see the voice, as the synchronous turn already does; voice only raises a crisis read's severity, never its subject (who is at risk). Off: the background turn user data is as on main.
export const BACKGROUND_VOICE_EMOTION = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-05',
  issue: 'https://github.com/ferni-ai/voiceai/issues/3603',
  context: 'a dev masking A/B (flat voice with words like fine) on ferni-dev decides it',
} as const satisfies FlagSpec;

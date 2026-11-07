import type { FlagSpec } from '../flag-spec.js';

// on: the background turn-intelligence pass (multi-agent/turn-intelligence.ts) gives its turn the caller voice emotion as a measured-only view (multi-agent/background-voice-emotion.ts): stress, anxiety markers, valence and the emotion label re-derived without jitter, shimmer or breathiness, which the native analyzer hard-codes; arousal and dominance pass through, prosody is left out. So the voice-vs-words read (voice-mismatch.ts) and the turn crisis read see the voice, as the synchronous turn already does; voice only adds to a crisis read. Off: the background turn user data is as on main.
export const BACKGROUND_VOICE_EMOTION = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-05',
  issue: 'https://github.com/ferni-ai/voiceai/issues/3603',
  context: 'a dev masking A/B (flat voice with words like fine) on ferni-dev decides it',
} as const satisfies FlagSpec;

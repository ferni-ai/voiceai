import type { FlagSpec } from '../flag-spec.js';

// on: @livekit/agents readStream and the audio_recognition loops read with a per-read abort
// listener instead of racing every read against one call-long promise, which kept ~0.5 KB per
// read (the STT's caller audio: ~3 MB/min) until the call ended. Read inside the agents patch
// (patches/@livekit__agents@1.9.3.patch, readAbortFixOn).
export const LK_READSTREAM_ABORT_FIX = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;

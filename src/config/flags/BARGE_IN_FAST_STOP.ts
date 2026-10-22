import type { FlagSpec } from '../flag-spec.js';

// on: a pause for the caller (barge-in) also clears Ferni's queued room audio at once, so he stops in ~0.2 s instead of playing on for up to OUTPUT_QUEUE_MS (patches/@livekit__agents@1.9.3.patch, room_io/_output.js)
export const BARGE_IN_FAST_STOP = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;

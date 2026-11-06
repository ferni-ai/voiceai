import type { FlagSpec } from '../flag-spec.js';

// on: a web or demo call says "The sound didn't start. Try again in a moment." when Ferni has joined but none of his audio plays, 3 s after his first audio track or 8 s after he joins (apps/web/src/services/audio-start-watch.ts); off = no notice, the call page is unchanged. The "Agent audio start timing" line logs either way; #3514 decides it from that timing's p50/p95/p99. Web side: VITE_WEB_AUDIO_START_WATCH.
export const WEB_AUDIO_START_WATCH = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-04',
  issue: '#3514',
} as const satisfies FlagSpec;

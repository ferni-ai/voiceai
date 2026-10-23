import type { FlagSpec } from '../flag-spec.js';

// ms a soft pause waits after the caller goes quiet for words still in STT (multi-agent/barge-in-soft-pause.ts)
export const BARGE_IN_SOFT_PAUSE_STT_GRACE_MS = {
  default: '700',
  owner: 'voice',
  kind: 'config',
} as const satisfies FlagSpec;

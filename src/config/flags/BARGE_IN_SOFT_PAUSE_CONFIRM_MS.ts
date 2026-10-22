import type { FlagSpec } from '../flag-spec.js';

// ms a soft pause waits for confirmation before Ferni resumes (multi-agent/barge-in-soft-pause.ts)
export const BARGE_IN_SOFT_PAUSE_CONFIRM_MS = {
  default: '1200',
  owner: 'voice',
  kind: 'config',
} as const satisfies FlagSpec;

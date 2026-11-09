import type { FlagSpec } from '../flag-spec.js';

// on: a persona the caller already met this call says a short return line it has not said yet, or no arrival line, never the same arrival twice; crisis handoffs keep theirs (multi-agent/arrival-once.ts)
export const HANDOFF_ARRIVAL_ONCE = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-05',
  issue: 'https://github.com/ferni-ai/voiceai/issues/1922',
} as const satisfies FlagSpec;

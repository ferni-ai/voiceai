import type { FlagSpec } from '../flag-spec.js';

// on: recentContext keeps only sessions inside the asked timeframe in the caller zone (simple-utilities/recent-context-window.ts, #2757); off = the last 20 sessions whatever the timeframe
export const RECENT_CONTEXT_TIMEFRAME = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
} as const satisfies FlagSpec;

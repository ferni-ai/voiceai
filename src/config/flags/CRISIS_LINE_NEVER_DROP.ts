import type { FlagSpec } from '../flag-spec.js';

// off | on: STILL_HERE_LINE (the line said when a step-away exit is held for a caller at risk) is queued at SpeechPriority.CRISIS and never expires in the queue, instead of RESPONSE priority with a 10 s expiry. Queued first, never interrupting a line being spoken. Read in agents/shared/gateway/reconnection.ts.
export const CRISIS_LINE_NEVER_DROP = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
  expires: '2027-02-23',
  issue: '#4447',
  context:
    'dev on: a held step-away line waits for the stuck line to end instead of expiring; the owner sets prod timing',
} as const satisfies FlagSpec;

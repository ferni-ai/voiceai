import type { FlagSpec } from '../flag-spec.js';

// on: once a call has had a hard moment (callHadHardMoment, presence-heavy.ts) its live backchannels stay grave for the rest of the call: soft "mm"s only, no bright or happy take, no laugh-along, no "Ha" (agents/integrations/heavy-call-sticky.ts). Off: grave only while the hard turn is among the caller's last 3.
export const HEAVY_CALL_STICKY = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-18',
  issue: '#3845',
} as const satisfies FlagSpec;

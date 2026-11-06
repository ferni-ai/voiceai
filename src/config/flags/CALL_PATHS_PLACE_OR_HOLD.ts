import type { FlagSpec } from '../flag-spec.js';

// on: the backgroundCall tool and the referral calls (inviteFriendByCall, sendSupportCall) are placed through placeOrHold and the on-behalf orchestrator, so the recipient's call hours, the do-not-call list and call compliance apply; a call that rings is recorded as started, never completed, and its agent reports the result when it ends (tools/domains/telephony/gated-call-port.ts). Off: the background call uses the conversational call service and the referral the one-way persona-voice call, as before.
export const CALL_PATHS_PLACE_OR_HOLD = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
  expires: '2027-02-03',
  issue: '#3506',
} as const satisfies FlagSpec;

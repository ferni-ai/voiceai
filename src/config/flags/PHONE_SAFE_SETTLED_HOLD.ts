import type { FlagSpec } from '../flag-spec.js';

// off | on: a verified account owner's tools are cut to the phone-safe set only by a hold that was set (MINOR_CARE's own hold, a sexual-topic hold, a try-first call; minor-care-reason.ts careHoldReason), not by a sexual-topic read still running. Once no hold covers the call, the agent gets back the tools it had before the cut. The cut's log names its reason. Memory writes still fail closed on a running read. Off: any running read cuts the tools, for the rest of the call on that agent.
// Sites: turn-request.ts toolsForTurn, phone-safe-cut.ts.
export const PHONE_SAFE_SETTLED_HOLD = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-20',
  issue: 'https://github.com/ferni-ai/voiceai/issues/4234',
  context:
    'dev on: verified-owner calls cut to phone-safe tools only while a hold is set (reason in the log); tools come back after',
} as const satisfies FlagSpec;

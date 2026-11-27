import type { FlagSpec } from '../flag-spec.js';

// on (with CALL_FOLLOWTHROUGH): Ferni never redials a missed call on its own (owner, 2026-11-26). The missed call keeps its usual "want me to try again?" offer and the signed retry is stored as an offer; only the owner's yes (the retryMissedCall tool, read back through the outbound confirm gate) schedules it, for the next morning where the callee is: the number's area-code zone, else the owner's zone, said so in the read-back. The retry keeps the first call's own context (additionalContext, preferredTimes). Read in services/outreach/call-retry.ts and call-retry-offer.ts. Off: a missed call is retried the next day on its own inside the both-coasts window, as before.
export const CALL_RETRY_ASKS_FIRST = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
  expires: '2027-02-26',
  issue: 'https://github.com/ferni-ai/voiceai/issues/4466',
  context:
    'dev on with CALL_FOLLOWTHROUGH, then a missed call schedules nothing until the owner says yes and the retry rings at a morning hour where the callee is; then prod on the owner yes and delete the flag.',
} as const satisfies FlagSpec;

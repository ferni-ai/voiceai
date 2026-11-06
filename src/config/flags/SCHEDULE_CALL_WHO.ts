import type { FlagSpec } from '../flag-spec.js';

// on: scheduleCall's `who` naming anyone but the caller schedules nothing and writes nothing; the tool result says it only rings the caller's own phone, with no offer of a call or a reminder instead. The description says it rings only the caller (tools/domains/scheduling/schedule-call-who.ts). Off: every scheduled call rings the caller, as before.
export const SCHEDULE_CALL_WHO = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
  expires: '2027-02-05',
  issue: 'https://github.com/ferni-ai/voiceai/issues/3511',
  context:
    'Keep until scheduled calls can ring someone else through the confirm gate; then delete.',
} as const satisfies FlagSpec;

import type { FlagSpec } from '../flag-spec.js';

// on: scheduleCall gets a `recipient` field the model fills ("self" | "other"); "other" schedules nothing and writes nothing, and the tool result says it only rings the caller's own phone, with nothing offered instead. Missing or unknown values schedule as before; nothing is read from names or the message (tools/domains/scheduling/schedule-call-recipient.ts). Off: the tool is main's, and every scheduled call rings the caller.
export const SCHEDULE_CALL_WHO = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
  expires: '2027-02-05',
  issue: 'https://github.com/ferni-ai/voiceai/issues/3511',
  context:
    'Keep until scheduled calls can ring someone else through the confirm gate; then delete.',
} as const satisfies FlagSpec;

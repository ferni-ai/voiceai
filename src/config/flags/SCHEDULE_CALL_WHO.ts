import type { FlagSpec } from '../flag-spec.js';

// on: scheduleCall's `who` naming anyone but the caller schedules nothing; the reply says the call can't be set for later yet and offers a call on their behalf or a reminder. Emergency services, help lines and toll-free lines get no call offer, and a help line's reply gives the caller the line from the safety resources (services/safety/help-line-who.ts). The description says it rings only the caller (tools/domains/scheduling/schedule-call-who.ts). Off: every scheduled call rings the caller, as before.
export const SCHEDULE_CALL_WHO = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
  expires: '2027-02-05',
  issue: '#3511',
  context:
    'Keep until scheduled calls can ring someone else through the confirm gate; then delete.',
} as const satisfies FlagSpec;

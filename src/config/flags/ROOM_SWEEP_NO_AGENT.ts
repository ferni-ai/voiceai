import type { FlagSpec } from '../flag-spec.js';

// Scheduled job (POST /api/jobs/room-sweep): deletes a LiveKit room that has had a person but no agent for longer than ROOM_SWEEP_GRACE_MINUTES (default 5). Off: the job answers skipped.
export const ROOM_SWEEP_NO_AGENT = {
  default: 'off',
  owner: 'platform',
  kind: 'experiment',
  expires: '2027-02-16',
  issue: '#4125',
} as const satisfies FlagSpec;

import type { FlagSpec } from '../flag-spec.js';

// on: setReminder says "Saved" and cancelReminder says "cancelled" only when Firestore took
// the write (services/scheduling/reminder-persist.ts). Delivery reads Firestore, so before,
// a failed save was spoken as saved and never went off, and a failed cancel still went off.

export const REMINDER_WRITES_TRUTHFUL = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
  expires: '2027-02-19',
  issue: '#4225',
} as const satisfies FlagSpec;

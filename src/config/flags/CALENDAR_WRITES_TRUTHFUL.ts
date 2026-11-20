import type { FlagSpec } from '../flag-spec.js';

// on: a calendar event whose Firestore write failed (or had no Firestore) is not kept, and the create
// tool says it couldn't create it; a delete whose write failed is undone and reported false, so the
// tool says it couldn't delete it (services/calendar/calendar-event-persist.ts). Off: the failure is
// logged, the event stays in memory only, and the tools say saved / removed, as before.

export const CALENDAR_WRITES_TRUTHFUL = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
  expires: '2027-02-20',
  issue: '#4244',
} as const satisfies FlagSpec;

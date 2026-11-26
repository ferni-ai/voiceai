import type { FlagSpec } from '../flag-spec.js';

// on: a calendar load from Firestore that fails caches nothing, so the next read retries, and a
// calendar tool's read that hit it says it couldn't check the calendar instead of "your calendar is
// clear" (services/calendar/calendar-load-state.ts). Off: the failure caches an empty calendar for
// the rest of the process, as before.

export const CALENDAR_LOAD_FAIL_HONEST = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
  expires: '2027-02-20',
  issue: '#4237',
} as const satisfies FlagSpec;

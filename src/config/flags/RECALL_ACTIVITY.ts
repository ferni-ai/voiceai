import type { FlagSpec } from '../flag-spec.js';

// on: callStatus answers what Ferni did for the owner over 30 days from the stores that hold it: the person's whole call history newest first with weekday and date in the owner's zone, then what's still open and the reminders, emailed summaries and promises (services/outreach/activity-recall.ts, activity-records.ts). Off: the newest call to that person only, as before.
export const RECALL_ACTIVITY = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
  expires: '2027-02-24',
  issue: '#4489',
} as const satisfies FlagSpec;

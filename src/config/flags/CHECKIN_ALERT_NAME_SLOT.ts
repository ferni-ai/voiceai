import type { FlagSpec } from '../flag-spec.js';

// off | on (issue #3482, review by 2027-02-05): the check-in alert's caller-text screen reads the alert with a placeholder where the person's name goes, so a name that is itself a screen word (Loan, Pin, Bank, Wire) no longer withholds their words or says money and safety came up. Their own words are screened as before; a field with its own money, account or number read keeps main's alert, and words the name alone held back keep crisisCallerLine whenever the crisis guard reads crisis in either field. off = main (services/outreach/checkin-urgent-alert.ts).
export const CHECKIN_ALERT_NAME_SLOT = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
} as const satisfies FlagSpec;

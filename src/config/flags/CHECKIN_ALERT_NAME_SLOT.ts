import type { FlagSpec } from '../flag-spec.js';

// off | on (issue #3482, review by 2027-02-05): the check-in alert's caller-text screen reads the alert with a placeholder where the person's name goes, so a name that is itself a screen word (Loan, Pin, Bank, Wire) no longer withholds their words or says money came up. Their own words are screened as before; a field with its own money, account or number read, a name with a digit, or anything number-like or link-like in their words (any digit or number word, dot/period/point before a word, a slash, a web ending) keeps main's alert, and words the name alone held back keep crisisCallerLine. off = main (services/outreach/checkin-urgent-alert.ts).
export const CHECKIN_ALERT_NAME_SLOT = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
  expires: '2027-02-05',
  issue: '#3482',
  context:
    'Safety: crisis-adjacent alert; expiry only warns, never turns it off. Decide permanent or remove with the owner; never just delete.',
} as const satisfies FlagSpec;

import type { FlagSpec } from '../flag-spec.js';

// On, per person (read after the call through envForCaller, agents/follow-through-import.ts):
// a one-time medical visit or event the caller gave a time for ("biopsy Tuesday at 3pm")
// becomes a follow-up with eventAt, eventPrecision 'time', askType and salience
// (services/follow-through/bookend-source.ts). Off: the import is exactly as before.
export const BOOKENDS = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
} as const satisfies FlagSpec;

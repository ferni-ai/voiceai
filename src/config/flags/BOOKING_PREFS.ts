import type { FlagSpec } from '../flag-spec.js';

// on: Ferni keeps the owner's booking preferences per kind of place (bogle_users/{uid}/booking_prefs/{kind}: days, time windows, who to ask for, a screened note, party size and seating, insurance carrier name), written only for the verified owner and never for a minor-care-held session or account (services/stores/booking-prefs-store.ts); off = nothing is read or written.
export const BOOKING_PREFS = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
} as const satisfies FlagSpec;

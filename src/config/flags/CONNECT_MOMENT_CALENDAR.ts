import type { FlagSpec } from '../flag-spec.js';

// on: when a connected calendar would help and none is connected, the active persona asks once, on Alex's behalf, to text a one-tap link to the verified owner's own phone or email; the link is single use and opens the Google Calendar connect with plain consent copy (services/connect-moments/); off = no ask, no invite, POST /auth/oauth/start-from-invite answers 404
export const CONNECT_MOMENT_CALENDAR = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
} as const satisfies FlagSpec;

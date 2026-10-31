import type { FlagSpec } from '../flag-spec.js';

// on: ride words ("ride", "uber", "lyft", "taxi", "cab", "car to the airport") load the ride-links domain, whose one tool openRideLink geocodes the trip and hands the caller an Uber link with pickup and drop-off filled in (texted on a phone call only when they say yes and consent allows); Ferni books nothing. Off: no ride words load anything and the domain has no tools.
export const RIDE_LINKS = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
} as const satisfies FlagSpec;

import type { FlagSpec } from '../flag-spec.js';

// on: with the call zone known (browser, else a verified owner), the assembled moment (hour, part of day, weekday, weekend, late night) uses the caller clock, not the server UTC clock (intelligence/core/immediate-time.ts), and the last-talked line counts the caller calendar days (voice-agent/phases/user-awareness.ts). off, or no zone = the server clock and 24-hour blocks.
export const CALLER_CLOCK_TIME_OF_DAY = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
  expires: '2027-02-16',
  issue: '#2167',
} as const satisfies FlagSpec;

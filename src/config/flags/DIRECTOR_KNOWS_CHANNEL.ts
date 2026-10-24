import type { FlagSpec } from '../flag-spec.js';

// on: the director is told whether the call is in the Ferni app or on a phone line (director-channel.ts), so an app caller asking to be rung on their phone is not read as confused (#2709). Off: the prompt says every call is a phone call, as before.
export const DIRECTOR_KNOWS_CHANNEL = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;

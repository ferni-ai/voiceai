import type { FlagSpec } from '../flag-spec.js';

// on: one words-free BACKCHANNEL_PLAYED line per clip Ferni plays in the caller's pause (clip kind, caller run, quiet before it, what took it back), so backchannel placement can be measured (agents/integrations/backchannel-played.ts). Off: no line, as before. Either way nothing the caller hears changes.
export const BACKCHANNEL_PLAYED = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-24',
  issue: '#3984',
} as const satisfies FlagSpec;

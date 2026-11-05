import type { FlagSpec } from '../flag-spec.js';

// a mode: shadow logs SELF_VOICE_SHADOW (how much of each barge-in sounded like the
// caller, not Ferni's own voice) and changes nothing; off installs nothing (session-gate.ts)
export const SELF_VOICE_GATE = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;

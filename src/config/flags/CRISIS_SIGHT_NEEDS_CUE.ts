import type { FlagSpec } from '../flag-spec.js';

// off | on (#3000): saying you cannot see reads as a medical emergency only with an acute medical cue (sudden, eyes, stroke signs, injury, an ambulance); everyday sight (a screen, a text, the dark) does not. Sight loss said outright always counts (services/human-transfer/sight-emergency.ts).
export const CRISIS_SIGHT_NEEDS_CUE = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
} as const satisfies FlagSpec;

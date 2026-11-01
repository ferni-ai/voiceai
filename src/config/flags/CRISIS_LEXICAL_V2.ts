import type { FlagSpec } from '../flag-spec.js';

// off | on: implies CRISIS_SIGHT_NEEDS_CUE, so an everyday "can't see" line needs a sight cue before it raises a medical alarm (services/safety/sight-emergency.ts). Every other legacy signal, severity and crisis_signals write stays main's. Read per turn (COHORT_FLAGS).
export const CRISIS_LEXICAL_V2 = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;

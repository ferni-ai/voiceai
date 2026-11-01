import type { FlagSpec } from '../flag-spec.js';

// off | on: the human-transfer note for a suicide or self-harm-only turn is left to the crisis gate when the gate is live on the cascade path and its own pattern guard reads crisis in the same line (services/human-transfer/transfer-need.ts; logged CRISIS_LEXICAL, reason only). Every legacy signal, severity and crisis_signals write stays main's. Implies CRISIS_SIGHT_NEEDS_CUE. Read per turn (COHORT_FLAGS).
export const CRISIS_LEXICAL_V2 = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;

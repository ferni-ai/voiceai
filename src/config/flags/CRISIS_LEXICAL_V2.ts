import type { FlagSpec } from '../flag-spec.js';

// off | on: the legacy word checks outside the crisis gate (performSafetyCheck, the human-transfer detector) stop raising crisis on their own. Their patterns skip negated, idiom and everyday-event hits, an everyday injury reads as first aid, and 'messages from' needs a voice source. With the gate live, their suicide, self-harm and distress hits defer to it (logged CRISIS_LEXICAL, reason only). Implies CRISIS_SIGHT_NEEDS_CUE. The crisis_signals write stays (#3150). Read per turn (COHORT_FLAGS).
export const CRISIS_LEXICAL_V2 = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;

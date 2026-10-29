import type { FlagSpec } from '../flag-spec.js';

// off | on (#3000): the crisis follow-up note comes from a crisis on an earlier call; one logged earlier on this call counts only when the safety path noted risk on this call (crisisRiskNoted), so a lexical-only read no longer rides every later turn (better-than-human-builders.ts).
export const CRISIS_FOLLOW_UP_PRIOR_CALLS = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
} as const satisfies FlagSpec;

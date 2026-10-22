import type { FlagSpec } from '../flag-spec.js';

// on: the crisis adjudicator gives grief or overwhelm with no risk shape a warm check-in and reads a first caller line; shadow only (crisis-adjudicator.ts)
export const CRISIS_ADJUDICATOR_GRIEF = {
  default: 'off',
  owner: 'safety',
  kind: 'experiment',
} as const satisfies FlagSpec;

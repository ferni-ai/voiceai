import type { FlagSpec } from '../flag-spec.js';

// shadow: log which classifier-only crisis reads could be eased and why the rest keep the 988 guidance; changes no reply, calls no model (services/safety/crisis-classifier-only.ts)
export const CRISIS_CLASSIFIER_ONLY_CHECKIN = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
} as const satisfies FlagSpec;

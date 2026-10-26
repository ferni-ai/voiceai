import type { FlagSpec } from '../flag-spec.js';

// shadow: log which classifier-only crisis reads could be eased and why the rest keep the 988 guidance; changes no reply, calls no model (services/safety/crisis-classifier-only.ts). live: an eligible read gets one quarantined easing read and is eased to the soft check only on verified everyday facts; held to logging while the adjudicator's live hold stands (services/safety/crisis-classifier-only-live.ts)
export const CRISIS_CLASSIFIER_ONLY_CHECKIN = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
} as const satisfies FlagSpec;

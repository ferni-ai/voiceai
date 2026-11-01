import type { FlagSpec } from '../flag-spec.js';

// off | shadow | live (#2697, issue #2697, review by 2027-01-24): means in hand or a dose being taken, said plainly, read imminent and lead with 911 (services/safety/crisis-means-in-hand.ts). shadow (default): reads stay exactly as on main; one line per turn logs sessionId, reader 'means_in_hand' and the tier live would give, never words (crisis-means-shadow.ts). live: the forms act, and assessSafety leads with 911. Escalate-only: never lowers a read.
export const CRISIS_MEANS_IN_HAND = {
  default: 'shadow',
  owner: 'intelligence',
  kind: 'experiment',
} as const satisfies FlagSpec;

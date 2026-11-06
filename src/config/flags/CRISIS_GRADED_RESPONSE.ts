import type { FlagSpec } from '../flag-spec.js';

// off | shadow (review by 2027-02-01): F3's graded crisis response. shadow logs, per turn, whether a classifier-only crisis guide would get the graded check-in (CRISIS_GRADE: the would-be level and every row that blocks it), and whether the reply on a crisis-guided turn named 988 as spoken (CRISIS_LIFELINE_SPOKEN). No decision, reply, injection or call-risk note changes. live is not built yet: it resolves to shadow with a warning (services/safety/crisis-graded-shadow.ts).
export const CRISIS_GRADED_RESPONSE = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
  expires: '2027-02-01',
  issue: '#2168',
  context:
    'Safety: expiry only warns, never turns it off. Decide permanent (kill-switch, on) or replace; never just delete.',
} as const satisfies FlagSpec;

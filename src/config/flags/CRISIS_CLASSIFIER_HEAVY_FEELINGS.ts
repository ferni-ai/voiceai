import type { FlagSpec } from '../flag-spec.js';

// on: the crisis classifier reads heavy feelings with no words about dying (tired, stressed, grieving, a job that feels empty, a calm moment, a goodbye) as risk none, with the everyday rules' backstop: a turn with risk words is also read without the rules and the more severe read wins (services/safety/crisis-heavy-feelings.ts). Pattern hits and imminent reads are untouched.
export const CRISIS_CLASSIFIER_HEAVY_FEELINGS = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
  expires: '2027-02-24',
  issue: '#2469',
  context:
    'Safety: expiry only warns, never turns it off. Decide permanent (on) or delete after the crisis eval and a dev nightly.',
} as const satisfies FlagSpec;

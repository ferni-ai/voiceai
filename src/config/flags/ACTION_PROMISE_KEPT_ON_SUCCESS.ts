import type { FlagSpec } from '../flag-spec.js';

// on: a promise ("I'll call her now") counts as kept by a tool run this turn only when that run's result did not refuse or fail (action-promises.ts kindsRunThisTurn, action-claims.ts resultState). After "I couldn't place that call" the action-claim guard drops the promise and says it didn't go through. Off: any run of the kind keeps it, as before.
export const ACTION_PROMISE_KEPT_ON_SUCCESS = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
  expires: '2027-02-05',
  issue: 'TBD',
  context: 'Keep if no refused call or text is promised as under way after the run; else delete.',
} as const satisfies FlagSpec;

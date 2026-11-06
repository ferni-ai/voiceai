import type { FlagSpec } from '../flag-spec.js';

// on: a promise ("I'll call her now") counts as kept by a tool run this turn only when that run's result did not refuse or fail (action-promises.ts kindsRunThisTurn, action-claims.ts resultState). After "I couldn't place that call" the action-claim guard drops the promise and says it didn't go through. While a read-back waits and SCHEDULED_OUTREACH_THIRD_PARTY is off, Ferni's own promise or offer of a call or text for a later time ("I'll ring her at eight") is dropped too, since reachOut only sends now; the reply offers now or a reminder (action-promises.ts setForLater, utils/later-time.ts). Advice to the caller, reported speech and a sentence giving a crisis or emergency line (services/safety namesSafetyLine) always stand. Off: any run of the kind keeps it and the time stands, as before.
export const ACTION_PROMISE_KEPT_ON_SUCCESS = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
  expires: '2027-02-05',
  issue: '#3512',
  context: 'Keep if no refused call or text is promised as under way after the run; else delete.',
} as const satisfies FlagSpec;

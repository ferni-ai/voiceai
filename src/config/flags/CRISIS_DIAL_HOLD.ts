import type { FlagSpec } from '../flag-spec.js';

// on: an outbound call confirmed on a call never dials after that call notes crisis risk (#4187). A deferral of that call is cancelled with the status a user cancel gives, a new one is refused, a deferral with no originating call is never dialed (it stays pending), and a background call checks the call's risk right before it dials. Read by the agent (defer, cancel, background calls) and by the server's dial job. Off: main.
export const CRISIS_DIAL_HOLD = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
  expires: '2027-02-19',
  issue: '#4187',
  context:
    'Promote only after legacy deferrals with no originating call have drained (the dial job logs CRISIS_DIAL_HOLD no_origin_call until then), with the flag on in both the agent and the API server; else delete.',
} as const satisfies FlagSpec;

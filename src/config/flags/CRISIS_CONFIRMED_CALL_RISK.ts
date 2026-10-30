import type { FlagSpec } from '../flag-spec.js';

// off | shadow | on (issue #2168, review by 2027-01-30): after a crisis decision only the classifier made, a later turn on that call that only the classifier flags gets one more read that knows Ferni's safety talk came from an unconfirmed check (services/safety/crisis-confirmed-risk.ts). on: when that read finds no risk, a crisis read gets the after-check guidance (988 kept for any disclosure) and an imminent read gets crisis guidance, never less. shadow: logs what on would do, changes nothing. Never eases once a pattern, two agreeing reads or that read confirm risk on the call, or for a possible minor.
export const CRISIS_CONFIRMED_CALL_RISK = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
} as const satisfies FlagSpec;

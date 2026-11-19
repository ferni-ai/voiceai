import type { FlagSpec } from '../flag-spec.js';

// on: a caller Ferni knows by their verified number, asking him to call or text someone, hears that he can once he texts them a code (phone-step-up.ts, honest-line.ts) instead of a flat "I can't". Off: the phone-safe tools and the honest line as before.
export const PHONE_STEP_UP = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
  expires: '2027-02-16',
  issue: '#4102',
  context:
    'Do not turn on anywhere until the second PR (sending and checking the code) lands: until then the offer names a code nothing can send. Keep once the step-up code ships and phone-in owners use it on prod; else delete.',
} as const satisfies FlagSpec;

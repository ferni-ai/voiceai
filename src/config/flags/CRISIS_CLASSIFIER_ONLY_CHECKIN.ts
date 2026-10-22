import type { FlagSpec } from '../flag-spec.js';

// shadow: log where a crisis read nothing else agrees with would get the soft check-in; live: give it the check-in, not the 988 guidance (services/safety/crisis-classifier-only.ts)
export const CRISIS_CLASSIFIER_ONLY_CHECKIN = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
} as const satisfies FlagSpec;

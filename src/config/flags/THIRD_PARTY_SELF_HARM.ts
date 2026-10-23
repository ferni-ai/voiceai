import type { FlagSpec } from '../flag-spec.js';

// live: "he keeps saying he'll hurt himself", "kill himself", "end their life" get the third-party crisis guidance (988 on their behalf); shadow: log turns whose read would change, no reply change (services/safety/crisis-third-party.ts)
export const THIRD_PARTY_SELF_HARM = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
} as const satisfies FlagSpec;

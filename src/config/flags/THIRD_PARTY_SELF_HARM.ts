import type { FlagSpec } from '../flag-spec.js';

// off | shadow | live: on a third-party crisis read, one more classifier read decides who is at risk (self, third party, bereaved); live may reroute, never lower; shadow logs kind and booleans only (services/safety/crisis-who.ts, #2635)
export const THIRD_PARTY_SELF_HARM = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
} as const satisfies FlagSpec;

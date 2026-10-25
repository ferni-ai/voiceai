import type { FlagSpec } from '../flag-spec.js';

// On: GET /api/on-it answers with what Ferni is holding and doing for the signed-in person (services/on-it/on-it.ts, read in api/on-it-route.ts). Off: the route does not exist (404).
export const FERNI_ON_IT = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
} as const satisfies FlagSpec;

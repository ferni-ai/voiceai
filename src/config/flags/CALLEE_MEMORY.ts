import type { FlagSpec } from '../flag-spec.js';

// on: after an on-behalf call a person answered, what they said (screened, no contact data, codes or money, never orders to the assistant) is kept 90 days in its own store, bogle_users/{uid}/call_memories, apart from the owner's own facts; off = nothing is written or read (services/outreach/callee-memory/)
export const CALLEE_MEMORY = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
} as const satisfies FlagSpec;

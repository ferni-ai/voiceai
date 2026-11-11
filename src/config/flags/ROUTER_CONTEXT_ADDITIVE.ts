import type { FlagSpec } from '../flag-spec.js';

// On: the semantic router's context layer only adds a capped bonus (+0.10) to a tool the turn already names, never averages into its score, and a turn never boosts itself (semantic-router/context-additive.ts). Off: the boost is averaged in, which lowers or drops a tool scoring above it (crisis_support too).
export const ROUTER_CONTEXT_ADDITIVE = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
  expires: '2027-02-09',
  issue: 'https://github.com/ferni-ai/voiceai/issues/3750',
  context:
    'Keep if crisis_support and named tools never lose rank to the context boost in the router evals; else delete.',
} as const satisfies FlagSpec;

import type { FlagSpec } from '../flag-spec.js';

// On: the semantic router's context layer only adds a capped bonus to a tool's score and
// never averages into it, and a turn never boosts itself (semantic-router/context-additive.ts).
// Off: the boost is averaged in, which lowers any tool scoring above ~0.3 (crisis_support too).
export const ROUTER_CONTEXT_ADDITIVE = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
} as const satisfies FlagSpec;

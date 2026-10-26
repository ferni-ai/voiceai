import type { FlagSpec } from '../flag-spec.js';

// on: turn 1's cold steps in the per-turn build yield to the event loop between them, and the Vertex client is built at process warm-up (call-path-warmup.ts), not mid-reply. Read by first-turn-warm.ts; off = as on main.
export const FIRST_TURN_WARM = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;

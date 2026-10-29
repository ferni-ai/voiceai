import type { FlagSpec } from '../flag-spec.js';

// on: the per-turn build's cold steps yield to the event loop between them on every turn, not only turn 1 (turn-intelligence.ts), and the Vertex client is built at process warm-up (call-path-warmup.ts), not mid-reply. Read by first-turn-warm.ts; off = main's path, no yield and no warm-up.
export const FIRST_TURN_WARM = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;

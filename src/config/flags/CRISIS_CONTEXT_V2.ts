import type { FlagSpec } from '../flag-spec.js';

// on: on a turn answering Ferni's own crisis line or safety question, the crisis classifier also runs a read with that line marked as Ferni's check-in (never evidence by itself) beside main's plain read; the answer is the plain read, raised to the marked read's verdict when that is higher and already in, so it never lowers or delays a read. Off on calls where main's pattern detector found risk, and without a call id (services/safety/crisis-context-v2.ts)
export const CRISIS_CONTEXT_V2 = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;

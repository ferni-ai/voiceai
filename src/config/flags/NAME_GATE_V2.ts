import type { FlagSpec } from '../flag-spec.js';

// on: no caller name in a question, wider vocatives, session.say() lines gated, and a prompt line
// asking for a statement-final name (agents/personas/name-gate.ts, scripted-name-gate.ts)
export const NAME_GATE_V2 = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;

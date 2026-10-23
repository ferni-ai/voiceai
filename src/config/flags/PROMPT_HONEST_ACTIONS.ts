import type { FlagSpec } from '../flag-spec.js';

// on: tool guidance tells personas to read back a call, text or booking and wait for a yes, to say plainly when a tool is not on this call, and to never claim an action a tool did not run (prompt-loader.ts, *.honest.md); an unknown caller zone gets no clock time in the Right now line (world-now.ts).
export const PROMPT_HONEST_ACTIONS = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;

import type { FlagSpec } from '../flag-spec.js';

// off | on: no naturalness acknowledgment (the first-turn remark about the caller's surroundings, or a rapport repair cue) is spoken on a crisis turn: one the crisis read replaced, guided or gave a soft check-in, or that has no crisis read (fail closed). The turn's reply and every other naturalness step are untouched. Read in agents/voice-agent/crisis-turn-memory.ts, used by turn-handler.ts.
export const CRISIS_TURN_NO_ACK = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
  expires: '2027-02-23',
  issue: '#4451',
  context: 'dev on: ordinary turns speak their acknowledgment as before; a crisis turn speaks none',
} as const satisfies FlagSpec;

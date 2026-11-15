import type { FlagSpec } from '../flag-spec.js';

// on: when the turn path runs for a call (turn intelligence hooked at the first persona's setup, agents/multi-agent/agent-setup.ts), the transcript handler no longer captures each final transcript into dynamic memory; process-turn and the turn handler already capture every run that carries it. The single-agent path and TURN_INTELLIGENCE=off keep the transcript handler's capture, the only one there. Off: three captures per line on the turn path, as before.
export const TURN_PATH_SINGLE_CAPTURE = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
  expires: '2027-02-13',
  issue: '#3892',
  context:
    'Keep if the turn-number rows match the old path and in-call memory reads the same with one capture; else delete.',
} as const satisfies FlagSpec;

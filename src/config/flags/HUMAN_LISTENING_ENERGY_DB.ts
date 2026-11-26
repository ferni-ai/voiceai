import type { FlagSpec } from '../flag-spec.js';

// off | on (#4241): the human-listening pipeline reads a voice as quiet only when it is soft or a whisper in dB (volumeLevelOfDb, below -35). Off compares the dB value to 40, so every reading reads as quiet and asks for space (speech/human-listening-pipeline/analyzers.ts).
export const HUMAN_LISTENING_ENERGY_DB = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-18',
  issue: '#4241',
  context:
    'dev on: the human-listening give-space hint should trip on a minority of turns with a voice reading, not all of them',
} as const satisfies FlagSpec;

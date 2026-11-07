import type { FlagSpec } from '../flag-spec.js';

// on (per person: their cohort value beats the env): the after-call fact sweep (fact-sweep.ts) reads the AI friend's lines too, tagged "Caller:" / "AI friend:", and both it and deep extraction (deep-extraction-worker.ts) are told whose "you" is (memory/dynamic/fact-subject.ts), so what the AI friend says about its own life is not stored as the caller's. Nothing is dropped after the model. off = prompts and facts as before.
export const FACT_SUBJECT_GUARD = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
  expires: '2027-02-02',
  issue: 'TBD',
  context:
    'Keep if persona facts stop being stored as the caller facts with no recall lost; else delete.',
} as const satisfies FlagSpec;

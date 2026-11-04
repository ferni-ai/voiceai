import type { FlagSpec } from '../flag-spec.js';

// on (per person: their cohort value beats the env): the after-call fact sweep (fact-sweep.ts) reads the AI friend's lines too, tagged, and both it and deep extraction (deep-extraction-worker.ts) are told whose "you" is. A fact is then dropped only on positive evidence it is the persona's: a persona statement owns a name in it ("my buddies Theo and Wren") that the caller only echoed, or the caller spoke of its thing as the persona's ("I thought you had a dog") (memory/dynamic/fact-subject-guard.ts). Logs FACT_SUBJECT_DROPPED reason counts only. off = facts stored as before.
export const FACT_SUBJECT_GUARD = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
} as const satisfies FlagSpec;

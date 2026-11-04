import type { FlagSpec } from '../flag-spec.js';

// on (per person: their cohort value beats the env): the after-call fact sweep (fact-sweep.ts) and deep extraction (deep-extraction-worker.ts) are told "you" means the persona, and a fact is dropped when it is the persona's (a canon person or pet, owned by a persona line of the call, or only spoken of as "your ...") and the caller never made it theirs (memory/dynamic/fact-subject-guard.ts). Logs FACT_SUBJECT_DROPPED reason counts only. off = facts stored as before.
export const FACT_SUBJECT_GUARD = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
} as const satisfies FlagSpec;

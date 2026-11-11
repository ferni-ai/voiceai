import type { FlagSpec } from '../flag-spec.js';

// on: the nightly /api/jobs/person-model job builds and stores the call sheet (bogle_users/{uid}/person_model/current) for people whose own cohort flag is on (person-model-job.ts); read in calls under PERSON_MODEL_READ (agents/multi-agent/call-sheet); off = nothing is read or written.
export const PERSON_MODEL = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
} as const satisfies FlagSpec;

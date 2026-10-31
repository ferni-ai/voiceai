import type { FlagSpec } from '../flag-spec.js';

// on (per person: their cohort value beats the env): the dynamic_facts extractor (deep-extraction-worker.ts) and the world_facts ingest (world-model/temporal/ingest.ts) also propose each fact they wrote to the memory writer (memory/writer/facts-dual-write.ts), which needs MEMORY_FACTS on for that person too; the legacy writes are unchanged and a writer failure is logged by id and count only. off = no facts writes.
export const FACTS_DUAL_WRITE = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
} as const satisfies FlagSpec;

/**
 * The memory flags a cohort or an override may set, spread into COHORT_FLAGS
 * (cohort-flags.ts) and kept here with when each is read. Each read was checked:
 * it runs after applyCallerFlags and is never cached across calls, or it runs
 * after the call and asks per person.
 *
 * @module services/platform/memory-cohort-flags
 */
export const MEMORY_COHORT_FLAGS = [
  // Read on each turn's persona context, never at boot (intelligence-builders.ts getPersonaBuilder
  // and isBriefedArrival, peter-research-insights :253); the cache holds the loaded builder only.
  'PERSONA_BRIEFING_ALEX',
  'PERSONA_BRIEFING_JORDAN',
  'PERSONA_BRIEFING_MAYA',
  'PERSONA_BRIEFING_NAYAN',
  'PERSONA_BRIEFING_PETER_HANDOFF',
  'HANDOFF_DESK', // read at each handoff (orchestrator.ts writeDesk), never at boot
  // Read when a memory tool runs and on each turn's nearest-facts search, never at boot
  // (remembered-facts.ts, honest-memory.ts, stored-fact-vectors.ts).
  'REMEMBER_TO_RECALL',
  'MEMORY_TOOLS_HONEST',
  // After the call, per person: dualWriteFacts reads both through personFlagOn or envForCaller
  // (facts-dual-write.ts). Not ACTIVITY_LEDGER: nothing reads or writes the ledger yet.
  'FACTS_DUAL_WRITE',
  'MEMORY_FACTS',
] as const;

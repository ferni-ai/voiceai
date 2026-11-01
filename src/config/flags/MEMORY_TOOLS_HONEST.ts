import type { FlagSpec } from '../flag-spec.js';

// on: the memory tools say only what the store recall reads holds. rememberAboutUser and rememberImportantFact write dynamic_facts through the remembered-fact writer (remembered-facts.ts, REMEMBER_TO_RECALL's) and answer from that write; updateMemory replaces the fact recall holds or says none matched; predictUserNeed stores nothing and labels its guess. Read in remembered-facts.ts and tools/domains/memory/honest-memory.ts; off = the tools as before.
export const MEMORY_TOOLS_HONEST = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
} as const satisfies FlagSpec;

import type { FlagSpec } from '../flag-spec.js';

// on (needs DATES_THAT_MATTER and WORLD_MODEL_TEMPORAL): a date the caller told us, within three days, can be the one thread of the hello, and the recall note does not ask about it again. A sensitive date is never said as a question. Read in agents/multi-agent/greeting-date.ts, memory-recall-hook.ts and dates/recall.ts (docs/plans/2026-10-31-right-moment-memory.md §5.5). Off: the hello is as before.
export const DATES_IN_HELLO = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
} as const satisfies FlagSpec;

import type { FlagSpec } from '../flag-spec.js';

// On: three rare forget readers read the caller's forgotten topics from the store each time,
// skipping forget-topics-source's 15 s cache, which only a forget in this process invalidates:
// recentContext, the call-end summary writer (last-summary) and the remembered-fact write guard
// (remember-to-recall, under MEMORY_TOOLS_HONEST). A topic forgotten on another process's call
// then counts at once (at most the store's 2 s shared read), not up to 15 s later. Still bounded
// at 300 ms and fail closed (#2755). The per-turn readers (revived intelligence, topicsWithin,
// topicsNow) stay on the cache.
export const FORGET_FRESH_READ = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
  expires: '2027-02-22',
  issue: '#2755',
} as const satisfies FlagSpec;

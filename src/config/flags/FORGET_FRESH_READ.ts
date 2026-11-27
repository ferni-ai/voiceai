import type { FlagSpec } from '../flag-spec.js';

// On: the rare forget readers read the caller's forgotten topics from the store each time,
// skipping forget-topics-source's 15 s cache, which only a forget in this process invalidates.
// A topic forgotten on another process's call then counts at once (at most the store's 2 s
// shared read), not up to 15 s later. Each read is bounded at 300 ms (#2755). Per call, fail
// closed: recentContext, the call-end summary writer (last-summary) and the remembered-fact write
// guard (remember-to-recall, under MEMORY_TOOLS_HONEST). At call start, late or failed falling
// back to the last known topics as off: the profile scrub (profileForPrompt: setup-profile, the
// single-agent awareness block), the single-agent greeting's profile and the caller card. At call
// start, left out when late or failed: the greeting's intentions and open threads
// (callStartPassageCheck) and the recent texts. The per-turn readers (topicsNow,
// forgottenCheckNow and the other topicsWithin callers) and tools stay on the cache.
export const FORGET_FRESH_READ = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
  expires: '2027-02-22',
  issue: '#2755',
} as const satisfies FlagSpec;

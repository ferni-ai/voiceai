import type { FlagSpec } from '../flag-spec.js';

// On: recentContext reads the caller's forgotten topics from the store on every call, skipping
// forget-topics-source's 15 s cache, which only a forget in this process invalidates. A topic
// forgotten on another process's call is then honoured at once (at most the store's 2 s
// shared-read window), not up to 15 s later. Still bounded at 300 ms and fail closed (#2755).
export const RECENT_CONTEXT_FRESH_FORGET_READ = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
  expires: '2027-02-22',
  issue: '#2755',
} as const satisfies FlagSpec;

import type { FlagSpec } from '../flag-spec.js';

// on: with WEB_SEARCH off, searchWeb's empty or failed DuckDuckGo instant answer says "[status: unconfigured]", that it can't search the web and doesn't know, and not to estimate a time, distance or price; never "No results" (tools/domains/information/search.ts). off = "No results for ...".
export const WEB_SEARCH_HONEST_FALLBACK = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
} as const satisfies FlagSpec;

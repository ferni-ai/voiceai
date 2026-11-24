import type { FlagSpec } from '../flag-spec.js';

// On: a forgotten topic (memory/recall/forget.ts) stays out of every memory reader that reaches
// the prompt, not only recall's: the caller profile in the system prompt, greeting and single-agent
// awareness (last summaries, life events, goals, concerns), the handoff summary, the relationship
// tool, the BM25 and entity search legs, UnifiedStore.recall, entity proactive surfacing, and
// recall notes already in the chat, re-checked each turn (forget-every-reader.ts), and the earlier
// turns a resumed or moved call replays (restored-turns-remembered.ts: no last-known fallback,
// fails closed). Not on prod until memory v2 (#3075) bounds the readers' last-known topics
// fallback (#2623 closed unmerged, folded into it): with no age bound, a timed-out read can
// serve a list missing a topic forgotten in another process. Dev runs it on.
export const FORGET_EVERY_READER = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
} as const satisfies FlagSpec;

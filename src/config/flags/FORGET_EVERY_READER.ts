import type { FlagSpec } from '../flag-spec.js';

// On: a forgotten topic (memory/recall/forget.ts) stays out of what reaches the prompt beyond
// recall: the inline turn context and the greeting read the caller's profile and this call's
// userData through filtered views (prompt-view.ts), as do the registered context builders (no
// live call runs them today); the system prompt, greeting history and single-agent awareness, the
// handoff summary, the relationship and recall tools, hybrid search's keyword and entity legs,
// UnifiedStore.recall, entity surfacing, the proactive call's opener and proactive check-ins
// (proactive-tick.ts) check it too. Recall notes: one about a forgotten topic is never sent, a
// held one is checked again as it lands, and a forget takes them out of the chat at once.
// Not covered: session priming's Firestore reads of call summaries, and stored transcripts.
// Accepted gaps:
// - a reply already generating when the forget lands keeps the context it started with;
// - the handoff's recent messages (historyTracker) are passed on unfiltered;
// - in PREEMPT_STABLE_CONTEXT=defer, notes held by writers other than recall (live-call
//   behaviours, mind notes) are not checked again as they land;
// - a forget made in another process is seen within the 15 s cache; when a read fails, the
//   topics last read (up to 60 s old, or during this call) are used, else everything is left out;
// - a topic matches only text that has all of its words (stemmed; names whole): a paraphrase
//   that shares none of them gets through.
export const FORGET_EVERY_READER = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
} as const satisfies FlagSpec;

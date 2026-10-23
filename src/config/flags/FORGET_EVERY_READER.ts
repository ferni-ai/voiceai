import type { FlagSpec } from '../flag-spec.js';

// On: a forgotten topic (memory/recall/forget.ts) stays out of what reaches the prompt beyond
// recall: every registered context builder, the inline turn context and the greeting read the
// caller's profile and this call's userData through filtered views (prompt-view.ts); the system
// prompt, greeting history and single-agent awareness, the handoff summary, the relationship and
// recall tools, hybrid search's keyword and entity legs, UnifiedStore.recall, entity surfacing and
// recall notes already in the chat check it too. Not covered: session priming's Firestore reads of
// call summaries, the proactive opener's lastSessionSummary, and stored transcripts.
export const FORGET_EVERY_READER = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
} as const satisfies FlagSpec;

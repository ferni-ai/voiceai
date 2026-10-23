import type { FlagSpec } from '../flag-spec.js';

// On: a forgotten topic (memory/recall/forget.ts) stays out of what reaches the prompt beyond
// recall: the inline turn context and the greeting read the caller's profile and this call's
// userData through filtered views (prompt-view.ts), as do the registered context builders (no
// live call runs them today); the system prompt, greeting history and single-agent awareness, the
// handoff summary, the relationship and recall tools, hybrid search's keyword and entity legs,
// UnifiedStore.recall, entity surfacing, the proactive call's opener, proactive check-ins
// (proactive-tick.ts), the pre-meeting push (calendar-trigger-worker.ts), insight-action messages
// (insight-messages.ts), the better-than-human celebration push, the greeting's thread starter,
// insight and check-in opener, queued outreach triggers (outreach-worker.ts: Maya's habit loop
// among them; a reason about it goes as the plain check-in), held calls when placed
// (deferred-calls.ts) and group outreach, the team celebration among them, check it too. Time
// zones, locales and ids are never filtered. Without the flag, insight messages and the commitment
// quote still never name a forgotten topic (when the list can't be read, insight messages say the
// plain check-in and the quote is skipped). Recall notes: one about a forgotten topic is never
// sent, a held one is checked again as it lands, and a forget takes them out of the chat at once.
// Not covered: session priming's Firestore reads of call summaries, and stored transcripts.
// Proactive senders not covered: thinking-of-you moments (trust-systems/outreach-integration.ts),
// the daily job's decision-engine pushes and calls (recent topics, struggles), growth
// reflections, life-rhythm outreach, outreach scheduled in a call and texts held for later (both
// written before a forget can land), reminders the caller set, scheduled family check-in calls,
// batch messages to contacts, and the in-call outreach tools (agent-to-user.ts).
// Accepted gaps:
// - a reply already generating when the forget lands keeps the context it started with;
// - the handoff's recent messages (historyTracker) are passed on unfiltered;
// - in PREEMPT_STABLE_CONTEXT=defer, notes held by writers other than recall (live-call
//   behaviours, mind notes) are not checked again as they land;
// - a forget made in another process is seen within the 15 s cache; when a read fails or hangs
//   past 5 s, the topics last read (up to 60 s old, or during this call) are used, else
//   everything is left out;
// - a topic matches only text that has all of its words (stemmed; names whole): a paraphrase
//   that shares none of them gets through. Stemming is English only, so another language's
//   inflected form (развода for развод) gets through, and in scripts written without spaces
//   (Chinese, Japanese, Thai) a topic matches only the same unbroken run;
// - a hyphenated compound hides on either part (well-known hides a "known" topic): intended
//   over-hiding, so "divorce-papers" and "a Biscuit-shaped cake" are caught;
// - hybrid search never waits past its leg deadline for the topics: then the last read apply,
//   else it returns nothing that turn.
export const FORGET_EVERY_READER = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
} as const satisfies FlagSpec;

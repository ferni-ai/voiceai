/**
 * Registers the theory-of-mind update (intelligence/theory-of-mind/after-call.ts)
 * as an after-call task, with the Firestore store, so endSession starts it once
 * the summary is saved and the job process waits for it before exiting
 * (services/session/after-call-tasks.ts). THEORY_OF_MIND=on turns it on.
 *
 * @module agents/theory-of-mind-register
 */
import { registerAfterCallTask } from '../services/session/after-call-tasks.js';
import { updateTheoryOfMindAfterCall } from '../intelligence/theory-of-mind/after-call.js';
import type { CallSummaryView } from '../intelligence/theory-of-mind/extract.js';
import { firestoreMindStore } from '../memory/storage/mind-store.js';
import { forgottenFilter } from './multi-agent/mind-note-hook.js';

export const THEORY_OF_MIND_TASK = 'theory-of-mind';

registerAfterCallTask(
  THEORY_OF_MIND_TASK,
  async (ctx) => {
    await updateTheoryOfMindAfterCall(
      {
        userId: ctx.userId,
        sessionId: ctx.sessionId,
        turns: [...ctx.turns],
        summary: (ctx.summary ?? null) as CallSummaryView | null,
      },
      { store: firestoreMindStore, forgotten: () => forgottenFilter(ctx.userId) }
    );
  },
  // Headroom over the update's own 15 s limit (after-call.ts), so its log line wins.
  { timeoutMs: 20_000 }
);

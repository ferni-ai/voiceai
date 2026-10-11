/**
 * Registers the theory-of-mind update as an after-call task, so endSession
 * starts it once the summary is saved and the job process waits for it before
 * exiting (services/session/after-call-tasks.ts). Imported once, for its side
 * effect, from agents/after-call-register.ts.
 *
 * @module intelligence/theory-of-mind/register
 */

import { registerAfterCallTask } from '../../services/session/after-call-tasks.js';
import { updateTheoryOfMindAfterCall } from './after-call.js';
import type { CallSummaryView } from './extract.js';

export const THEORY_OF_MIND_TASK = 'theory-of-mind';

registerAfterCallTask(
  THEORY_OF_MIND_TASK,
  async (ctx) => {
    await updateTheoryOfMindAfterCall({
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      turns: [...ctx.turns],
      summary: (ctx.summary ?? null) as CallSummaryView | null,
    });
  },
  { timeoutMs: 15_000 }
);

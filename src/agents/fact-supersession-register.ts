/**
 * Registers fact supersession (memory/dynamic/fact-supersession.ts) as an
 * after-call task, with the summarizer's model. FACT_SUPERSESSION=on turns
 * it on; off, the task returns at once.
 *
 * @module agents/fact-supersession-register
 */
import { registerAfterCallTask } from '../services/session/after-call-tasks.js';
import { callLLM } from '../services/llm/llm-utils.js';
import { factSupersessionEnabled, supersedeNewFacts } from '../memory/dynamic/fact-supersession.js';

registerAfterCallTask(
  'fact-supersession',
  async (ctx) => {
    if (!factSupersessionEnabled()) return;
    await supersedeNewFacts(ctx.userId, {
      llm: (prompt) => callLLM(prompt, { temperature: 0, maxTokens: 600 }),
      since: ctx.startedAt,
    });
  },
  // One model call; facts whose extraction ends after the call are read on the next run.
  { timeoutMs: 45_000 }
);

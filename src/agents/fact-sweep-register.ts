/**
 * Registers the after-call fact sweep (memory/dynamic/fact-sweep.ts) as an
 * after-call task, with the summarizer's model. FACT_SWEEP=on turns it on;
 * off, the task returns before any model call.
 *
 * @module agents/fact-sweep-register
 */
import { callLLM } from '../services/llm-utils.js';
import {
  registerAfterCallTask,
  type AfterCallContext,
} from '../services/session/after-call-tasks.js';
import {
  factSweepEnabled,
  sweepCall,
  type SweepLLM,
  type SweepStore,
} from '../memory/dynamic/fact-sweep.js';

export const FACT_SWEEP_TASK = 'fact-sweep';

/** The task body; exported so tests can run it with a fake model and store. */
export async function sweepAfterCall(
  ctx: AfterCallContext,
  deps: { llm?: SweepLLM; store?: SweepStore; env?: Record<string, string | undefined> } = {}
): Promise<number> {
  if (!factSweepEnabled(deps.env)) return 0;
  const lines = ctx.turns.filter((t) => t.role === 'user').map((t) => t.content);
  return sweepCall(
    {
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      startedAt: ctx.startedAt,
      lines,
      timeZone: ctx.timezone,
    },
    {
      llm: deps.llm ?? (async (prompt) => callLLM(prompt, { temperature: 0, maxTokens: 2000 })),
      ...(deps.store && { store: deps.store }),
    }
  );
}

registerAfterCallTask(
  FACT_SWEEP_TASK,
  async (ctx) => {
    await sweepAfterCall(ctx);
  },
  // A few model calls, one after another (at most six windows).
  { timeoutMs: 60_000 }
);

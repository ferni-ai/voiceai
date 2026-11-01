/**
 * Registers the persona growth writer (persona-growth-after-call.ts) as an
 * after-call task. Imported by agents/after-call-register.ts. With
 * PERSONA_GROWTH off for the caller the task returns before any read or model call.
 *
 * @module agents/personas/persona-growth-register
 */

import { registerAfterCallTask } from '../../services/session/after-call-tasks.js';
import { GROWTH_TASK, recordGrowthAfterCall } from './persona-growth-after-call.js';

// One model call and at most one store read and write.
registerAfterCallTask(
  GROWTH_TASK,
  async (ctx) => {
    await recordGrowthAfterCall(ctx);
  },
  { timeoutMs: 20_000 }
);

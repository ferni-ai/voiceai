/**
 * Registers the after-call world extraction as an after-call task, so
 * endSession starts it once the call has ended and the job process waits for
 * it before exiting (services/session/after-call-tasks.ts). Imported once, for
 * its side effect, from agents/after-call-register.ts.
 *
 * Both flags must be on: AFTER_CALL_EXTRACTION to read the call, and
 * WORLD_MODEL_TEMPORAL for the store it writes to. With either off the task
 * returns before any model call.
 *
 * @module intelligence/world-model/extraction/register
 */

import { callLLM } from '../../../services/llm-utils.js';
import {
  registerAfterCallTask,
  type AfterCallContext,
} from '../../../services/session/after-call-tasks.js';
import { recordWorldObservations, type IngestDeps } from '../temporal/ingest.js';
import { isWorldModelTemporalOn } from '../temporal/types.js';
import {
  extractWorldObservations,
  isAfterCallExtractionOn,
  type ExtractionLlm,
} from './after-call-extraction.js';

export const WORLD_EXTRACTION_TASK = 'world-extraction';

const llm: ExtractionLlm = (prompt) =>
  callLLM(prompt, { maxTokens: 2000, temperature: 0.1, timeout: 20_000, task: 'memory' });

/** The task body; exported so tests can run it with a fake model and store. */
export async function extractWorldAfterCall(
  ctx: AfterCallContext,
  deps: IngestDeps & { llm?: ExtractionLlm } = {}
): Promise<void> {
  if (!isAfterCallExtractionOn(deps.env) || !isWorldModelTemporalOn(deps.env)) return;
  const observations = await extractWorldObservations(
    [...ctx.turns],
    { sessionId: ctx.sessionId, startedAt: ctx.startedAt, timezone: ctx.timezone },
    deps.llm ?? llm
  );
  await recordWorldObservations(ctx.userId, ctx.sessionId, observations, deps);
}

registerAfterCallTask(WORLD_EXTRACTION_TASK, (ctx) => extractWorldAfterCall(ctx), {
  timeoutMs: 30_000,
});

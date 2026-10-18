/**
 * Registers the after-call world extraction as an after-call task, so
 * endSession starts it once the call has ended and the job process waits for
 * it before exiting (services/session/after-call-tasks.ts). Imported once, for
 * its side effect, from agents/after-call-register.ts.
 *
 * AFTER_CALL_EXTRACTION must be on to read the call. The reading then feeds
 * two sinks: the temporal store (WORLD_MODEL_TEMPORAL=on) and the caller's
 * commitments (COACH_COMMITMENT_CAPTURE, on unless =off). With no sink on,
 * the task returns before any model call.
 *
 * @module intelligence/world-model/extraction/register
 */

import { callLLM } from '../../../services/llm-utils.js';
import {
  isCommitmentCaptureOn,
  recordCallerCommitments,
  type CaptureDeps,
} from '../../../services/superhuman/index.js';
import {
  registerAfterCallTask,
  type AfterCallContext,
} from '../../../services/session/after-call-tasks.js';
import { envForCaller, type CohortStore } from '../../../services/platform/cohort-flags.js';
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
  deps: IngestDeps & { llm?: ExtractionLlm; commitments?: CaptureDeps; cohorts?: CohortStore } = {}
): Promise<void> {
  if (!isAfterCallExtractionOn(deps.env)) return;
  // WORLD_MODEL_TEMPORAL as this caller's call had it: process.env may hold the next caller's.
  const callerEnv = await envForCaller(ctx.userId, { env: deps.env, store: deps.cohorts });
  const world = isWorldModelTemporalOn(callerEnv);
  const capture = isCommitmentCaptureOn(deps.env);
  if (!world && !capture) return;
  const observations = await extractWorldObservations(
    [...ctx.turns],
    { sessionId: ctx.sessionId, startedAt: ctx.startedAt, timezone: ctx.timezone },
    deps.llm ?? llm
  );
  // userId is the session's (endSession), never anything the model returned.
  await Promise.all([
    capture
      ? recordCallerCommitments(
          observations,
          {
            userId: ctx.userId,
            sessionId: ctx.sessionId,
            now: Date.now(),
            ...(ctx.timezone && { timezone: ctx.timezone }),
          },
          { env: deps.env, ...deps.commitments }
        )
      : null,
    world
      ? recordWorldObservations(ctx.userId, ctx.sessionId, observations, {
          ...deps,
          env: callerEnv,
        })
      : null,
  ]);
}

registerAfterCallTask(WORLD_EXTRACTION_TASK, (ctx) => extractWorldAfterCall(ctx), {
  timeoutMs: 30_000,
});

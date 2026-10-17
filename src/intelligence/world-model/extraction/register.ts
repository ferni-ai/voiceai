/**
 * Registers the after-call world extraction as an after-call task, so
 * endSession starts it once the call has ended and the job process waits for
 * it before exiting (services/session/after-call-tasks.ts). Imported once, for
 * its side effect, from agents/after-call-register.ts.
 *
 * AFTER_CALL_EXTRACTION must be on to read the call. The reading then feeds
 * two sinks: the temporal store (WORLD_MODEL_TEMPORAL=on) and the caller's
 * commitments (COACH_COMMITMENT_CAPTURE, on unless =off). With no sink on,
 * the task returns before any model call. Both switches are read as the
 * caller's own call had them (cohort-flags.ts callerEnv), since the next call
 * may already have put its caller's flags in process.env.
 *
 * @module intelligence/world-model/extraction/register
 */

import { callLLM } from '../../../services/llm-utils.js';
import { callerEnv } from '../../../services/platform/cohort-flags.js';
import {
  isCommitmentCaptureOn,
  recordCallerCommitments,
  type CaptureDeps,
} from '../../../services/superhuman/index.js';
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

const llm: ExtractionLlm = async (prompt) =>
  callLLM(prompt, { maxTokens: 2000, temperature: 0.1, timeout: 20_000, task: 'memory' });

/** The task body; exported so tests can run it with a fake model and store. */
export async function extractWorldAfterCall(
  ctx: AfterCallContext,
  deps: IngestDeps & { llm?: ExtractionLlm; commitments?: CaptureDeps } = {}
): Promise<void> {
  const env = deps.env ?? (await callerEnv(ctx.userId));
  if (!isAfterCallExtractionOn(env)) return;
  const world = isWorldModelTemporalOn(env);
  const capture = isCommitmentCaptureOn(env);
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
          { env, ...deps.commitments }
        )
      : null,
    world
      ? recordWorldObservations(ctx.userId, ctx.sessionId, observations, { ...deps, env })
      : null,
  ]);
}

registerAfterCallTask(WORLD_EXTRACTION_TASK, async (ctx) => extractWorldAfterCall(ctx), {
  timeoutMs: 30_000,
});

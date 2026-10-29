/**
 * Registers the after-call world extraction as an after-call task, so
 * endSession starts it once the call has ended and the job process waits for
 * it before exiting (services/session/after-call-tasks.ts). Imported once, for
 * its side effect, from agents/after-call-register.ts.
 *
 * AFTER_CALL_EXTRACTION must be on to read the call. The reading then feeds
 * two sinks: the temporal store (WORLD_MODEL_TEMPORAL=on) and the caller's
 * commitments (COACH_COMMITMENT_CAPTURE, on unless =off). With no sink on,
 * the task returns before any model call. With COMMITMENT_SINGLE_WRITER on
 * for the caller, commitments come from their own judged read of the call
 * (commitment-judge.ts) instead of the extraction's.
 *
 * @module intelligence/world-model/extraction/register
 */

import { callLLM } from '../../../services/llm-utils.js';
import {
  isCommitmentCaptureOn,
  isCommitmentSingleWriterOn,
  recordCallerCommitments,
  recordJudgedCommitments,
  type CaptureDeps,
  type JudgedDeps,
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
import { judgeCallCommitments } from './commitment-judge.js';

export const WORLD_EXTRACTION_TASK = 'world-extraction';

const llm: ExtractionLlm = (prompt) =>
  callLLM(prompt, { maxTokens: 2000, temperature: 0.1, timeout: 20_000, task: 'memory' });
/** No task, so never Claude: the judge's second try when Claude's reply holds no JSON. */
const geminiLlm: ExtractionLlm = (prompt) =>
  callLLM(prompt, { maxTokens: 2000, temperature: 0.1, timeout: 20_000 });

/** The task body; exported so tests can run it with a fake model and store. */
export async function extractWorldAfterCall(
  ctx: AfterCallContext,
  deps: IngestDeps & {
    llm?: ExtractionLlm;
    judgeFallback?: ExtractionLlm;
    commitments?: CaptureDeps;
    judged?: JudgedDeps;
    cohorts?: CohortStore;
  } = {}
): Promise<void> {
  if (!isAfterCallExtractionOn(deps.env)) return;
  // Flags as this caller's call had them: process.env may hold the next caller's.
  const callerEnv = await envForCaller(ctx.userId, { env: deps.env, store: deps.cohorts });
  const world = isWorldModelTemporalOn(callerEnv);
  const capture = isCommitmentCaptureOn(deps.env);
  const judged = capture && isCommitmentSingleWriterOn(callerEnv);
  if (!world && !capture) return;
  const call = { sessionId: ctx.sessionId, startedAt: ctx.startedAt, timezone: ctx.timezone };
  const model = deps.llm ?? llm;
  // userId is the session's (endSession), never anything the model returned.
  const capturing = {
    userId: ctx.userId,
    sessionId: ctx.sessionId,
    now: Date.now(),
    ...(ctx.timezone && { timezone: ctx.timezone }),
  };
  // Started alongside the extraction: both model reads must fit the task's 30 s.
  const judging = judged
    ? judgeCallCommitments(
        [...ctx.turns],
        call,
        model,
        deps.judgeFallback ?? (deps.llm ? undefined : geminiLlm)
      ).then(async (found) =>
        recordJudgedCommitments(found, capturing, { env: deps.env, ...deps.judged })
      )
    : null;
  const observations =
    world || !judged ? await extractWorldObservations([...ctx.turns], call, model) : [];
  await Promise.all([
    capture && !judged
      ? recordCallerCommitments(observations, capturing, { env: deps.env, ...deps.commitments })
      : null,
    judging,
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

/**
 * Release-gate metrics from the live-call eval harness (scripts/voice-eval/).
 *
 * The voice agent runs on LiveKit Cloud with no public HTTP, so the gate's
 * latency, barge-in and memory checks read the harness's JSON instead of the
 * retired VM's /api/observability:
 *
 *   VOICE_EVAL_RESULT  pooled score.mjs output:
 *                        node scripts/voice-eval/score.mjs out/*-<label>.json > pooled.json
 *   VOICE_EVAL_RECALL  pooled recall-facts.mjs output (memory check only):
 *                        node scripts/voice-eval/recall-facts.mjs --json out/<recall>-<arm>-*.json > recall.json
 *
 * OBS_URL still selects the old HTTP path (e.g. a local agent's health server)
 * when no eval file is given. With neither, a check fails and says what to pass.
 */

import { readFileSync } from 'node:fs';

/**
 * Where a check should read its metrics from.
 * @param {Record<string, string | undefined>} env
 * @param {string} evalVar env var naming the eval JSON for this check
 */
export function metricsSource(env, evalVar = 'VOICE_EVAL_RESULT') {
  if (env[evalVar]) return { kind: 'eval', path: env[evalVar] };
  if (env.OBS_URL) return { kind: 'obs', url: env.OBS_URL };
  return {
    kind: 'missing',
    error:
      `No metrics source. Pass ${evalVar}=<path to voice-eval JSON> (see scripts/ops/voice-eval-metrics.mjs), ` +
      'or OBS_URL=<agent /api/observability URL> for an agent with a reachable health server.',
  };
}

export function readEvalJson(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    throw new Error(`Cannot read voice-eval result ${path}: ${error?.message || error}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Voice-eval result ${path} is not JSON: ${error?.message || error}`);
  }
}

const notMeasured = (fields, reason) => ({
  ok: false,
  skipped: false,
  notMeasured: true,
  ...fields,
  reason,
});

/** First audio: score.mjs replyDelayMs (end of caller audio to first agent audio). p50 stands in for the old average. */
export function evaluateFirstAudioFromEval(score, maxMs) {
  const delay = score?.replyDelayMs;
  const base = { source: 'voice-eval', metric: 'replyDelayMs.p50', maxMs };
  if (typeof delay?.p50 !== 'number' || !(delay.n > 0)) {
    return notMeasured(
      base,
      'Not measured: voice-eval result has no replyDelayMs samples (is it score.mjs output?)'
    );
  }
  return {
    ok: delay.p50 > 0 && delay.p50 <= maxMs,
    ...base,
    replyDelayP50Ms: delay.p50,
    replyDelayP90Ms: delay.p90 ?? null,
    samples: delay.n,
  };
}

/**
 * Barge-in: score.mjs talkOver (caller interrupts the agent mid-reply, from the
 * talk-over scenario). The harness reports p50 stop latency, not the p95 the
 * observability path checks, and every interrupt must have stopped the agent.
 */
export function evaluateBargeInFromEval(score, maxMs) {
  const t = score?.talkOver;
  const base = { source: 'voice-eval', metric: 'talkOver.interruptStopMs.p50', maxMs };
  if (!(t?.interrupts > 0)) {
    return notMeasured(
      base,
      'Not measured: voice-eval result has no caller interrupts. Include the talk-over scenario in the pooled runs.'
    );
  }
  const stopP50Ms = t.interruptStopMs?.p50;
  const allYielded = t.interruptYielded === t.interrupts;
  const fast = typeof stopP50Ms === 'number' && stopP50Ms <= maxMs;
  return {
    ok: allYielded && fast,
    ...base,
    interruptStopP50Ms: stopP50Ms ?? null,
    interrupts: t.interrupts,
    interruptYielded: t.interruptYielded ?? 0,
    ...(allYielded
      ? {}
      : {
          reason: `Agent kept talking through ${t.interrupts - (t.interruptYielded ?? 0)} interrupt(s)`,
        }),
  };
}

/** Memory: recall-facts.mjs --json pooled rate of seeded facts Ferni brought back unprompted. */
export function evaluateMemoryFromRecall(recall, minRecallRate) {
  const base = { source: 'voice-eval', metric: 'recall-facts mean', minRecallRate };
  if (!(recall?.n > 0) || typeof recall.mean !== 'number') {
    return notMeasured(
      base,
      'Not measured: recall result has no scored recall calls (is it recall-facts.mjs --json output?)'
    );
  }
  return {
    ok: recall.mean >= minRecallRate,
    ...base,
    recallRate: recall.mean,
    recallRateCi: recall.lo === null ? null : [recall.lo, recall.hi],
    calls: recall.n,
    avoidSlips: recall.slips ?? 0,
  };
}

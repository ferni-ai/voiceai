/**
 * First-audio latency SLO assert for SOTA Wave 5.
 *
 * Usage (current stack, LiveKit Cloud agent):
 *   VOICE_EVAL_RESULT=scripts/voice-eval/pooled.json node scripts/ops/assert-first-audio-slo.mjs
 *   (pooled.json: `node scripts/voice-eval/score.mjs out/*-<label>.json`; see the voice-eval skill)
 *
 * Or, against an agent whose health server is reachable (e.g. local):
 *   OBS_URL=http://localhost:8080/api/observability node scripts/ops/assert-first-audio-slo.mjs
 *
 * Optional: FIRST_AUDIO_MAX_MS=3000 (or MAX_MS)
 *
 * Eval: exit 0 iff replyDelayMs.p50 > 0 AND <= max.
 * OBS:  exit 0 iff avgFirstResponseTimeMs > 0 AND <= max.
 * Neither given, or the metric is missing: exit 1 with the reason.
 */

import { evaluateFirstAudioFromEval, metricsSource, readEvalJson } from './voice-eval-metrics.mjs';

const MAX_MS = Number(process.env.FIRST_AUDIO_MAX_MS || process.env.MAX_MS || 3000);

async function fetchObservability(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Observability HTTP ${res.status}`);
  }
  const body = await res.json();
  return body.callQuality || body;
}

function printResult(result) {
  console.log(JSON.stringify(result, null, 2));
}

async function evaluate() {
  const source = metricsSource(process.env);
  if (source.kind === 'missing') return { ok: false, maxMs: MAX_MS, error: source.error };
  if (source.kind === 'eval') return evaluateFirstAudioFromEval(readEvalJson(source.path), MAX_MS);

  const metrics = await fetchObservability(source.url);
  const avgFirstResponseTimeMs = Number(metrics?.avgFirstResponseTimeMs || 0);
  return {
    ok: avgFirstResponseTimeMs > 0 && avgFirstResponseTimeMs <= MAX_MS,
    source: 'observability',
    avgFirstResponseTimeMs,
    maxMs: MAX_MS,
    stages: metrics?.lastSessionStages ?? null,
  };
}

async function main() {
  try {
    const result = await evaluate();
    printResult(result);
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    printResult({
      ok: false,
      maxMs: MAX_MS,
      error: String(error?.message || error),
    });
    process.exit(1);
  }
}

main();

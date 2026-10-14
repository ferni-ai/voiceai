/**
 * Barge-in recover latency SLO assert for SOTA Wave 2.
 *
 * Usage (current stack, LiveKit Cloud agent):
 *   VOICE_EVAL_RESULT=scripts/voice-eval/pooled.json node scripts/ops/assert-barge-in-slo.mjs
 *   (pooled score.mjs output that includes talk-over runs; see the voice-eval skill)
 *
 * Or, against an agent whose health server is reachable (e.g. local):
 *   OBS_URL=http://localhost:8080/api/observability node scripts/ops/assert-barge-in-slo.mjs
 *
 * Optional: BARGE_IN_MAX_MS=500 (or MAX_MS)
 *
 * Eval: exit 0 iff the caller interrupted at least once, every interrupt
 *       stopped the agent, and talkOver.interruptStopMs.p50 <= max. The
 *       harness reports p50, not p95. No interrupts: exit 1, "not measured".
 * OBS:  exit 0 iff no samples exist (unless REQUIRE_SAMPLES=true), or
 *       bargeInRecoverP95Ms <= max.
 * Neither given: exit 1 with what to pass.
 */

import { evaluateBargeInFromEval, metricsSource, readEvalJson } from './voice-eval-metrics.mjs';

const MAX_MS = Number(process.env.BARGE_IN_MAX_MS || process.env.MAX_MS || 500);

async function fetchObservability(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Observability HTTP ${res.status}`);
  }
  const body = await res.json();
  return body.callQuality || body;
}

export function evaluateBargeInSlo(metrics) {
  const samples = Number(metrics?.bargeInRecoverSamples || 0);
  const bargeInRecoverP95Ms = Number(metrics?.bargeInRecoverP95Ms || 0);

  if (samples === 0) {
    const requireSamples = process.env.REQUIRE_SAMPLES === 'true';
    return {
      ok: !requireSamples,
      skipped: true,
      bargeInRecoverP95Ms,
      samples,
      maxMs: MAX_MS,
      ...(requireSamples ? { reason: 'No barge-in samples (REQUIRE_SAMPLES=true)' } : {}),
    };
  }

  return {
    ok: bargeInRecoverP95Ms <= MAX_MS,
    skipped: false,
    bargeInRecoverP95Ms,
    samples,
    maxMs: MAX_MS,
  };
}

function printResult(result) {
  console.log(JSON.stringify(result, null, 2));
}

async function main() {
  try {
    const source = metricsSource(process.env);
    const result =
      source.kind === 'missing'
        ? { ok: false, skipped: false, maxMs: MAX_MS, error: source.error }
        : source.kind === 'eval'
          ? evaluateBargeInFromEval(readEvalJson(source.path), MAX_MS)
          : evaluateBargeInSlo(await fetchObservability(source.url));
    printResult(result);
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    printResult({
      ok: false,
      skipped: false,
      bargeInRecoverP95Ms: 0,
      samples: 0,
      maxMs: MAX_MS,
      error: String(error?.message || error),
    });
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

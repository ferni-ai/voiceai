/**
 * Memory-that-speaks SLO assert for SOTA Wave 3.
 *
 * Usage (current stack, LiveKit Cloud agent):
 *   VOICE_EVAL_RECALL=recall.json node scripts/ops/assert-memory-speak-slo.mjs
 *   (recall.json: `node scripts/voice-eval/recall-facts.mjs --json out/<recall>-<arm>-*.json`
 *    over seed -> recall pairs from scripts/voice-eval/batch.sh)
 *
 * Or, against an agent whose health server is reachable (e.g. local):
 *   OBS_URL=http://localhost:8080/api/observability node scripts/ops/assert-memory-speak-slo.mjs
 *
 * Optional: MIN_RECALL_RATE=0.1
 *
 * Eval: exit 0 iff the pooled recall rate >= MIN_RECALL_RATE. score.mjs output
 *       (VOICE_EVAL_RESULT) has no recall metric, so it alone fails "not measured".
 * OBS:  if sessionsWithMemoryData is 0, the check skips successfully
 *       (unless REQUIRE_SAMPLES=true).
 * Neither given: exit 1 with what to pass.
 */

import { evaluateMemoryFromRecall, metricsSource, readEvalJson } from './voice-eval-metrics.mjs';

const MIN_RECALL_RATE = Number(process.env.MIN_RECALL_RATE || 0.1);

export function evaluateMemorySpeakSlo(payload, minRecallRate = MIN_RECALL_RATE) {
  // Prefer hub memory snapshot (includes speak-rate fields), then callQuality.memory.
  const memory = payload?.memory || payload?.callQuality?.memory || payload;
  const sessionsWithMemoryData = Number(memory?.sessionsWithMemoryData || 0);
  const sessionsWithMemoryRecalls = Number(memory?.sessionsWithMemoryRecalls || 0);
  const memoryRecallRate = Number(memory?.memoryRecallRate || 0);
  const memoryRecallsPerSession = Number(memory?.memoryRecallsPerSession || 0);

  if (sessionsWithMemoryData === 0) {
    const requireSamples = process.env.REQUIRE_SAMPLES === 'true';
    return {
      ok: !requireSamples,
      skipped: true,
      reason: requireSamples
        ? 'No sessions with memory data (REQUIRE_SAMPLES=true)'
        : 'No sessions with memory data',
      sessionsWithMemoryData,
      sessionsWithMemoryRecalls,
      memoryRecallRate,
      memoryRecallsPerSession,
      minRecallRate,
    };
  }

  const ok = memoryRecallRate >= minRecallRate;
  return {
    ok,
    skipped: false,
    sessionsWithMemoryData,
    sessionsWithMemoryRecalls,
    memoryRecallRate,
    memoryRecallsPerSession,
    minRecallRate,
  };
}

async function fetchObservability(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Observability HTTP ${res.status}`);
  }
  return res.json();
}

function printResult(result) {
  console.log(JSON.stringify(result, null, 2));
}

async function main() {
  try {
    const source = metricsSource(process.env, 'VOICE_EVAL_RECALL');
    let result;
    if (source.kind === 'eval') {
      result = evaluateMemoryFromRecall(readEvalJson(source.path), MIN_RECALL_RATE);
    } else if (source.kind === 'obs') {
      result = evaluateMemorySpeakSlo(await fetchObservability(source.url));
    } else if (process.env.VOICE_EVAL_RESULT) {
      result = {
        ok: false,
        skipped: false,
        notMeasured: true,
        minRecallRate: MIN_RECALL_RATE,
        reason:
          'Not measured: score.mjs output (VOICE_EVAL_RESULT) has no memory recall metric. ' +
          'Pass VOICE_EVAL_RECALL=<recall-facts.mjs --json output>.',
      };
    } else {
      result = { ok: false, skipped: false, minRecallRate: MIN_RECALL_RATE, error: source.error };
    }
    printResult(result);
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    printResult({
      ok: false,
      skipped: false,
      error: String(error?.message || error),
      minRecallRate: MIN_RECALL_RATE,
    });
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

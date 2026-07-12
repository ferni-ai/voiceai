/**
 * Memory-that-speaks SLO assert for SOTA Wave 3.
 *
 * Usage:
 *   node scripts/ops/assert-memory-speak-slo.mjs
 *
 * Optional:
 *   OBS_URL=http://34.134.186.63:8080/api/observability
 *   MIN_RECALL_RATE=0.1
 *
 * If sessionsWithMemoryData is 0, the check skips successfully.
 */

const OBS_URL = process.env.OBS_URL || 'http://34.134.186.63:8080/api/observability';
const MIN_RECALL_RATE = Number(process.env.MIN_RECALL_RATE || 0.1);

export function evaluateMemorySpeakSlo(payload, minRecallRate = MIN_RECALL_RATE) {
  const metrics = payload?.callQuality || payload;
  const memory = metrics?.memory || metrics;
  const sessionsWithMemoryData = Number(memory?.sessionsWithMemoryData || 0);
  const sessionsWithMemoryRecalls = Number(memory?.sessionsWithMemoryRecalls || 0);
  const memoryRecallRate = Number(memory?.memoryRecallRate || 0);
  const memoryRecallsPerSession = Number(memory?.memoryRecallsPerSession || 0);

  if (sessionsWithMemoryData === 0) {
    return {
      ok: true,
      skipped: true,
      reason: 'No sessions with memory data',
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

async function fetchObservability() {
  const res = await fetch(OBS_URL);
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
    const payload = await fetchObservability();
    const result = evaluateMemorySpeakSlo(payload);
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

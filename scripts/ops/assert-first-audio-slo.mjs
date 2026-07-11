/**
 * First-audio latency SLO assert for SOTA Wave 5.
 *
 * Usage:
 *   node scripts/ops/assert-first-audio-slo.mjs
 *
 * Optional:
 *   OBS_URL=http://34.134.186.63:8080/api/observability
 *   MAX_MS=3000
 *
 * Exit 0 iff avgFirstResponseTimeMs > 0 AND avgFirstResponseTimeMs <= MAX_MS.
 * Prints JSON: { ok, avgFirstResponseTimeMs, maxMs, stages }
 */

const OBS_URL = process.env.OBS_URL || 'http://34.134.186.63:8080/api/observability';
const MAX_MS = Number(process.env.MAX_MS || 3000);

async function fetchObservability() {
  const res = await fetch(OBS_URL);
  if (!res.ok) {
    throw new Error(`Observability HTTP ${res.status}`);
  }
  const body = await res.json();
  return body.callQuality || body;
}

function printResult(result) {
  console.log(JSON.stringify(result, null, 2));
}

async function main() {
  try {
    const metrics = await fetchObservability();
    const avgFirstResponseTimeMs = Number(metrics?.avgFirstResponseTimeMs || 0);
    const stages = metrics?.lastSessionStages ?? null;
    const ok = avgFirstResponseTimeMs > 0 && avgFirstResponseTimeMs <= MAX_MS;

    const result = {
      ok,
      avgFirstResponseTimeMs,
      maxMs: MAX_MS,
      stages,
    };

    printResult(result);
    process.exit(ok ? 0 : 1);
  } catch (error) {
    printResult({
      ok: false,
      avgFirstResponseTimeMs: 0,
      maxMs: MAX_MS,
      stages: null,
      error: String(error?.message || error),
    });
    process.exit(1);
  }
}

main();

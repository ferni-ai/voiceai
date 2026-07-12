/**
 * Barge-in recover latency SLO assert for SOTA Wave 2.
 *
 * Usage:
 *   node scripts/ops/assert-barge-in-slo.mjs
 *
 * Optional:
 *   OBS_URL=http://34.134.186.63:8080/api/observability
 *   MAX_MS=500
 *
 * Exit 0 iff no samples exist, or bargeInRecoverP95Ms <= MAX_MS.
 * Prints JSON: { ok, skipped, bargeInRecoverP95Ms, samples, maxMs }
 */

const OBS_URL = process.env.OBS_URL || 'http://34.134.186.63:8080/api/observability';
const MAX_MS = Number(process.env.MAX_MS || 500);

async function fetchObservability() {
  const res = await fetch(OBS_URL);
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
    return {
      ok: true,
      skipped: true,
      bargeInRecoverP95Ms,
      samples,
      maxMs: MAX_MS,
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
    const metrics = await fetchObservability();
    const result = evaluateBargeInSlo(metrics);
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

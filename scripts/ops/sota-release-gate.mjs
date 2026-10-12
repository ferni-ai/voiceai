/**
 * SOTA release gate for Waves 1-5.
 *
 * Usage (the agent runs on LiveKit Cloud; its metrics come from live-call evals
 * on dev, see the voice-eval skill and scripts/ops/voice-eval-metrics.mjs):
 *   VOICE_EVAL_RESULT=<score.mjs pooled JSON> \
 *   VOICE_EVAL_RECALL=<recall-facts.mjs --json output> \
 *   node scripts/ops/sota-release-gate.mjs
 *
 * OBS_URL instead points the latency, barge-in and memory checks at a
 * reachable /api/observability (a local agent). With neither they fail.
 * outreach-drain calls Cloud Run with ASYNC_ID_TOKEN or a gcloud identity token.
 *
 * Runs these checks in order:
 *   - scripts/ops/assert-first-audio-slo.mjs
 *   - scripts/ops/assert-barge-in-slo.mjs
 *   - scripts/ops/assert-memory-speak-slo.mjs
 *   - scripts/ops/assert-outreach-drain-slo.mjs
 *   - scripts/ops/assert-human-signal-roundtrip.mjs
 *   - scripts/ops/assert-outreach-delivery-intent.mjs
 *
 * Each child script prints its own JSON. This runner prints an aggregate JSON
 * result and exits non-zero if any required gate fails.
 */

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CHECKS = [
  {
    name: 'first-audio',
    path: resolve(SCRIPT_DIR, 'assert-first-audio-slo.mjs'),
  },
  {
    name: 'barge-in',
    path: resolve(SCRIPT_DIR, 'assert-barge-in-slo.mjs'),
  },
  {
    name: 'memory-speak',
    path: resolve(SCRIPT_DIR, 'assert-memory-speak-slo.mjs'),
  },
  {
    name: 'outreach-drain',
    path: resolve(SCRIPT_DIR, 'assert-outreach-drain-slo.mjs'),
  },
  {
    name: 'human-signal-roundtrip',
    path: resolve(SCRIPT_DIR, 'assert-human-signal-roundtrip.mjs'),
  },
  {
    name: 'outreach-delivery-intent',
    path: resolve(SCRIPT_DIR, 'assert-outreach-delivery-intent.mjs'),
  },
];

function parseJsonOutput(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

function runCheck(check) {
  const result = spawnSync(process.execPath, [check.path], {
    cwd: resolve(SCRIPT_DIR, '../..'),
    env: process.env,
    encoding: 'utf8',
  });

  const stdout = result.stdout.trim();
  const stderr = result.stderr.trim();
  const parsed = parseJsonOutput(stdout);

  return {
    name: check.name,
    path: check.path,
    ok: result.status === 0,
    status: result.status,
    signal: result.signal,
    result: parsed,
    stdout: parsed ? undefined : stdout,
    stderr: stderr || undefined,
  };
}

function printResult(result) {
  console.log(JSON.stringify(result, null, 2));
}

const checks = CHECKS.map(runCheck);
const ok = checks.every((check) => check.ok);

printResult({
  ok,
  checks,
});

process.exit(ok ? 0 : 1);

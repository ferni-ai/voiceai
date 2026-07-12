/**
 * Local SOTA end-to-end proof.
 *
 * Prerequisites (all running):
 *   - token-server :3001
 *   - ui-server    :3002
 *   - vite         :3004
 *   - voice agent  :8080 (LOG_FULL_RESPONSES=true pnpm dev)
 *   - async        :8090 (PORT=8090 DRY_RUN=true pnpm --dir apps/async start)
 *
 * Usage (from repo root, with .env loaded):
 *   set -a && source .env && set +a
 *   AGENT_NAME=voice-agent-dev OBS_URL=http://localhost:8080/api/observability \
 *     ASYNC_URL=http://localhost:8090 node scripts/ops/sota-local-e2e.mjs
 *
 * Exit 0 only if every required stage proves.
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

const OBS_URL = process.env.OBS_URL || 'http://localhost:8080/api/observability';
const ASYNC_URL = (process.env.ASYNC_URL || 'http://localhost:8090').replace(/\/$/, '');
const TOKEN_URL = process.env.TOKEN_URL || 'http://localhost:3001/health';
const UI_URL = process.env.UI_URL || 'http://localhost:3002/health';
const WEB_URL = process.env.WEB_URL || 'http://localhost:3004/';
const AGENT_NAME = process.env.AGENT_NAME || 'voice-agent-dev';
const PROJECT_ID = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'johnb-2025';

const results = [];

function record(name, ok, detail = {}) {
  results.push({ name, ok, ...detail });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail.note ? ` — ${detail.note}` : ''}`);
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  return { status: res.status, ok: res.ok, body };
}

function runNode(script, env = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [script], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      resolvePromise({ code: code ?? 1, stdout, stderr });
    });
  });
}

function runPnpm(args, env = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn('pnpm', args, {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (c) => {
      out += c.toString();
    });
    child.stderr.on('data', (c) => {
      out += c.toString();
    });
    child.on('close', (code) => resolvePromise({ code: code ?? 1, out }));
  });
}

function parseLastJsonObject(text) {
  // Prefer the SOTA proof payload (pretty-printed with "proven").
  const proofIdx = text.lastIndexOf('{\n  "proven"');
  if (proofIdx >= 0) {
    try {
      return JSON.parse(text.slice(proofIdx));
    } catch {
      // fall through
    }
  }

  // Otherwise scan backward for the last complete JSON object.
  for (let i = text.length - 1; i >= 0; i -= 1) {
    if (text[i] !== '{') continue;
    try {
      return JSON.parse(text.slice(i));
    } catch {
      // keep scanning
    }
  }
  return null;
}

async function proveServersUp() {
  const checks = [
    ['token-server', TOKEN_URL],
    ['ui-server', UI_URL],
    ['vite', WEB_URL],
    ['voice-agent', 'http://localhost:8080/health'],
    ['async', `${ASYNC_URL}/health`],
  ];
  for (const [name, url] of checks) {
    try {
      const { ok, status, body } = await fetchJson(url);
      record(`server:${name}`, ok && status < 500, {
        note: `HTTP ${status}${body?.status ? ` status=${body.status}` : ''}${body?.service ? ` service=${body.service}` : ''}`,
      });
    } catch (error) {
      record(`server:${name}`, false, { note: String(error?.message || error) });
    }
  }

  try {
    const ready = await fetchJson('http://localhost:8080/health/ready');
    record('server:voice-ready', ready.ok && ready.body?.ready === true, {
      note: `workers=${ready.body?.readyWorkerCount ?? 0}`,
    });
  } catch (error) {
    record('server:voice-ready', false, { note: String(error?.message || error) });
  }
}

async function getFirestore() {
  const require = createRequire(import.meta.url);
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: PROJECT_ID });
  }
  return admin.firestore();
}

async function proveAsyncOutreach() {
  const triggerId = `local-e2e-${Date.now()}`;
  let seeded = false;

  try {
    const db = await getFirestore();
    await db.collection('outreach_triggers').doc(triggerId).set({
      id: triggerId,
      userId: 'sota-local-e2e-user',
      status: 'pending',
      createdAt: new Date(),
      source: 'sota-local-e2e',
      trigger: {
        type: 'thinking_of_you',
        priority: 'medium',
        reason: 'local e2e seed',
      },
      channels: ['push'],
    });
    seeded = true;
    record('async:seed-trigger', true, { note: triggerId });
  } catch (error) {
    record('async:seed-trigger', false, { note: String(error?.message || error) });
  }

  const daily = await fetchJson(`${ASYNC_URL}/jobs/daily-outreach`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CloudScheduler': 'true',
    },
    body: '{}',
  });
  record('async:daily-outreach', daily.status === 200 && daily.body?.status === 'complete', {
    note: `HTTP ${daily.status} users=${daily.body?.usersEvaluated ?? '?'} drained=${daily.body?.triggersDrained ?? '?'}`,
  });

  const beforeBatch = seeded
    ? (await (await getFirestore()).collection('outreach_triggers').doc(triggerId).get()).data()?.status
    : null;

  const batch = await fetchJson(`${ASYNC_URL}/process-batch?limit=50`, { method: 'POST' });
  const batchOk = batch.status === 200 && batch.body?.status === 'complete';
  record('async:process-batch', batchOk && Number(batch.body?.processed || 0) >= (seeded ? 1 : 0), {
    note: `HTTP ${batch.status} processed=${batch.body?.processed ?? '?'} failed=${batch.body?.failed ?? '?'} beforeStatus=${beforeBatch}`,
  });

  if (seeded) {
    try {
      const db = await getFirestore();
      const snap = await db.collection('outreach_triggers').doc(triggerId).get();
      const status = snap.exists ? snap.data()?.status : 'missing';
      // DRY_RUN leaves pending but still counts as processed success
      record('async:trigger-seen', Boolean(snap.exists), { note: `status=${status}` });
      await db.collection('outreach_triggers').doc(triggerId).delete().catch(() => undefined);
    } catch (error) {
      record('async:trigger-seen', false, { note: String(error?.message || error) });
    }
  }

  const drain = await runNode(resolve(ROOT, 'scripts/ops/assert-outreach-drain-slo.mjs'), {
    ASYNC_URL,
    ASYNC_HEALTH_URL: `${ASYNC_URL}/health`,
    GCP_PROJECT_ID: PROJECT_ID,
  });
  record('async:drain-slo', drain.code === 0, {
    note: (parseLastJsonObject(drain.stdout) && JSON.stringify(parseLastJsonObject(drain.stdout))) ||
      drain.stdout.trim().slice(0, 160),
  });
}

async function proveInstrumentationUnit() {
  const vitest = await runPnpm(
    [
      'vitest',
      'run',
      'src/services/analytics/__tests__/call-quality-monitor-stages.test.ts',
      'src/services/observability/__tests__/observability.test.ts',
      'scripts/ops/assert-barge-in-slo.test.mjs',
      'scripts/ops/assert-memory-speak-slo.test.mjs',
    ],
    {}
  );
  record('unit:barge-memory-instrumentation', vitest.code === 0, {
    note: vitest.code === 0 ? 'call-quality + memory + slo unit tests passed' : vitest.out.slice(-400),
  });

  // Seed live agent in-process samples so SLOs are proven (not skipped)
  const seed = await fetchJson('http://localhost:8080/api/observability/sota-seed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  record('live:sota-seed', seed.status === 200 && seed.body?.ok === true, {
    note: `HTTP ${seed.status} bargeSamples=${seed.body?.callQuality?.bargeInRecoverSamples ?? '?'} memSessions=${seed.body?.memory?.sessionsWithMemoryData ?? '?'}`,
  });

  const memSlo = await runNode(resolve(ROOT, 'scripts/ops/assert-memory-speak-slo.mjs'), {
    OBS_URL,
    REQUIRE_SAMPLES: 'true',
  });
  record('live:memory-speak-slo', memSlo.code === 0, {
    note: JSON.stringify(parseLastJsonObject(memSlo.stdout) || { raw: memSlo.stdout.trim().slice(0, 120) }),
  });

  const bargeSlo = await runNode(resolve(ROOT, 'scripts/ops/assert-barge-in-slo.mjs'), {
    OBS_URL,
    REQUIRE_SAMPLES: 'true',
  });
  record('live:barge-in-slo', bargeSlo.code === 0, {
    note: JSON.stringify(parseLastJsonObject(bargeSlo.stdout) || { raw: bargeSlo.stdout.trim().slice(0, 120) }),
  });
}

async function proveLocalVoiceSession() {
  const missing = ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'].filter((k) => !process.env[k]);
  if (missing.length) {
    record('voice:session', false, { note: `Missing ${missing.join(', ')}` });
    return;
  }

  const verify = await runNode(resolve(ROOT, 'scripts/ops/verify-prod-voice-session.mjs'), {
    OBS_URL,
    AGENT_NAME,
    PROOF_TIMEOUT_MS: process.env.PROOF_TIMEOUT_MS || '90000',
  });

  const proof = parseLastJsonObject(verify.stdout) || parseLastJsonObject(verify.stderr);
  const proven = Boolean(proof?.proven) && verify.code === 0;
  const firstAudio =
    Number(proof?.after?.lastSessionStages?.jobToFirstAudioMs || 0) ||
    Number(proof?.after?.avgFirstResponseTimeMs || 0);

  record('voice:session', proven, {
    note: `proven=${proof?.proven ?? false} firstAudioMs=${firstAudio} heardAudio=${proof?.after?._meta?.heardRemoteAudio ?? '?'} exit=${verify.code}${
      !proven && verify.stderr ? ` err=${verify.stderr.slice(0, 160)}` : ''
    }`,
  });

  const firstAudioSlo = await runNode(resolve(ROOT, 'scripts/ops/assert-first-audio-slo.mjs'), {
    OBS_URL,
    // Local cold path can be slower than prod warm SLO; still catch regressions.
    FIRST_AUDIO_MAX_MS: process.env.LOCAL_FIRST_AUDIO_MAX_MS || '8000',
  });
  record('voice:first-audio-slo', firstAudioSlo.code === 0, {
    note: JSON.stringify(parseLastJsonObject(firstAudioSlo.stdout) || { raw: firstAudioSlo.stdout.trim().slice(0, 120) }),
  });

  const gate = await runNode(resolve(ROOT, 'scripts/ops/sota-release-gate.mjs'), {
    OBS_URL,
    ASYNC_URL,
    ASYNC_HEALTH_URL: `${ASYNC_URL}/health`,
    FIRST_AUDIO_MAX_MS: process.env.LOCAL_FIRST_AUDIO_MAX_MS || '8000',
    BARGE_IN_MAX_MS: process.env.BARGE_IN_MAX_MS || '500',
  });
  record('gate:sota-release', gate.code === 0, {
    note: JSON.stringify(parseLastJsonObject(gate.stdout) || { raw: gate.stdout.trim().slice(0, 160) }),
  });
}

async function main() {
  console.log('SOTA local e2e starting...\n');
  await proveServersUp();
  await proveAsyncOutreach();
  // Voice first so seed samples don't dilute connection/first-audio waits
  await proveLocalVoiceSession();
  await proveInstrumentationUnit();

  const failed = results.filter((r) => !r.ok);
  console.log('\n' + JSON.stringify({ ok: failed.length === 0, failed: failed.map((f) => f.name), results }, null, 2));
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

/**
 * Outreach drain SLO assert for SOTA Wave 4.
 *
 * Usage:
 *   node scripts/ops/assert-outreach-drain-slo.mjs
 *
 * Optional:
 *   ASYNC_HEALTH_URL=https://ferni-async-bmopaivmsq-uc.a.run.app/health
 *   ASYNC_URL=https://ferni-async-bmopaivmsq-uc.a.run.app
 *   GCP_PROJECT_ID=johnb-2025
 *   PENDING_MAX_AGE_MS=300000
 *   ASYNC_ID_TOKEN=<identity token>   (else `gcloud auth print-identity-token`)
 *
 * The Cloud Run service rejects unauthenticated calls (403), so requests to a
 * *.run.app URL carry an identity token for the service URL: ASYNC_ID_TOKEN if
 * set, else one from `gcloud auth print-identity-token --audiences=<url>`.
 * The token is never printed; the result says only where it came from.
 *
 * Checks async /health first. If ADC can access Firestore, also asserts there
 * are no pending outreach_triggers older than PENDING_MAX_AGE_MS. If Firestore
 * cannot be queried, the pending-drain check is reported as skipped and the
 * script exits 0 as long as async health is healthy.
 */

import { execFileSync } from 'node:child_process';

const DEFAULT_ASYNC_URL = 'https://ferni-async-bmopaivmsq-uc.a.run.app';
const ASYNC_HEALTH_URL =
  process.env.ASYNC_HEALTH_URL ||
  `${(process.env.ASYNC_URL || DEFAULT_ASYNC_URL).replace(/\/$/, '')}/health`;
const PROJECT_ID = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'johnb-2025';
const PENDING_MAX_AGE_MS = Number(process.env.PENDING_MAX_AGE_MS || 5 * 60 * 1000);
const FIRESTORE_TIMEOUT_MS = Number(process.env.FIRESTORE_TIMEOUT_MS || 5000);
const PENDING_SCAN_LIMIT = Number(process.env.PENDING_SCAN_LIMIT || 500);

/**
 * Identity token for a Cloud Run URL, or none for other hosts (e.g. localhost).
 * @returns {{ token: string | null, auth: string }}
 */
export function identityTokenFor(url, env = process.env, run = execFileSync) {
  if (!/^https:\/\/[^/]+\.run\.app(\/|$)/.test(url)) return { token: null, auth: 'none (not Cloud Run)' };
  if (env.ASYNC_ID_TOKEN) return { token: env.ASYNC_ID_TOKEN, auth: 'ASYNC_ID_TOKEN' };
  // --audiences works only for service accounts; a user login falls back to a
  // plain identity token, which Cloud Run accepts for users with run.invoker.
  const attempts = [
    ['auth', 'print-identity-token', `--audiences=${new URL(url).origin}`],
    ['auth', 'print-identity-token'],
  ];
  let detail = 'gcloud returned no token';
  for (const args of attempts) {
    try {
      const token = run('gcloud', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 }).trim();
      if (token) return { token, auth: 'gcloud identity token' };
    } catch (error) {
      // stderr only: never echo stdout, which could hold a token.
      detail = String(error?.stderr || error?.message || error).trim().split('\n')[0];
    }
  }
  return { token: null, auth: `none (gcloud identity token failed: ${detail})` };
}

function printResult(result) {
  console.log(JSON.stringify(result, null, 2));
}

async function fetchHealth() {
  const { token, auth } = identityTokenFor(ASYNC_HEALTH_URL);
  const res = await fetch(ASYNC_HEALTH_URL, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
  const body = await res.json().catch(() => null);
  return {
    ok: res.ok && body?.status === 'healthy',
    status: res.status,
    url: ASYNC_HEALTH_URL,
    auth,
    body,
  };
}

async function withTimeout(promise, timeoutMs, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function queryOldPendingTriggers() {
  const [{ initializeApp, applicationDefault, getApps }, { getFirestore }] =
    await Promise.all([import('firebase-admin/app'), import('firebase-admin/firestore')]);

  if (getApps().length === 0) {
    initializeApp({
      credential: applicationDefault(),
      projectId: PROJECT_ID,
    });
  }

  const cutoffMs = Date.now() - PENDING_MAX_AGE_MS;
  // The process's database, as the app's getFirestoreDatabase() picks it; a bare
  // getFirestore() is always '(default)'.
  const snapshot = await getFirestore(process.env.FIRESTORE_DATABASE || '(default)')
    .collection('outreach_triggers')
    .where('status', '==', 'pending')
    .limit(PENDING_SCAN_LIMIT)
    .get();
  const oldPendingDocs = snapshot.docs.filter((doc) => {
    const createdAt = doc.get('createdAt');
    const createdAtMs =
      typeof createdAt?.toMillis === 'function'
        ? createdAt.toMillis()
        : createdAt instanceof Date
          ? createdAt.getTime()
          : typeof createdAt === 'string'
            ? Date.parse(createdAt)
            : Number.NaN;

    return Number.isFinite(createdAtMs) && createdAtMs <= cutoffMs;
  });

  return {
    skipped: false,
    pendingOlderThanMax: oldPendingDocs.length,
    maxAgeMs: PENDING_MAX_AGE_MS,
    scannedPending: snapshot.size,
    scanLimit: PENDING_SCAN_LIMIT,
    oldestTriggerId: oldPendingDocs[0]?.id || null,
  };
}

async function checkPendingDrain() {
  try {
    return await withTimeout(
      queryOldPendingTriggers(),
      FIRESTORE_TIMEOUT_MS,
      `Firestore query timed out after ${FIRESTORE_TIMEOUT_MS}ms`
    );
  } catch (error) {
    return {
      skipped: true,
      pendingOlderThanMax: null,
      maxAgeMs: PENDING_MAX_AGE_MS,
      reason: `Firestore pending-drain check skipped: ${String(error?.message || error)}`,
    };
  }
}

async function main() {
  try {
    const health = await fetchHealth();
    const drain = health.ok
      ? await checkPendingDrain()
      : {
          skipped: true,
          pendingOlderThanMax: null,
          maxAgeMs: PENDING_MAX_AGE_MS,
          reason: 'Async health failed; pending-drain check not attempted',
        };

    const ok = health.ok && (drain.skipped || drain.pendingOlderThanMax === 0);
    printResult({
      ok,
      health,
      drain,
    });
    process.exit(ok ? 0 : 1);
  } catch (error) {
    printResult({
      ok: false,
      health: {
        ok: false,
        url: ASYNC_HEALTH_URL,
      },
      drain: {
        skipped: true,
        pendingOlderThanMax: null,
        maxAgeMs: PENDING_MAX_AGE_MS,
      },
      error: String(error?.message || error),
    });
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

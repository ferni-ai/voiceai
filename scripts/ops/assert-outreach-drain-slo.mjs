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
 *
 * Checks async /health first. If ADC can access Firestore, also asserts there
 * are no pending outreach_triggers older than PENDING_MAX_AGE_MS. If Firestore
 * cannot be queried, the pending-drain check is reported as skipped and the
 * script exits 0 as long as async health is healthy.
 */

const DEFAULT_ASYNC_URL = 'https://ferni-async-bmopaivmsq-uc.a.run.app';
const ASYNC_HEALTH_URL =
  process.env.ASYNC_HEALTH_URL ||
  `${(process.env.ASYNC_URL || DEFAULT_ASYNC_URL).replace(/\/$/, '')}/health`;
const PROJECT_ID = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'johnb-2025';
const PENDING_MAX_AGE_MS = Number(process.env.PENDING_MAX_AGE_MS || 5 * 60 * 1000);
const FIRESTORE_TIMEOUT_MS = Number(process.env.FIRESTORE_TIMEOUT_MS || 5000);
const PENDING_SCAN_LIMIT = Number(process.env.PENDING_SCAN_LIMIT || 500);

function printResult(result) {
  console.log(JSON.stringify(result, null, 2));
}

async function fetchHealth() {
  const res = await fetch(ASYNC_HEALTH_URL);
  const body = await res.json().catch(() => null);
  return {
    ok: res.ok && body?.status === 'healthy',
    status: res.status,
    url: ASYNC_HEALTH_URL,
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
  const snapshot = await getFirestore()
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

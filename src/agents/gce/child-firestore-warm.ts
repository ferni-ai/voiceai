/**
 * Open the call's Firestore clients in the job child before it says `ready`.
 *
 * A fresh process pays each client's channel, TLS and auth setup on its first read: locally
 * 456-644 ms for a first read against 104-186 ms after (2026-10-29), and on dev a
 * one-process-per-call greeting took ~0.4 s longer in the context build than a warm worker's
 * (voiceai-evidence two-jobs-proof SUMMARY). With nothing else to do before a call, the child
 * reads one never-written document on each of the call path's clients (utils/shared-firestore.ts):
 * the one with ignoreUndefinedProperties (getFirestoreDb and the persistence layer) and the
 * strict one the call path's other stores share.
 *
 * Bounded and never throws: a slow or failed warm-up must not delay `ready` past WARM_BUDGET_MS.
 *
 * @module agents/gce/child-firestore-warm
 */
import type { LogFn } from './warmup.js';

const WARM_BUDGET_MS = 3_000;

/** Never written: read once to open each client. */
const SHARED_WARMUP_DOC = '_warmup/shared';
const STRICT_WARMUP_DOC = '_warmup/strict';

export interface FirestoreWarmers {
  shared: () => Promise<boolean>;
  strict: () => Promise<boolean>;
}

const defaultWarmers: FirestoreWarmers = {
  shared: async () => {
    const { getFirestoreDb } = await import('../../utils/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) return false;
    await db.doc(SHARED_WARMUP_DOC).get();
    return true;
  },
  // The stores that build their client without ignoreUndefinedProperties share this one.
  strict: async () => {
    const { sharedFirestore } = await import('../../utils/shared-firestore.js');
    const { getFirestoreDatabase } = await import('../../config/environment.js');
    await sharedFirestore({ databaseId: getFirestoreDatabase() }).doc(STRICT_WARMUP_DOC).get();
    return true;
  },
};

type Outcome = 'ok' | 'unavailable' | 'failed' | 'timeout';

async function timed(warm: () => Promise<boolean>, budgetMs: number): Promise<Outcome> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<Outcome>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), budgetMs);
  });
  const done = warm().then(
    (ok): Outcome => (ok ? 'ok' : 'unavailable'),
    (): Outcome => 'failed'
  );
  try {
    return await Promise.race([done, late]);
  } finally {
    clearTimeout(timer);
  }
}

/** Warm both clients in parallel; resolves within `budgetMs`, never rejects. */
export async function warmFirestoreClients(
  log: LogFn,
  warmers: FirestoreWarmers = defaultWarmers,
  budgetMs = WARM_BUDGET_MS
): Promise<Record<keyof FirestoreWarmers, Outcome>> {
  const started = Date.now();
  const [shared, strict] = await Promise.all([
    timed(warmers.shared, budgetMs),
    timed(warmers.strict, budgetMs),
  ]);
  log('Firestore clients warmed', { shared, strict, durationMs: Date.now() - started });
  return { shared, strict };
}

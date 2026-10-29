/**
 * Open the call's Firestore clients in the job child before it says `ready`.
 *
 * A fresh process pays each client's channel, TLS and auth setup on its first read: locally
 * 456-644 ms for a first read against 104-186 ms after (2026-10-29), and on dev a
 * one-process-per-call greeting took ~0.4 s longer in the context build than a warm worker's
 * (voiceai-evidence two-jobs-proof SUMMARY). With nothing else to do before a call, the child
 * reads one never-written document on each client the call path uses most: the shared one
 * (getFirestoreDb, utils/firestore-utils.ts) and the persistence layer's own.
 *
 * Bounded and never throws: a slow or failed warm-up must not delay `ready` past WARM_BUDGET_MS.
 *
 * @module agents/gce/child-firestore-warm
 */
import type { LogFn } from './warmup.js';

export const WARM_BUDGET_MS = 3_000;

/** Never written: read once to open the shared client. */
const SHARED_WARMUP_DOC = '_warmup/shared';

export interface FirestoreWarmers {
  shared: () => Promise<boolean>;
  persistence: () => Promise<boolean>;
}

const defaultWarmers: FirestoreWarmers = {
  shared: async () => {
    const { getFirestoreDb } = await import('../../utils/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) return false;
    await db.doc(SHARED_WARMUP_DOC).get();
    return true;
  },
  // The persistence layer keeps its own client; a root-collection store reads through it.
  // `_warmup/persistence` is never written, so the store has nothing to flush.
  persistence: async () => {
    const { createPersistenceStore } = await import('../../services/persistence/index.js');
    await createPersistenceStore<never>({ collection: '_warmup', useRootCollection: true }).get(
      'persistence'
    );
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
  const [shared, persistence] = await Promise.all([
    timed(warmers.shared, budgetMs),
    timed(warmers.persistence, budgetMs),
  ]);
  log('Firestore clients warmed', { shared, persistence, durationMs: Date.now() - started });
  return { shared, persistence };
}

/**
 * The scheduled-job lock on the Firestore emulator: the real store, through
 * getAdminFirestore(), as runScheduledJob uses it in prod.
 *
 * Run: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 pnpm vitest run <this file>
 */

import { deleteApp, getApps } from 'firebase-admin/app';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { getAdminFirestore } from '../../../utils/firebase-admin-app.js';
import { JOB_LOCK_COLLECTION, firestoreJobLockStore } from '../job-lock-store.js';

// The shared setup fakes firebase-admin; here the store must reach the emulator.
vi.unmock('firebase-admin/app');
vi.unmock('firebase-admin/firestore');

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
process.env.GCLOUD_PROJECT ??= 'demo-job-locks';

const LEASE = 330_000;
const job = () => `job-${Math.random().toString(36).slice(2)}`;
const outcome = { status: 200, durationMs: 1234, finishedAt: 2_000 };

afterAll(async () => {
  await Promise.all(getApps().map((app) => deleteApp(app)));
});

describe.skipIf(!emulator)('firestoreJobLockStore on the emulator', () => {
  const store = firestoreJobLockStore();

  it('refuses a second run while the first holds the lock', async () => {
    const name = job();

    expect(await store.acquire(name, 'run-a', 1_000, LEASE)).toEqual({ acquired: true });
    expect(await store.acquire(name, 'run-b', 2_000, LEASE)).toEqual({
      acquired: false,
      holder: 'run-a',
      expiresAt: 1_000 + LEASE,
    });
  });

  it('frees the lock on release and keeps the outcome', async () => {
    const name = job();
    await store.acquire(name, 'run-a', 1_000, LEASE);

    await store.release(name, 'run-a', outcome);

    expect(await store.acquire(name, 'run-b', 3_000, LEASE)).toEqual({ acquired: true });
    const doc = (await getAdminFirestore().collection(JOB_LOCK_COLLECTION).doc(name).get()).data();
    expect(doc).toMatchObject({ runId: 'run-b', lastOutcome: { ...outcome, runId: 'run-a' } });
  });

  it('lets a new run take a lock whose lease has run out', async () => {
    const name = job();
    await store.acquire(name, 'run-a', 1_000, LEASE);

    expect(await store.acquire(name, 'run-b', 1_000 + LEASE + 1, LEASE)).toEqual({
      acquired: true,
    });
  });

  it('leaves a newer run’s lock alone when a run that lost its lease finishes', async () => {
    const name = job();
    await store.acquire(name, 'run-a', 1_000, LEASE);
    await store.acquire(name, 'run-b', 1_000 + LEASE + 1, LEASE);

    await store.release(name, 'run-a', outcome);

    expect(await store.acquire(name, 'run-c', 1_000 + LEASE + 2, LEASE)).toMatchObject({
      acquired: false,
      holder: 'run-b',
    });
  });

  it('gives exactly one of two simultaneous triggers the lock', async () => {
    const name = job();

    const results = await Promise.all([
      store.acquire(name, 'run-a', 1_000, LEASE),
      store.acquire(name, 'run-b', 1_000, LEASE),
    ]);

    expect(results.filter((r) => r.acquired)).toHaveLength(1);
  });
});

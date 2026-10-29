/**
 * The forget generation on the Firestore emulator: stored with the topics in
 * the forget's own transaction, so a restart still honours both, and forgets
 * raced with each other and with reads lose no increment and never let a read
 * see topics from one write with the generation of another.
 *
 * Needs FIRESTORE_EMULATOR_HOST; skips without it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// src/tests/setup.ts fakes getFirestoreDb; this test needs the real client (on the emulator).
vi.mock('../../../../utils/firestore-utils.js', async () => {
  const actual = await vi.importActual<typeof import('../../../../utils/firestore-utils.js')>(
    '../../../../utils/firestore-utils.js'
  );
  return { ...actual, getFirestoreDb: vi.fn(actual.getFirestoreDb) };
});

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
process.env.GCLOUD_PROJECT ??= 'demo-forgotten-store';

describe.skipIf(!emulator)('the forget generation on the emulator', () => {
  const uid = `u-${Math.random().toString(36).slice(2)}`;
  const path = `bogle_users/${uid}/memory_state/forgotten`;

  async function load() {
    const { getFirestoreDb } = await import('../../../../utils/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) throw new Error('no emulator Firestore');
    const forget = await import('../../../recall/forget.js');
    const adapter = await import('../forgotten-store.js');
    return { db, forget, adapter };
  }

  beforeEach(async () => {
    vi.resetModules();
    const { db } = await load();
    await db.recursiveDelete(db.doc(`bogle_users/${uid}`));
  });

  it('a forget is honoured after a restart: topics and generation', async () => {
    const before = await load();
    const res = await before.forget.forgetTopic(
      uid,
      'Larkspur Analytics',
      before.forget.firestoreForgetStore
    );
    expect(res.kind).toBe('forgotten');
    expect((await before.db.doc(path).get()).data()).toMatchObject({
      topics: ['Larkspur Analytics'],
      generation: 1,
    });

    vi.resetModules(); // a new process
    const after = await load();
    expect(after.forget.forgetGeneration(uid)).toBe(0);
    expect(await after.forget.forgottenTopicsOrNull(uid)).toEqual(['Larkspur Analytics']);
    expect(after.forget.forgetGeneration(uid)).toBe(1);
    await after.forget.forgetTopic(uid, 'the biopsy', after.forget.firestoreForgetStore);
    expect(await after.adapter.firestoreForgottenStore(after.db).readForgotten(uid)).toEqual({
      topics: ['Larkspur Analytics', 'biopsy'],
      generation: 2,
    });
  });

  it('forgets raced with each other and with reads: no lost increment, no split read', async () => {
    const { db, forget, adapter } = await load();
    const store = adapter.firestoreForgottenStore(db);
    const topics = ['Larkspur', 'biopsy', 'Willow Creek', 'Dmitri', 'Okafor', 'Felix'];
    const reads: Array<Promise<{ topics: string[] | null; generation: number }>> = [];
    const writes = topics.map((t) => {
      reads.push(store.readForgotten(uid));
      return forget.forgetTopic(uid, t, forget.firestoreForgetStore);
    });
    await Promise.all(writes);
    for (const r of await Promise.all(reads)) {
      // Each forget adds one topic and one generation in one transaction.
      expect(r.topics).toHaveLength(r.generation);
    }
    const final = await store.readForgotten(uid);
    expect(final.generation).toBe(topics.length);
    expect([...(final.topics ?? [])].sort()).toEqual([...topics].sort());
    expect(forget.forgetGeneration(uid)).toBe(topics.length);
  });
});

/**
 * The semantic index (vectors, memory_vectors) leaves with the person and goes with the
 * account, on the Firestore emulator. Found by the #2971 verify: an inside joke's vector copy
 * survived delete-my-data and was missing from the export. The documents are written by the
 * real FirestoreVectorStore (inside jokes, facts) and in the unified store's shape; then the
 * real export and the real erasure run. The other person's documents, and ownerless persona
 * knowledge, stay. An erasure that fails at the index is reported, and a retry finishes it.
 * Synthetic uids and words only.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { FirestoreVectorStore } from '../../memory/firestore-vector-store/core.js';
import { eraseUserRecord } from '../../services/platform/erase-user-record.js';
import { exportUserRecords } from '../../services/platform/user-records-export.js';

// The shared setup fakes Firestore for every test; here the reads and writes reach the emulator
vi.mock('firebase-admin/app', async () => vi.importActual('firebase-admin/app'));
vi.mock('firebase-admin/firestore', async () => vi.importActual('firebase-admin/firestore'));
// A query's embedding: the same vector every document here is stored with
vi.mock('../../memory/embeddings.js', () => ({
  embed: async () => Array.from({ length: 768 }, (_, i) => (i % 7) / 7),
  embedBatch: async (texts: string[]) =>
    texts.map(() => Array.from({ length: 768 }, (_, i) => (i % 7) / 7)),
}));
vi.mock('../../services/identity/firebase-auth.js', () => ({
  ensureFirebaseAdmin: () => true,
  deleteFirebaseUser: vi.fn(async () => true),
  getFirebaseUserOrThrow: vi.fn(async () => ({ providerData: [], emailVerified: false })),
}));

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
process.env.GCLOUD_PROJECT ??= 'demo-vectors-erase';

let db: Firestore;
let index: FirestoreVectorStore;
beforeAll(async () => {
  if (!emulator) return;
  const { getAdminFirestore } = await import('../../utils/firebase-admin-app.js');
  db = getAdminFirestore();
  // The store connects only with credentials present; the emulator needs none
  vi.stubEnv('GOOGLE_APPLICATION_CREDENTIALS', '/dev/null');
  index = new FirestoreVectorStore({ projectId: process.env.GCLOUD_PROJECT });
  await index.initialize();
  vi.unstubAllEnvs();
});

const embedding = Array.from({ length: 768 }, (_, i) => (i % 7) / 7);
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/** Each person's inside joke and remembered fact (real writer), and a unified-store memory */
async function seed(uid: string): Promise<void> {
  await index.addDocument({
    id: `trust_inside_joke_${uid}-j1`,
    text: `Inside joke: the quokka of ${uid}`,
    embedding,
    metadata: {
      source: 'store_auto_sync',
      userId: uid,
      storeType: 'trust',
      entityType: 'inside_joke',
    },
    expireAt: new Date(Date.now() + YEAR_MS),
  });
  await index.addDocument({
    id: `fact_${uid}_1`,
    text: `${uid} keeps bees on the roof`,
    embedding,
    metadata: { source: 'user_memory', userId: uid, category: 'fact' },
  });
  await db.doc(`memory_vectors/${uid}:m1`).set({
    text: `${uid} ran a half marathon`,
    embedding,
    metadata: { userId: uid, memoryId: 'm1', type: 'milestone' },
    createdAt: new Date(),
  });
  await db.doc(`bogle_users/${uid}`).set({ name: 'Caller' });
}

const left = async (collection: string, uid: string): Promise<number> =>
  (await db.collection(collection).where('metadata.userId', '==', uid).count().get()).data().count;
const leftFor = async (uid: string) => ({
  vectors: await left('vectors', uid),
  memory_vectors: await left('memory_vectors', uid),
});

describe.skipIf(!emulator)('semantic index: export and account deletion', () => {
  it("exports the person's index words without embeddings, and erases them all", async () => {
    const n = String(Date.now()).slice(-7);
    const a = `vec-a-${n}`;
    const b = `vec-b-${n}`;
    await seed(a);
    await seed(b);
    const persona = `ferni_persona_${n}_chunk_0`; // ownerless: shared persona knowledge
    await db
      .doc(`vectors/${persona}`)
      .set({ text: 'Ferni likes jazz', metadata: { source: 'persona' } });

    const out = await exportUserRecords(a, undefined, db);
    const rows = (out.vectors ?? []) as Array<Record<string, unknown>>;
    expect(rows.map((r) => r.text).sort()).toEqual(
      [`${a} keeps bees on the roof`, `Inside joke: the quokka of ${a}`].sort()
    );
    const joke = rows.find((r) => String(r.id).startsWith('trust_inside_joke_'));
    expect((joke?.metadata as Record<string, unknown>).entityType).toBe('inside_joke');
    expect(joke).toHaveProperty('createdAt');
    expect(joke).toHaveProperty('expireAt');
    for (const row of rows) expect(row).not.toHaveProperty('embedding');
    const unified = (out.memory_vectors ?? []) as Array<Record<string, unknown>>;
    expect(unified.map((r) => r.text)).toEqual([`${a} ran a half marathon`]);
    expect(unified[0]).not.toHaveProperty('embedding');
    expect(JSON.stringify(out)).not.toContain(b);

    expect(await leftFor(a)).toEqual({ vectors: 2, memory_vectors: 1 });
    await eraseUserRecord(a, db);

    expect(await leftFor(a)).toEqual({ vectors: 0, memory_vectors: 0 });
    expect(await leftFor(b)).toEqual({ vectors: 2, memory_vectors: 1 });
    expect((await db.doc(`vectors/${persona}`).get()).exists).toBe(true);
  }, 60_000);

  it('reports an erasure that fails at the index, keeps the record, and a retry finishes it', async () => {
    const n = String(Date.now()).slice(-7);
    const a = `vec-fail-${n}`;
    await seed(a);
    // The index's deletes fail, as an unavailable Firestore would; everything else is real
    const failing = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop !== 'recursiveDelete') {
          const value: unknown = Reflect.get(target, prop, receiver);
          return typeof value === 'function' ? (value as () => unknown).bind(target) : value;
        }
        return async (ref: { path: string }) => {
          if (ref.path.startsWith('vectors/')) throw new Error('14 UNAVAILABLE: fake outage');
          return target.recursiveDelete(ref as never);
        };
      },
    });

    await expect(eraseUserRecord(a, failing)).rejects.toThrow(/vectors\[metadata\.userId\]/);
    expect((await leftFor(a)).vectors).toBe(2);
    // The record is erased last, so a retry finds the same keys
    expect((await db.doc(`bogle_users/${a}`).get()).exists).toBe(true);

    await eraseUserRecord(a, db);
    expect(await leftFor(a)).toEqual({ vectors: 0, memory_vectors: 0 });
    expect((await db.doc(`bogle_users/${a}`).get()).exists).toBe(false);
  }, 60_000);
});

describe.skipIf(!emulator)('semantic index: recall drops expired documents', () => {
  it('search and searchByEmbedding return a live inside joke and a fact, never an expired joke', async () => {
    const uid = `vec-recall-${String(Date.now()).slice(-7)}`;
    const add = async (id: string, expireAt?: Date) =>
      index.addDocument({
        id,
        text: `${id} words`,
        embedding,
        metadata: { source: 'store_auto_sync', userId: uid, entityType: 'inside_joke' },
        expireAt,
      });
    await add(`trust_inside_joke_${uid}-live`, new Date(Date.now() + YEAR_MS));
    await add(`trust_inside_joke_${uid}-expired`, new Date(Date.now() - 60_000));
    await add(`fact_${uid}_1`); // no expiry: kept
    const live = [`fact_${uid}_1`, `trust_inside_joke_${uid}-live`];
    // The expired one is still stored (TTL deletes late): only the readers drop it
    expect(await left('vectors', uid)).toBe(3);

    const options = { topK: 5, filter: { userId: uid } };
    const byEmbedding = await index.searchByEmbedding(embedding, options);
    expect(byEmbedding.map((r) => r.document.id).sort()).toEqual(live);
    index.invalidateSearchCacheForUser(uid); // else the text search is served from that result
    const byText = await index.search(`what was funny with ${uid}`, options);
    expect(byText.map((r) => r.document.id).sort()).toEqual(live);
  }, 60_000);
});

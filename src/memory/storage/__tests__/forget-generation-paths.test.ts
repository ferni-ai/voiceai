/**
 * Every Firestore write that hides memory raises the stored forget generation
 * (bogle_users/{uid}/memory_state/forgotten.generation), not only a forget by topic.
 * What was built from that memory (the call sheet, the forget caches) compares
 * against it, so a fact forgotten by id, a correction, a dispute or a closed world
 * fact that left it unchanged would leave them serving what the caller took back.
 *
 * Each path runs its real Firestore adapter over an in-memory Firestore: the
 * generation is read before (0) and after (higher), stored and as this process
 * has seen it. Fictional caller only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Data = Record<string, unknown>;
const fs = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>(), failTx: false }));

vi.mock('../../retrieval/conversation-index.js', () => ({
  removeConversationDocument: async () => undefined,
}));
vi.mock('../../retrieval/semantic-memory-search.js', () => ({
  removeIndexedMemory: async () => undefined,
}));
vi.mock('../../../utils/firestore-utils.js', () => {
  /** Applies a patch; an arrayUnion sentinel (not under test here) is stored as given. */
  const write = (path: string, patch: Data, merge = true) =>
    fs.docs.set(path, merge ? { ...(fs.docs.get(path) ?? {}), ...patch } : { ...patch });
  const snap = (path: string) => ({
    id: path.split('/').pop() as string,
    exists: fs.docs.has(path),
    data: () => fs.docs.get(path) && { ...fs.docs.get(path) },
  });
  const docRef = (path: string): Data => ({
    id: path.split('/').pop(),
    path,
    collection: (name: string) => collectionRef(`${path}/${name}`),
    get: async () => snap(path),
    set: async (data: Data, opts?: { merge?: boolean }) => write(path, data, !!opts?.merge),
    update: async (patch: Data) => {
      if (!fs.docs.has(path)) throw new Error(`NOT_FOUND ${path}`);
      write(path, patch);
    },
  });
  const query = (path: string, filters: Array<[string, unknown]> = [], max = Infinity): Data => ({
    where: (f: string, _op: string, v: unknown) => query(path, [...filters, [f, v]], max),
    orderBy: () => query(path, filters, max),
    limit: (n: number) => query(path, filters, n),
    get: async () => {
      const depth = path.split('/').length + 1;
      const docs = [...fs.docs.entries()]
        .filter(([p]) => p.startsWith(`${path}/`) && p.split('/').length === depth)
        .filter(([, d]) => filters.every(([f, v]) => d[f] === v))
        .slice(0, max)
        .map(([p]) => ({ ...snap(p), ref: docRef(p) }));
      return { docs, empty: docs.length === 0, size: docs.length };
    },
  });
  const collectionRef = (path: string): Data => ({
    ...query(path),
    doc: (id: string) => docRef(`${path}/${id}`),
  });
  const db = {
    collection: (name: string) => collectionRef(name),
    batch: () => {
      const ops: Array<() => void> = [];
      return {
        update: (r: { path: string }, patch: Data) => ops.push(() => write(r.path, patch)),
        create: (r: { path: string }, data: Data) => ops.push(() => write(r.path, data, false)),
        commit: async () => ops.forEach((op) => op()),
      };
    },
    runTransaction: async <T>(fn: (tx: Data) => Promise<T>): Promise<T> => {
      if (fs.failTx) throw new Error('transaction aborted');
      return fn({
        get: async (r: { path: string }) => snap(r.path),
        set: (r: { path: string }, data: Data, opts?: { merge?: boolean }) =>
          write(r.path, data, !!opts?.merge),
      });
    },
  };
  return { getFirestoreDb: () => db };
});

import {
  bumpForgetGeneration,
  forgetGenerationSeen,
} from '../../adapters/firestore/forgotten-store.js';
import { forgetRemembered, correctRemembered } from '../../recall/memory-control.js';
import { firestoreForgetStore } from '../../recall/forget.js';
import { firestoreMemoryControlStore } from '../memory-control-store.js';
import { firestoreDisputeStore } from '../dispute-store.js';
import { firestoreActionStore } from '../../../api/routes/known-action-store.js';
import { getFirestoreDb } from '../../../utils/firestore-utils.js';

const AT = '2026-11-10T19:00:00.000Z';
let n = 0;
let user = '';
const root = () => `bogle_users/${user}`;
const stored = (): unknown => fs.docs.get(`${root()}/memory_state/forgotten`)?.generation;

/** One fact about the caller's dog, Biscuit, as the extractor stores it. */
const BISCUIT = { entityName: 'Biscuit', key: 'species', value: 'dog', extractedAt: AT };

beforeEach(() => {
  fs.docs.clear();
  fs.failTx = false;
  user = `member-gen-${++n}`; // the seen generation is per process, so one caller per row
  fs.docs.set(`${root()}/dynamic_facts/f1`, { ...BISCUIT });
  fs.docs.set(`${root()}/world_facts/wf1`, { subject: 'Biscuit', validTo: null });
  fs.docs.set(`${root()}/summaries/s1`, { summary: 'Biscuit went to the vet' });
});

/** The row: before the write nothing is stored; after it the generation went up, here and stored. */
async function expectRaised(write: () => Promise<unknown>): Promise<void> {
  expect(stored()).toBeUndefined();
  const seen = forgetGenerationSeen(user);
  await write();
  expect(stored()).toBe(1);
  expect(forgetGenerationSeen(user)).toBeGreaterThan(seen);
}

describe('every write that hides memory raises the forget generation', () => {
  it('a forget by topic (the path that already did)', async () => {
    await expectRaised(() => firestoreForgetStore.addTopic(user, 'biscuit', 'Biscuit'));
  });

  it('a fact forgotten by id (the app, the learned-facts page, a known action)', async () => {
    await expectRaised(async () => {
      expect(await forgetRemembered(user, 'f1', firestoreMemoryControlStore)).toBe(true);
    });
    expect(typeof fs.docs.get(`${root()}/dynamic_facts/f1`)?.forgottenAt).toBe('string');
  });

  it('a correction (the wrong copies are hidden)', async () => {
    await expectRaised(async () => {
      const r = await correctRemembered(user, 'f1', 'cat', firestoreMemoryControlStore);
      expect(r.kind).toBe('corrected');
    });
  });

  it('a dispute that marks facts', async () => {
    const ref = { collection: 'dynamic_facts', id: 'f1', data: { ...BISCUIT } };
    await expectRaised(() => firestoreDisputeStore.markFacts(user, [ref], AT));
  });

  it('a dispute that closes world facts', async () => {
    await expectRaised(async () => firestoreDisputeStore.markWorldFacts?.(user, ['wf1'], AT, true));
    expect(fs.docs.get(`${root()}/world_facts/wf1`)?.wrong).toBe(true);
  });

  it('a dispute that drops summary items', async () => {
    await expectRaised(() =>
      firestoreDisputeStore.markSummaryItems(user, 's1', ['Biscuit went to the vet'], AT)
    );
  });

  it('a world fact forgotten by id (a known action)', async () => {
    await expectRaised(() => firestoreActionStore.world.forget(user, 'wf1', AT, false));
    expect(fs.docs.get(`${root()}/world_facts/wf1`)?.forgottenAt).toBe(AT);
  });

  it('nothing hidden, nothing raised', async () => {
    await firestoreForgetStore.markForgotten(user, [], AT);
    await firestoreDisputeStore.markWorldFacts?.(user, [], AT);
    expect(stored()).toBeUndefined();
  });

  it('each write raises it again: the generation counts writes, not callers', async () => {
    await firestoreDisputeStore.markWorldFacts?.(user, ['wf1'], AT);
    await firestoreActionStore.world.forget(user, 'wf1', AT, false);
    expect(stored()).toBe(2);
  });
});

describe('bumpForgetGeneration is best effort', () => {
  it('a failed write is not thrown, and this process still counts the forget', async () => {
    fs.failTx = true;
    const seen = forgetGenerationSeen(user);
    await expect(bumpForgetGeneration(getFirestoreDb() as never, user)).resolves.toBeNull();
    expect(stored()).toBeUndefined();
    expect(forgetGenerationSeen(user)).toBe(seen + 1);
  });

  it('with no database it counts the forget here', async () => {
    const seen = forgetGenerationSeen(user);
    await expect(bumpForgetGeneration(null, user)).resolves.toBeNull();
    expect(forgetGenerationSeen(user)).toBe(seen + 1);
  });
});

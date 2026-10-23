/**
 * REMEMBER_TO_RECALL (#2474): the caller_asserted dynamic_facts document a
 * remembered fact becomes. One per fact, embedded on write, forgotten the way
 * every fact is, ranked at least as high as an extracted fact, erased with the
 * account.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

// Documents by path, for the production store and account erasure.
const fs = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const under = (path: string) => [...docs.keys()].filter((p) => p.startsWith(`${path}/`));
  const ref = (path: string): Record<string, unknown> => ({
    path,
    get: async () => ({ exists: docs.has(path) }),
    listCollections: async () =>
      [...new Set(under(path).map((p) => p.slice(path.length + 1).split('/')[0]))].map((id) => ({ id })), // prettier-ignore
    collection: (name: string) => ({ doc: (id: string) => ref(`${path}/${name}/${id}`) }),
    create: async (data: Record<string, unknown>) => {
      if (docs.has(path)) throw Object.assign(new Error('already exists'), { code: 6 });
      docs.set(path, data);
    },
    set: async (data: Record<string, unknown>) => void docs.set(path, data),
  });
  const empty = { limit: () => ({ get: async () => ({ empty: true, docs: [] }) }) };
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => ref(`${name}/${id}`),
      where: () => empty,
    }),
    recursiveDelete: async (r: { path: string }) => {
      for (const p of [r.path, ...under(r.path)]) docs.delete(p);
    },
  };
  return { docs, db };
});
vi.mock('../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/firestore-utils.js')>()),
  getFirestoreDb: () => fs.db,
}));
vi.mock('../../../services/identity/firebase-auth.js', () => ({
  ensureFirebaseAdmin: () => false,
}));

import {
  CALLER_ASSERTED,
  rememberedFactDoc,
  rememberToRecall,
  type FactDocWrite,
  type RememberedFactStore,
} from '../remembered-facts.js';
import { firestoreRememberedFactStore as firestore } from '../../storage/remembered-fact-store.js';
import { forgetTopic, type ForgetStore } from '../../recall/forget.js';
import { loadRecallSnapshot, recallForTurn } from '../../recall/session-recall.js';
import { FACT_VECTOR_DIMENSION } from '../../recall/stored-fact-vectors.js';
import { eraseUserRecord, findUserRecordRemnants } from '../../../services/platform/erase-user-record.js'; // prettier-ignore
import { ERASED_STORES } from '../../../services/platform/user-stores.js';

const ON = { REMEMBER_TO_RECALL: 'on' };
const DANA = 'my sister Dana is moving to Denver in June';

/** dynamic_facts in memory, create only, as Firestore's create() behaves. */
function memoryStore() {
  const facts = new Map<string, Record<string, unknown>>();
  const create = vi.fn(async (_userId: string, docs: FactDocWrite[]) => {
    let made = 0;
    for (const d of docs) if (!facts.has(d.id) && facts.set(d.id, d.data)) made++;
    return made;
  });
  const store: RememberedFactStore = { create };
  return { facts, store, create };
}

afterEach(() => {
  vi.unstubAllEnvs();
  fs.docs.clear();
});

describe('rememberToRecall', () => {
  it('off (the default): writes nothing', async () => {
    const { store, create } = memoryStore();
    expect(await rememberToRecall('u1', { fact: DANA, memoryId: 'mem_1' }, { store, env: {} })).toBe(false); // prettier-ignore
    expect(create).not.toHaveBeenCalled();
  });

  it('on: one caller_asserted fact as recall reads it, confidence 1', async () => {
    const { facts, store } = memoryStore();
    const r = { fact: DANA, memoryId: 'mem_1', category: 'personal', sessionId: 's1' };
    expect(await rememberToRecall('u1', r, { store, env: ON })).toBe(true);
    expect([...facts.values()]).toEqual([
      expect.objectContaining({
        source: CALLER_ASSERTED,
        entityName: 'user',
        key: 'asked_to_remember',
        value: DANA,
        confidence: 1,
        memoryId: 'mem_1',
        sessionId: 's1',
        syncedToSpanner: false,
        extractedAt: expect.any(String),
      }),
    ]);
  });

  it('is idempotent: the same thing remembered twice is one fact', async () => {
    const { facts, store } = memoryStore();
    await rememberToRecall('u1', { fact: DANA, memoryId: 'mem_1' }, { store, env: ON });
    await rememberToRecall('u1', { fact: ` ${DANA} `, memoryId: 'mem_2' }, { store, env: ON });
    expect(facts.size).toBe(1);
    expect(rememberedFactDoc({ fact: DANA, memoryId: 'a' }, 't1')?.id).toBe(
      rememberedFactDoc({ fact: DANA, memoryId: 'b' }, 't2')?.id
    );
  });

  it('embeds the fact on write with RECALL_VECTOR_INDEX', async () => {
    const { facts, store } = memoryStore();
    const embed = vi.fn(async (texts: string[]) => texts.map(() => new Array<number>(FACT_VECTOR_DIMENSION).fill(0.1))); // prettier-ignore
    const embedding = { enabled: true, embed, model: async () => 'test-model' };
    await rememberToRecall('u1', { fact: DANA, memoryId: 'mem_1' }, { store, env: ON, embedding });
    expect(embed).toHaveBeenCalledWith([`they asked to remember: ${DANA}`], 'document');
    expect([...facts.values()][0]).toMatchObject({ embeddingModel: 'test-model', embeddingTask: 'RETRIEVAL_DOCUMENT' }); // prettier-ignore
  });

  it('keeps no spoken credential (SPOKEN_CREDENTIAL_FILTER)', async () => {
    vi.stubEnv('SPOKEN_CREDENTIAL_FILTER', 'on');
    const { facts, store } = memoryStore();
    await rememberToRecall('u1', { fact: 'the door code is 4821', memoryId: 'm' }, { store, env: ON }); // prettier-ignore
    expect(facts.size).toBe(0);
  });

  it('a store failure is logged, never thrown', async () => {
    const store: RememberedFactStore = { create: async () => Promise.reject(new Error('down')) };
    expect(await rememberToRecall('u1', { fact: DANA, memoryId: 'm' }, { store, env: ON })).toBe(false); // prettier-ignore
  });
});

describe('forgetting a remembered fact', () => {
  it('forgetTopic marks it, recall leaves it out, and remembering again never revives it', async () => {
    const FACTS = 'bogle_users/u1/dynamic_facts/';
    const facts = () => [...fs.docs].filter(([p]) => p.startsWith(FACTS));
    // The production store writes; forget reads and marks the same documents.
    await rememberToRecall('u1', { fact: DANA, memoryId: 'mem_1' }, { store: firestore, env: ON });
    const forget: ForgetStore = {
      facts: async () => facts().map(([p, data]) => ({ collection: 'dynamic_facts', id: p.slice(FACTS.length), data })), // prettier-ignore
      markForgotten: async (_u, refs, at) => {
        for (const r of refs) fs.docs.set(FACTS + r.id, { ...fs.docs.get(FACTS + r.id), forgottenAt: at }); // prettier-ignore
      },
      addTopic: async () => {},
      topics: async () => [],
    };
    expect(await forgetTopic('u1', 'my sister Dana', forget)).toEqual({ kind: 'forgotten', marked: 1 }); // prettier-ignore

    await rememberToRecall('u1', { fact: DANA, memoryId: 'mem_2' }, { store: firestore, env: ON });
    expect(facts().map(([, d]) => d)).toEqual([expect.objectContaining({ forgottenAt: expect.any(String) })]); // prettier-ignore
    const snapshot = await loadRecallSnapshot(
      { facts: async () => facts().map(([, d]) => d), summaries: async () => [] },
      'u1'
    );
    expect(snapshot.facts).toEqual([]);
  });
});

describe('recall ranking', () => {
  it('ranks a caller_asserted fact above an extracted one that matches the turn as well', async () => {
    const remembered = rememberedFactDoc({ fact: 'Dana is moving to Denver', memoryId: 'm' }, '2026-01-01T00:00:00.000Z'); // prettier-ignore
    const extracted = { entityName: 'user', key: 'note', value: 'Dana starts a new job', confidence: 0.95, source: 'deep_extraction' }; // prettier-ignore
    const snapshot = await loadRecallSnapshot(
      { facts: async () => [extracted, remembered?.data ?? {}], summaries: async () => [] },
      'u1'
    );
    expect(recallForTurn(snapshot, 'how is Dana doing').map((f) => f.value)).toEqual([
      'Dana is moving to Denver',
      'Dana starts a new job',
    ]);
  });
});

describe('account erasure', () => {
  it('leaves no remembered fact behind', async () => {
    await rememberToRecall(
      'u-erase',
      { fact: DANA, memoryId: 'mem_1' },
      { store: firestore, env: ON }
    );
    expect([...fs.docs.keys()]).toEqual([expect.stringMatching(/^bogle_users\/u-erase\/dynamic_facts\/f_/)]); // prettier-ignore
    await eraseUserRecord('u-erase', fs.db as never, ERASED_STORES, []);
    expect([...fs.docs.keys()]).toEqual([]);
    expect(await findUserRecordRemnants(fs.db as never, 'u-erase', ERASED_STORES)).toEqual([]);
  });
});

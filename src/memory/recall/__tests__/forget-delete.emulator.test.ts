/**
 * "Forget that" with FORGET_DELETES on, against the Firestore emulator: the
 * caller's facts about the topic are deleted from both fact collections, with
 * their index copies, and nothing else of theirs is touched. A dynamic fact
 * the graph sync copied is marked instead, so the sync removes its copy.
 * Off, the same request leaves every fact stored and marked.
 *
 * Needs FIRESTORE_EMULATOR_HOST; skips without it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// src/tests/setup.ts fakes getFirestoreDb; this test needs the real client (on the emulator).
vi.mock('../../../utils/firestore-utils.js', async () => {
  const actual = await vi.importActual<typeof import('../../../utils/firestore-utils.js')>(
    '../../../utils/firestore-utils.js'
  );
  return { ...actual, getFirestoreDb: vi.fn(actual.getFirestoreDb) };
});
// The index copies live in other stores: record what is asked to be removed.
const removed = vi.hoisted(() => [] as string[]);
vi.mock('../../retrieval/conversation-index.js', () => ({
  removeConversationDocument: vi.fn(async (id: string) => {
    removed.push(`conversation_${id}`);
  }),
}));
vi.mock('../../retrieval/semantic-memory-search.js', () => ({
  removeIndexedMemory: vi.fn(async (source: string, id: string) => {
    removed.push(`${source}_${id}`);
  }),
}));

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
process.env.GCLOUD_PROJECT ??= 'demo-forget-delete';

describe.skipIf(!emulator)('forget that on the emulator', () => {
  const uid = `u-${Math.random().toString(36).slice(2)}`;
  const user = `bogle_users/${uid}`;

  async function db() {
    const { getFirestoreDb } = await import('../../../utils/firestore-utils.js');
    const d = getFirestoreDb();
    if (!d) throw new Error('no emulator Firestore');
    return d;
  }
  const read = async (path: string) => (await (await db()).doc(path).get()).data();

  beforeEach(async () => {
    const d = await db();
    await d.recursiveDelete(d.doc(user));
    await d.doc(user).set({ name: 'A' });
    await d.doc(`${user}/dynamic_facts/d1`).set({
      entityName: 'User',
      key: 'divorce',
      value: 'Finalised the divorce papers in March',
      embedding: [0.1, 0.2],
      syncedToSpanner: false,
    });
    await d.doc(`${user}/extracted_facts/e1`).set({ fact: 'Going through a divorce, feels raw' });
    await d.doc(`${user}/dynamic_facts/d3`).set({
      entityName: 'Biscuit',
      key: 'breed',
      value: 'golden retriever',
      syncedToSpanner: false,
    });
    removed.length = 0;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('on: deletes the facts about the topic and their index copies, nothing else', async () => {
    vi.stubEnv('FORGET_DELETES', 'on');
    expect(await read(`${user}/dynamic_facts/d1`)).toBeDefined();
    expect(await read(`${user}/extracted_facts/e1`)).toBeDefined();
    const { forgetForCaller, forgetDone } = await import('../forget.js');

    const result = await forgetForCaller(uid, 'my divorce');

    expect(result).toEqual({ kind: 'forgotten', marked: 2, deleted: 2, hidden: 0 });
    expect(await read(`${user}/dynamic_facts/d1`)).toBeUndefined();
    expect(await read(`${user}/extracted_facts/e1`)).toBeUndefined();
    expect(await read(`${user}/dynamic_facts/d3`)).toMatchObject({ value: 'golden retriever' });
    expect(removed.sort()).toEqual(['conversation_fact_d1', `fact_fact_${uid}_d1`]);
    expect((await read(`${user}/memory_state/forgotten`))?.topics).toEqual(['divorce']);
    if (result.kind !== 'forgotten') throw new Error('not forgotten');
    expect(forgetDone(result)).toMatch(/^I've deleted the facts/);
  });

  it('on: a fact the graph sync copied is marked, not deleted, and he says only he will not bring it up', async () => {
    vi.stubEnv('FORGET_DELETES', 'on');
    await (await db()).doc(`${user}/dynamic_facts/d2`).set({
      entityName: 'User',
      key: 'divorce lawyer',
      value: 'Sam handles the divorce',
      syncedToSpanner: true,
    });
    const { forgetForCaller, forgetDone } = await import('../forget.js');

    const result = await forgetForCaller(uid, 'my divorce');

    expect(result).toEqual({ kind: 'forgotten', marked: 3, deleted: 2, hidden: 1 });
    const d2 = await read(`${user}/dynamic_facts/d2`);
    expect(typeof d2?.forgottenAt).toBe('string');
    expect(d2?.syncedToSpanner).toBe(false); // the graph sync removes its copy
    expect(await read(`${user}/dynamic_facts/d1`)).toBeUndefined();
    if (result.kind !== 'forgotten') throw new Error('not forgotten');
    expect(forgetDone(result)).toBe("I won't bring that up again.");
  });

  it('off (default): every fact is still stored, marked forgotten', async () => {
    const { forgetForCaller } = await import('../forget.js');
    expect(await forgetForCaller(uid, 'my divorce')).toEqual({ kind: 'forgotten', marked: 2 });
    for (const id of ['dynamic_facts/d1', 'extracted_facts/e1']) {
      expect(typeof (await read(`${user}/${id}`))?.forgottenAt).toBe('string');
    }
  });
});

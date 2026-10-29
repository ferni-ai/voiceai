/**
 * memory_state/forgotten through the ForgottenStore adapter, on an in-memory
 * Firestore that counts reads of that document:
 * - a call start reads it once, however many readers ask (main: 3 reads);
 * - a forget during the call is seen by the next read;
 * - the forget generation is stored with the topics, so a restart (fresh
 *   modules) still knows it and still honours the topics;
 * - a forget raced with a read never splits topics from their generation.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pathFirestore } from '../../../../services/outreach/proactive-channels/__tests__/path-firestore.js';

/** Every get of a forgotten doc is counted (transactions included, which reset before measuring). */
class CountingDocs extends Map<string, Record<string, unknown>> {
  reads = 0;
  override get(path: string) {
    if (path.endsWith('/memory_state/forgotten')) this.reads++;
    return super.get(path);
  }
}
const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('../../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../utils/firestore-utils.js')>()),
  getFirestoreDb: () => state.db,
}));

const UID = 'u-fictional-ada';
const DOC = `bogle_users/${UID}/memory_state/forgotten`;
let docs: CountingDocs;

beforeEach(async () => {
  docs = new CountingDocs();
  state.db = pathFirestore(docs);
  vi.resetModules(); // each test starts as a fresh process
});

async function load() {
  const reads = await import('../../../../utils/call-start-reads.js');
  const forget = await import('../../../recall/forget.js');
  const every = await import('../../../recall/forget-every-reader.js');
  const adapter = await import('../forgotten-store.js');
  return { reads, forget, every, adapter };
}

/** The call-start readers with FORGET_EVERY_READER off (prod): the recall snapshot, episodes, call summaries. */
async function callStart(m: Awaited<ReturnType<typeof load>>) {
  return Promise.all([
    m.every.snapshotTopics(UID, {}), // agents/multi-agent/recall-firestore-store.ts
    m.forget.forgottenTopicsOrNull(UID), // recall/episodes.ts
    m.forget.forgottenTopicsOrNull(UID), // recall/call-summaries.ts
  ]);
}

describe('forgotten topics at call start', () => {
  it('are read once per call start, not once per reader', async () => {
    docs.set(DOC, { topics: ['Larkspur'], generation: 2 });
    const m = await load();
    docs.reads = 0;
    await callStart(m); // no call-start window: each reader reads, as every reader did on main
    expect(docs.reads).toBe(3);

    m.reads.openCallStartReadWindow();
    docs.reads = 0;
    const got = await callStart(m);
    expect(docs.reads).toBe(1);
    expect(got).toEqual([['Larkspur'], ['Larkspur'], ['Larkspur']]);
    expect(got[1]).not.toBe(got[2]); // each reader its own list
  });

  it('a forget during the call is in the next read, and moves the generation', async () => {
    docs.set(DOC, { topics: ['Larkspur'], generation: 2 });
    const m = await load();
    m.reads.openCallStartReadWindow();
    await callStart(m);
    expect(m.forget.forgetGeneration(UID)).toBe(2);
    await m.forget.forgetTopic(UID, 'the biopsy', m.forget.firestoreForgetStore);
    const after = await m.adapter.firestoreForgottenStore(state.db as never).readForgotten(UID);
    expect(after).toEqual({ topics: ['Larkspur', 'biopsy'], generation: 3 });
    expect(m.forget.forgetGeneration(UID)).toBe(3);
  });
});

describe('the forget generation is stored', () => {
  it('survives a restart, with the topics', async () => {
    const before = await load();
    expect(before.forget.forgetGeneration(UID)).toBe(0);
    const res = await before.forget.forgetTopic(
      UID,
      'Larkspur Analytics',
      before.forget.firestoreForgetStore
    );
    expect(res.kind).toBe('forgotten');
    expect(docs.get(DOC)).toMatchObject({ topics: ['Larkspur Analytics'], generation: 1 });
    expect(before.forget.forgetGeneration(UID)).toBe(1);

    vi.resetModules(); // a restart: nothing in process survives
    const after = await load();
    expect(after.forget.forgetGeneration(UID)).toBe(0); // not seen yet
    const read = await after.adapter.firestoreForgottenStore(state.db as never).readForgotten(UID);
    expect(read).toEqual({ topics: ['Larkspur Analytics'], generation: 1 });
    expect(after.forget.forgetGeneration(UID)).toBe(1);
    // And the topic is still honoured by recall.
    const { loadRecallSnapshot } = await import('../../../recall/session-recall.js');
    const snap = await loadRecallSnapshot(
      {
        facts: async () => [
          {
            entityName: 'User',
            key: 'job',
            value: 'Analyst at Larkspur Analytics',
            confidence: 0.9,
          },
          { entityName: 'Biscuit', key: 'breed', value: 'golden retriever', confidence: 0.9 },
        ],
        summaries: async () => [],
        forgotten: (uid) => after.forget.forgottenTopicsOrNull(uid),
      },
      UID
    );
    expect(snap.facts.map((f) => f.entity)).toEqual(['Biscuit']);
  });

  it('goes up by one per forget, a repeated topic included', async () => {
    const m = await load();
    await m.forget.forgetTopic(UID, 'Larkspur', m.forget.firestoreForgetStore);
    await m.forget.forgetTopic(UID, 'Larkspur', m.forget.firestoreForgetStore);
    expect(docs.get(DOC)).toMatchObject({ topics: ['Larkspur'], generation: 2 });
  });

  it('reads an old document without one as 0, and an unreadable one as null topics', async () => {
    const m = await load();
    docs.set(DOC, { topics: ['Larkspur'] });
    expect(await m.adapter.firestoreForgottenStore(state.db as never).readForgotten(UID)).toEqual({
      topics: ['Larkspur'],
      generation: 0,
    });
    docs.set(DOC, { topics: 'Larkspur', generation: 'x' });
    expect(await m.adapter.firestoreForgottenStore(state.db as never).readForgotten(UID)).toEqual({
      topics: null,
      generation: 0,
    });
    state.db = null;
    expect(await m.adapter.firestoreForgottenStore(state.db as never).readForgotten(UID)).toEqual({
      topics: null,
      generation: 0,
    });
  });

  it('a forget raced with reads: each read sees topics and generation from one write', async () => {
    const m = await load();
    const store = m.adapter.firestoreForgottenStore(state.db as never);
    const results = await Promise.all([
      store.readForgotten(UID),
      m.forget.forgetTopic(UID, 'Larkspur', m.forget.firestoreForgetStore),
      store.readForgotten(UID),
      m.forget.forgetTopic(UID, 'the biopsy', m.forget.firestoreForgetStore),
      store.readForgotten(UID),
    ]);
    for (const r of [results[0], results[2], results[4]] as Array<{
      topics: string[];
      generation: number;
    }>) {
      expect(r.topics).toHaveLength(r.generation);
    }
    expect(docs.get(DOC)).toMatchObject({ topics: ['Larkspur', 'biopsy'], generation: 2 });
    expect(m.forget.forgetGeneration(UID)).toBe(2);
  });
});

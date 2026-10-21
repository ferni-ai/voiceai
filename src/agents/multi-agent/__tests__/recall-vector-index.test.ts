/**
 * RECALL_VECTOR_INDEX through the per-turn hook: stored vectors replace the
 * call-start embedding, and older facts found by meaning pass the snapshot's
 * own filters before they can be recalled. Only the database and the
 * embedding model are fakes.
 */
import { FieldValue } from '@google-cloud/firestore';
import { describe, expect, it, vi } from 'vitest';

// An empty in-memory Firestore for everything the hook loads besides the
// store under test, plus a findNearest that records what it was asked.
const fs = vi.hoisted(() => {
  const asked: unknown[] = [];
  const nearestDocs: Array<Record<string, unknown>> = [];
  const result = (rows: Array<Record<string, unknown>>) => ({
    docs: rows.map((d) => ({ data: () => d })),
  });
  const query = (path: string) => ({
    orderBy: () => query(path),
    where: () => query(path),
    limit: () => ({ get: async () => result([]) }),
    get: async () => result([]),
    doc: () => ({ get: async () => ({ exists: false, data: () => undefined }) }),
    findNearest: (options: Record<string, unknown>) => {
      asked.push({ path, ...options });
      return { get: async () => result(nearestDocs) };
    },
  });
  const db = {
    collection: (root: string) => ({
      doc: (id: string) => ({ collection: (name: string) => query(`${root}/${id}/${name}`) }),
    }),
  };
  return { asked, db, nearestDocs };
});
vi.mock('../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/firestore-utils.js')>()),
  getFirestoreDb: () => fs.db,
}));

import { createMemoryRecall, firestoreRecallStore } from '../memory-recall-hook.js';
import { ANCHORS, type RetrievalEmbedder } from '../../../memory/recall/semantic-recall.js';
import { storedTopic } from '../../../memory/recall/session-recall.js';
import {
  storedFactText,
  type VectorRecallStore,
} from '../../../memory/recall/stored-fact-vectors.js';

/** Texts about the same thing share an axis, whatever words they use. */
const TOPICS: RegExp[] = [
  /book flights|ought to get sorted|before the weekend|registration/i,
  /pottery|clay/i,
  /retriever|pup/i,
];
const fakeEmbed: RetrievalEmbedder = async (texts) =>
  texts.map((t) => {
    const hit = TOPICS.findIndex((re) => re.test(t));
    const v = [...TOPICS.map((_, i) => (i === hit ? 1 : 0.05)), 0.05, 0.05, 0.05, 0.05];
    return [...v, ...new Array<number>(768 - v.length).fill(0)]; // the stored size
  });
const settle = () =>
  new Promise((r) => {
    setTimeout(r, 0);
  });
const MODEL = 'test-embedding-model';

function spyEmbed() {
  const calls: Array<{ texts: string[]; role: string }> = [];
  const embed: RetrievalEmbedder = async (texts, role) => {
    calls.push({ texts, role });
    return fakeEmbed(texts, role);
  };
  return { calls, embed };
}

const fact = (entityName: string, key: string, value: string, extra = {}) => ({
  entityName,
  key,
  value,
  confidence: 0.9,
  extractedAt: '2026-01-05T10:00:00.000Z',
  ...extra,
});
/** A fact as the writer stores it with RECALL_VECTOR_INDEX on. */
async function withVector(d: Record<string, unknown>, model = MODEL) {
  const [v] = await fakeEmbed([storedFactText(d)], 'document');
  return {
    ...d,
    embedding: FieldValue.vector(v),
    embeddingModel: model,
    embeddingTask: 'RETRIEVAL_DOCUMENT',
  };
}

const PUP = fact('Biscuit', 'breed', 'golden retriever');
const ERRAND = fact('user', 'chore', 'renew the car registration before the weekend');
const OLD_POTTERY = fact('user', 'hobby', 'took a pottery class in the spring');
const OLD_FLIGHTS = fact('user', 'travel_plan', 'needs to book flights to Lisbon');
const OLD_REMOVED = fact('user', 'errand', 'book flights for the reunion', {
  forgottenAt: '2026-03-01T00:00:00.000Z',
});

function storeOf(
  docs: Array<Record<string, unknown>>,
  nearest?: VectorRecallStore['nearest']
): VectorRecallStore {
  return {
    facts: async () => docs,
    summaries: async () => [],
    forgotten: async () => [storedTopic('Lisbon')],
    ...(nearest && { nearest }),
  };
}

function recallFor(store: VectorRecallStore, embed: RetrievalEmbedder, vectorIndex = true) {
  return createMemoryRecall({
    userId: 'u-vectors',
    userName: 'Sam',
    semantic: true,
    vectorIndex,
    embeddingModel: Promise.resolve(MODEL),
    embed,
    store,
    episodes: false,
    summaries: false,
  });
}

/** The turn as an interim, its embedding (and any search) landing, then as the final. */
async function userTurn(recall: ReturnType<typeof createMemoryRecall>, said: string) {
  const notes = [recall.noteFor(said, { final: false })];
  await settle();
  notes.push(recall.noteFor(said));
  recall.newTurn();
  return notes.filter(Boolean).join('\n');
}

async function startCall(recall: ReturnType<typeof createMemoryRecall>) {
  await recall.ready;
  await settle(); // the call-start index
  recall.noteFor('hey there');
  recall.newTurn();
}

describe('RECALL_VECTOR_INDEX: the call-start embedding', () => {
  it('off: every fact is embedded at call start, as before, even with stored vectors', async () => {
    const docs = await Promise.all([PUP, ERRAND].map((d) => withVector(d)));
    const { calls, embed } = spyEmbed();
    await startCall(recallFor(storeOf(docs), embed, false));
    expect(calls[0]).toEqual({
      texts: [
        'Biscuit breed: golden retriever',
        expect.stringContaining('registration'),
        ...ANCHORS,
      ],
      role: 'document',
    });
  });

  it('on: facts with stored vectors are not embedded again, and still recalled', async () => {
    const docs = await Promise.all([PUP, ERRAND].map((d) => withVector(d)));
    const { calls, embed } = spyEmbed();
    const recall = recallFor(storeOf(docs), embed);
    await startCall(recall);
    expect(calls[0]).toEqual({ texts: ANCHORS, role: 'document' });
    expect(calls.filter((c) => c.role === 'document')).toHaveLength(1);
    const note = await userTurn(recall, 'how is the pup doing these days');
    expect(note).toContain('golden retriever');
  });

  it('on: a vector from another model is not used; that fact is embedded', async () => {
    const docs = [await withVector(PUP), await withVector(ERRAND, 'another-model')];
    const { calls, embed } = spyEmbed();
    await startCall(recallFor(storeOf(docs), embed));
    expect(calls[0].texts).toEqual([expect.stringContaining('registration'), ...ANCHORS]);
  });
});

describe('RECALL_VECTOR_INDEX: older facts found by meaning', () => {
  it('recalls an old fact the snapshot never loaded', async () => {
    const old = await withVector(OLD_POTTERY);
    const recall = recallFor(
      storeOf([await withVector(PUP)], async () => [old]),
      fakeEmbed
    );
    await startCall(recall);
    expect(await userTurn(recall, 'have I told you about my clay stuff lately')).toContain(
      'pottery class'
    );
  });

  it('never recalls a forgotten fact the search returns', async () => {
    const found = await Promise.all(
      [OLD_FLIGHTS, OLD_REMOVED, OLD_POTTERY].map((d) => withVector(d))
    );
    const recall = recallFor(
      storeOf([await withVector(PUP)], async () => found),
      fakeEmbed
    );
    await startCall(recall);
    const errands = await userTurn(recall, 'anything I ought to get sorted before the weekend');
    expect(errands).not.toMatch(/Lisbon|reunion/);
    // The same search does bring back what wasn't forgotten.
    expect(await userTurn(recall, 'have I told you about my clay stuff lately')).toContain(
      'pottery class'
    );
  });

  it('a failed or stalled search leaves the turn as it was without one', async () => {
    const turns = [
      'how is the pup doing these days',
      'anything I ought to get sorted before the weekend',
    ];
    const notesWith = async (nearest?: VectorRecallStore['nearest']) => {
      const docs = await Promise.all([PUP, ERRAND].map((d) => withVector(d)));
      const recall = recallFor(storeOf(docs, nearest), fakeEmbed);
      await startCall(recall);
      const notes: string[] = [];
      for (const t of turns) notes.push(await userTurn(recall, t));
      return notes;
    };
    const without = await notesWith();
    expect(without[0]).toContain('golden retriever');
    let searches = 0;
    const failing = async () => {
      searches++;
      throw new Error('index missing');
    };
    expect(await notesWith(failing)).toEqual(without);
    expect(searches).toBeGreaterThan(0);
    const stalled = () => {
      searches++;
      return new Promise<never>(() => {});
    };
    searches = 0;
    expect(await notesWith(stalled)).toEqual(without);
    expect(searches).toBeGreaterThan(0);
  });
});

describe('firestoreRecallStore.nearest', () => {
  it("asks the caller's dynamic_facts for the nearest by cosine", async () => {
    fs.nearestDocs.splice(0, fs.nearestDocs.length, {
      entityName: 'Biscuit',
      key: 'k',
      value: 'v',
    });
    const docs = await firestoreRecallStore.nearest!('u1', [0.1, 0.2], 8);
    expect(docs).toEqual([{ entityName: 'Biscuit', key: 'k', value: 'v' }]);
    expect(fs.asked.at(-1)).toEqual({
      path: 'bogle_users/u1/dynamic_facts',
      vectorField: 'embedding',
      queryVector: [0.1, 0.2],
      limit: 8,
      distanceMeasure: 'COSINE',
      distanceResultField: '_d',
    });
  });
});

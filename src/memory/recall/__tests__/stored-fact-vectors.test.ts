import { FieldValue } from '@google-cloud/firestore';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createStoredVectors,
  FACT_VECTOR_DIMENSION,
  factItems,
  NEAREST_TIMEOUT_MS,
  recallVectorIndexEnabled,
  storedFactText,
  vectorOf,
  type VectorRecallStore,
} from '../stored-fact-vectors.js';
import { loadRecallSnapshot, storedTopic } from '../session-recall.js';

const MODEL = 'test-embedding-model';
const V = Array.from({ length: FACT_VECTOR_DIMENSION }, (_, i) => (i % 3) / 10);
const doc = (value: string, extra: Record<string, unknown> = {}) => ({
  entityName: 'user',
  key: 'note',
  value,
  confidence: 0.9,
  embedding: FieldValue.vector(V),
  embeddingModel: MODEL,
  embeddingTask: 'RETRIEVAL_DOCUMENT',
  ...extra,
});

function storeWith(found: Array<Record<string, unknown>>, topics: string[] | null = []) {
  const store: VectorRecallStore = {
    facts: async () => [],
    summaries: async () => [],
    forgotten: async () => topics,
    nearest: async () => found,
  };
  return store;
}

/** Loads the snapshot through the wrapper, as the hook does, so the forgotten topics are read. */
async function started(store: VectorRecallStore) {
  const stored = createStoredVectors(store, 'u1', Promise.resolve(MODEL));
  await loadRecallSnapshot(stored.store, 'u1');
  return stored;
}

afterEach(() => vi.useRealTimers());

describe('recallVectorIndexEnabled', () => {
  it('is off by default and on when set', () => {
    expect(recallVectorIndexEnabled({})).toBe(false);
    expect(recallVectorIndexEnabled({ RECALL_VECTOR_INDEX: 'on' })).toBe(true);
  });
});

describe('vectorOf', () => {
  it('round-trips a Firestore VectorValue, and reads a plain array', () => {
    const v = [0.25, -0.5, 0.125];
    expect(vectorOf(FieldValue.vector(v))).toEqual(v);
    expect(vectorOf(v)).toEqual(v);
    expect(vectorOf(undefined)).toBeUndefined();
    expect(vectorOf(['a'])).toBeUndefined();
  });
});

describe('createStoredVectors', () => {
  it('gives the index stored vectors only from the current model', async () => {
    const store: VectorRecallStore = {
      facts: async () => [
        doc('same model'),
        doc('older model', { embeddingModel: 'other' }),
        doc('wrong size', { embedding: FieldValue.vector([0.1, 0.2]) }),
      ],
      summaries: async () => [],
    };
    const stored = await started(store);
    const snapshot = await loadRecallSnapshot(stored.store, 'u1');
    const items = factItems(snapshot.facts, 'Sam', stored);
    expect(items.map((i) => [i.text, i.vector])).toEqual([
      ['Sam note: same model', V],
      ['Sam note: older model', undefined],
      ['Sam note: wrong size', undefined],
    ]);
    expect(stored.vectorFor(storedFactText(doc('same model')))).toEqual(V);
  });

  it('never returns a forgotten or corrected fact the search finds', async () => {
    const stored = await started(
      storeWith(
        [
          doc('kept this one'),
          doc('flights to Lisbon'),
          doc('removed in the app', { forgottenAt: '2026-03-01T00:00:00.000Z' }),
          doc('was wrong', { correctedAt: '2026-03-01T00:00:00.000Z' }),
        ],
        [storedTopic('Lisbon')]
      )
    );
    const found = await stored.nearest([1, 0, 0]);
    expect(found.map((i) => i.text)).toEqual(['they note: kept this one']);
    const pool = stored.pool({ facts: [], followUps: [] });
    expect(pool.facts.map((f) => f.value)).toEqual(['kept this one']);
  });

  it('finds nothing when the forgotten topics could not be read', async () => {
    const stored = await started(storeWith([doc('kept this one')], null));
    expect(await stored.nearest([1, 0, 0])).toEqual([]);
  });

  it('finds nothing before the snapshot has read the forgotten topics', async () => {
    const stored = createStoredVectors(
      storeWith([doc('kept this one')]),
      'u1',
      Promise.resolve(MODEL)
    );
    expect(await stored.nearest([1, 0, 0])).toEqual([]);
  });

  it('gives up on a search that takes too long', async () => {
    const stalled: VectorRecallStore = {
      ...storeWith([]),
      nearest: () => new Promise(() => {}),
    };
    const stored = await started(stalled);
    vi.useFakeTimers();
    const search = stored.nearest([1, 0, 0]);
    const outcome = expect(search).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(NEAREST_TIMEOUT_MS);
    await outcome;
    expect(stored.pool({ facts: [], followUps: [] }).facts).toEqual([]);
  });

  it('runs one query at a time, counting one that timed out until Firestore answers', async () => {
    let answer: (docs: Array<Record<string, unknown>>) => void = () => undefined;
    let queries = 0;
    const slow: VectorRecallStore = {
      ...storeWith([]),
      nearest: () => {
        queries++;
        return new Promise((resolve) => {
          answer = resolve;
        });
      },
    };
    const stored = await started(slow);
    vi.useFakeTimers();
    const first = expect(stored.nearest([1, 0, 0])).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(NEAREST_TIMEOUT_MS);
    await first;
    const second = stored.nearest([1, 0, 0]);
    expect(queries).toBe(1);
    expect(await second).toEqual([]);
    answer([]);
    await vi.advanceTimersByTimeAsync(0);
    void stored.nearest([1, 0, 0]);
    expect(queries).toBe(2);
  });
});

/**
 * Old emotional_history documents carry a snippet of what the caller said in
 * each data point. Loading one keeps only a listed label, scores in range, the
 * source and a valid time, so the snippet never reaches memory and the next
 * save can't write it back, whatever key it sits under and however it was cut.
 * A point with a bad time is dropped alone and never stops the rest saving.
 * Saving merges with what is stored, so a restart or a second instance never
 * loses an earlier point. The emotional arc read from a legacy document is the
 * same as from a clean one.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeFirestore,
  newFakeFirestoreState,
  resetFakeFirestore,
} from '../../../../tests/helpers/fake-firestore.js';
import { leakedPieces, PARTIALS, SENTINEL } from '../../../../tests/helpers/snippet-leak.js';

const fsState = vi.hoisted(() => ({ get: (() => null) as () => unknown }));

vi.mock('../../persistence/firestore-persistence.js', () => ({
  initializeFirestorePersistence: async () => undefined,
  getFirestore: () => fsState.get(),
}));

const store = newFakeFirestoreState();
fsState.get = createFakeFirestore(store);

import {
  analyzeEmotionalArc,
  loadEmotionalHistory,
  persistEmotionalHistory,
  recordEmotionalDataPoint,
} from '../better-than-human.js';

const KEPT = ['emotion', 'intensity', 'source', 'timestamp', 'valence'];

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const clean = [
  { timestamp: hoursAgo(50), emotion: 'anxious', intensity: 0.7, valence: -0.4, source: 'text' },
  { timestamp: hoursAgo(30), emotion: 'sad', intensity: 0.5, valence: -0.6, source: 'voice' },
  {
    timestamp: hoursAgo(10),
    emotion: 'anxious',
    intensity: 0.4,
    valence: -0.1,
    source: 'inferred',
  },
  { timestamp: hoursAgo(2), emotion: 'calm', intensity: 0.3, valence: 0.5, source: 'text' },
];
/** The same points as written before: whole, partial and nested snippets. */
const legacy = [
  { ...clean[0], context: SENTINEL.slice(0, 100) },
  { ...clean[1], context: PARTIALS[1] },
  { ...clean[2], text: SENTINEL, meta: { snippet: PARTIALS[0], words: [PARTIALS[2]] } },
  { ...clean[3], context: { utterance: { slice: PARTIALS[1] } } },
];

const doc = (uid: string) =>
  store.docs.get(`emotional_history/${uid}`) as { dataPoints: unknown[] } | undefined;
const put = (uid: string, dataPoints: unknown[]) =>
  store.docs.set(`emotional_history/${uid}`, { userId: uid, dataPoints });

beforeEach(() => resetFakeFirestore(store));

describe('loading a legacy emotional_history document', () => {
  it('keeps no snippet in memory, and the next save writes none', async () => {
    put('u-legacy', legacy);
    expect(leakedPieces(doc('u-legacy')).length).toBeGreaterThan(0); // precondition

    await loadEmotionalHistory('u-legacy');
    const loaded = analyzeEmotionalArc('u-legacy', '7d').dataPoints;
    expect(loaded).toHaveLength(4);
    for (const dp of loaded) expect(Object.keys(dp).sort()).toEqual(KEPT);
    expect(leakedPieces(loaded)).toEqual([]);

    await persistEmotionalHistory('u-legacy');
    expect(leakedPieces(doc('u-legacy'))).toEqual([]);
    expect(doc('u-legacy')!.dataPoints).toEqual(clean);
  });

  it('reads the same arc as a clean document with the same points', async () => {
    put('u-legacy2', legacy);
    put('u-clean', clean);
    await loadEmotionalHistory('u-legacy2');
    await loadEmotionalHistory('u-clean');

    const { userId: _a, ...fromLegacy } = analyzeEmotionalArc('u-legacy2', '7d');
    const { userId: _b, ...fromClean } = analyzeEmotionalArc('u-clean', '7d');
    expect(fromLegacy).toEqual(fromClean);
    expect(fromLegacy.dominantEmotion).toBe('anxious');
    expect(fromLegacy.averageValence).toBeCloseTo(-0.15);
  });

  it('drops text kept under a kept key: a sentence label, a string score, an object', async () => {
    put('u-odd', [
      SENTINEL,
      { ...clean[0], emotion: PARTIALS[0] },
      { ...clean[0], emotion: 'sad', intensity: PARTIALS[1] },
      { ...clean[0], emotion: 'calm', valence: { why: PARTIALS[2] } },
      { ...clean[0], emotion: 'tired', source: PARTIALS[1] },
      legacy[0],
    ]);
    await loadEmotionalHistory('u-odd');
    await persistEmotionalHistory('u-odd');
    expect(leakedPieces(doc('u-odd'))).toEqual([]);
    expect(doc('u-odd')!.dataPoints).toEqual([clean[0]]);
  });
});

describe('a bad timestamp', () => {
  it('drops that one point and never blocks the valid ones from saving', async () => {
    put('u-time', [
      { ...clean[0], timestamp: 'last tuesday' },
      { emotion: 'sad', intensity: 0.5, valence: -0.6, source: 'text' }, // none
      { ...clean[1], timestamp: { seconds: 'x' } },
      { ...clean[1], timestamp: '2999-01-01T00:00:00.000Z' }, // far future
      { context: PARTIALS[0] }, // only a snippet
      clean[2],
    ]);
    await loadEmotionalHistory('u-time');
    recordEmotionalDataPoint('u-time', 'calm', 0.3, 0.5, 'text');

    await persistEmotionalHistory('u-time');
    const saved = doc('u-time')!.dataPoints as Array<Record<string, unknown>>;
    expect(saved.map((p) => p.emotion)).toEqual(['anxious', 'calm']);
    expect(saved.every((p) => Number.isFinite(Date.parse(p.timestamp as string)))).toBe(true);
    expect(leakedPieces(saved)).toEqual([]);
  });
});

describe('saving merges with what is stored', () => {
  it('a record after a restart (nothing loaded) keeps the earlier stored point', async () => {
    put('u-restart', [clean[1]]); // saved by an earlier process
    recordEmotionalDataPoint('u-restart', 'hopeful', 0.6, 0.4, 'text');
    await persistEmotionalHistory('u-restart');
    const saved = doc('u-restart')!.dataPoints as Array<Record<string, unknown>>;
    expect(saved.map((p) => p.emotion)).toEqual(['sad', 'hopeful']);
  });

  it('two instances recording at once keep both points', async () => {
    vi.resetModules();
    const a = await import('../better-than-human.js');
    vi.resetModules();
    const b = await import('../better-than-human.js');
    expect(a).not.toBe(b); // two separate in-memory histories, one database

    a.recordEmotionalDataPoint('u-race', 'anxious', 0.7, -0.4, 'voice');
    b.recordEmotionalDataPoint('u-race', 'calm', 0.3, 0.5, 'text');
    await Promise.all([a.persistEmotionalHistory('u-race'), b.persistEmotionalHistory('u-race')]);
    const saved = doc('u-race')!.dataPoints as Array<Record<string, unknown>>;
    expect(saved.map((p) => p.emotion).sort()).toEqual(['anxious', 'calm']);
  });

  it('writes only the named fields, even if an entry in memory picked up more', async () => {
    recordEmotionalDataPoint('u-mem', 'sad', 0.5, -0.6, 'text');
    const inMemory = analyzeEmotionalArc('u-mem', '7d').dataPoints[0] as unknown as Record<
      string,
      unknown
    >;
    inMemory.context = PARTIALS[1];
    expect(leakedPieces(analyzeEmotionalArc('u-mem', '7d').dataPoints).length).toBeGreaterThan(0);

    await persistEmotionalHistory('u-mem');
    expect(leakedPieces(doc('u-mem'))).toEqual([]);
    expect(Object.keys(doc('u-mem')!.dataPoints[0] as object).sort()).toEqual(KEPT);
  });
});

describe('persistEmotionalHistory', () => {
  it('resolves true once written, false with nothing to write or no database', async () => {
    expect(await persistEmotionalHistory('u-none')).toBe(false);
    recordEmotionalDataPoint('u-ok', 'calm', 0.3, 0.5, 'text');
    expect(await persistEmotionalHistory('u-ok')).toBe(true);
    store.up = false;
    recordEmotionalDataPoint('u-down', 'calm', 0.3, 0.5, 'text');
    expect(await persistEmotionalHistory('u-down')).toBe(false);
  });
});

/**
 * Old emotional_history documents carry a snippet of what the caller said in
 * each data point. Loading one keeps only the labels, scores, source and time,
 * so the snippet never reaches memory and the next save can't write it back,
 * whatever key it sits under and however it was cut. The emotional arc read
 * from a legacy document is the same as from a clean one.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => new Map<string, Record<string, unknown>>());

vi.mock('../../persistence/firestore-persistence.js', () => ({
  initializeFirestorePersistence: async () => undefined,
  getFirestore: () => ({
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => ({
          exists: store.has(`${name}/${id}`),
          data: () => structuredClone(store.get(`${name}/${id}`)),
        }),
        set: async (value: Record<string, unknown>) =>
          void store.set(`${name}/${id}`, structuredClone(value)),
      }),
    }),
  }),
}));

import {
  analyzeEmotionalArc,
  loadEmotionalHistory,
  persistEmotionalHistory,
} from '../better-than-human.js';

const SENTINEL = 'my sister Dolores has stage-three lupus';
const PARTIAL = SENTINEL.slice(3, 22); // a truncated slice: "sister Dolores has "
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
  { ...clean[1], context: PARTIAL },
  { ...clean[2], text: SENTINEL, meta: { snippet: SENTINEL, words: [PARTIAL] } },
  { ...clean[3], context: { utterance: { slice: PARTIAL } } },
];

const doc = (uid: string) => store.get(`emotional_history/${uid}`);

beforeEach(() => store.clear());

describe('loading a legacy emotional_history document', () => {
  it('keeps no snippet in memory, and the next save writes none', async () => {
    store.set('emotional_history/u-legacy', { userId: 'u-legacy', dataPoints: legacy });
    expect(JSON.stringify(doc('u-legacy'))).toContain(SENTINEL); // precondition

    await loadEmotionalHistory('u-legacy');
    const loaded = analyzeEmotionalArc('u-legacy', '7d').dataPoints;
    expect(loaded).toHaveLength(4);
    for (const dp of loaded) expect(Object.keys(dp).sort()).toEqual(KEPT);
    expect(JSON.stringify(loaded)).not.toContain(PARTIAL);

    await persistEmotionalHistory('u-legacy');
    const saved = doc('u-legacy') as { dataPoints: unknown[] };
    expect(JSON.stringify(saved)).not.toContain(PARTIAL);
    expect(JSON.stringify(saved)).not.toContain('Dolores');
    expect(saved.dataPoints).toEqual(clean);
  });

  it('reads the same arc as a clean document with the same points', async () => {
    store.set('emotional_history/u-legacy', { userId: 'u-legacy', dataPoints: legacy });
    store.set('emotional_history/u-clean', { userId: 'u-clean', dataPoints: clean });
    await loadEmotionalHistory('u-legacy');
    await loadEmotionalHistory('u-clean');

    const { userId: _a, ...fromLegacy } = analyzeEmotionalArc('u-legacy', '7d');
    const { userId: _b, ...fromClean } = analyzeEmotionalArc('u-clean', '7d');
    expect(fromLegacy).toEqual(fromClean);
    expect(fromLegacy.dominantEmotion).toBe('anxious');
    expect(fromLegacy.averageValence).toBeCloseTo(-0.15);
    expect(fromLegacy.dataPoints.map((dp) => [dp.emotion, dp.intensity, dp.source])).toEqual(
      clean.map((dp) => [dp.emotion, dp.intensity, dp.source])
    );
  });

  it('drops entries that are not data points (a bare string of words)', async () => {
    store.set('emotional_history/u-odd', {
      userId: 'u-odd',
      dataPoints: [SENTINEL, ...legacy.slice(0, 1)],
    });
    await loadEmotionalHistory('u-odd');
    await persistEmotionalHistory('u-odd');
    expect(JSON.stringify(doc('u-odd'))).not.toContain('Dolores');
    expect((doc('u-odd') as { dataPoints: unknown[] }).dataPoints).toEqual([clean[0]]);
  });
});

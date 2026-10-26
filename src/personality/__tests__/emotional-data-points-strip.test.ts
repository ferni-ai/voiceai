/**
 * emotional_data/{uid}/points: older points hold `context`, a slice of what the
 * caller said. Reading them back keeps only the label, intensity and time (a
 * point without a valid one is skipped alone), and saving writes only those,
 * never the words or topics.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { leakedPieces, PARTIALS, SENTINEL } from '../../tests/helpers/snippet-leak.js';

const points = vi.hoisted(() => new Map<string, Record<string, unknown>>());

vi.mock('../../utils/firebase-admin-app.js', () => {
  const sub = (uid: string) => ({
    doc: (id = `p${points.size + 1}`) => ({
      set: async (data: Record<string, unknown>) =>
        void points.set(`${uid}/${id}`, structuredClone(data)),
    }),
    orderBy: () => ({
      get: async () => ({
        docs: [...points]
          .filter(([k]) => k.startsWith(`${uid}/`))
          .map(([, v]) => ({ data: () => structuredClone(v) })),
      }),
    }),
  });
  const db = { collection: () => ({ doc: (uid: string) => ({ collection: () => sub(uid) }) }) };
  return { getAdminFirestore: () => db };
});

const { getEmotionalDataPoints, saveEmotionalDataPoint } =
  await import('../pattern-persistence.js');

const T = '2026-09-01T10:00:00.000Z';
beforeEach(() => points.clear());

describe('emotional_data points', () => {
  it('reads back only the label, intensity and time of a legacy point', async () => {
    points.set('u1/a', { timestamp: T, emotion: 'anxious', intensity: 0.7, context: SENTINEL });
    points.set('u1/b', { timestamp: T, emotion: 'sad', intensity: 0.4, meta: { s: PARTIALS[1] } });
    points.set('u1/c', { timestamp: 'not a time', emotion: 'calm', intensity: 0.2 });
    points.set('u1/d', { timestamp: T, emotion: PARTIALS[0], intensity: 0.2 });
    expect(leakedPieces([...points]).length).toBeGreaterThan(0); // precondition

    const read = await getEmotionalDataPoints('u1');
    expect(leakedPieces(read)).toEqual([]);
    expect(read.map((p) => [p.emotion, p.intensity, p.timestamp.toISOString()])).toEqual([
      ['anxious', 0.7, T],
      ['sad', 0.4, T],
    ]);
  });

  it('saves the label, intensity and times, never the words or topics', async () => {
    const ok = await saveEmotionalDataPoint('u2', {
      timestamp: new Date(T),
      emotion: 'Worried',
      intensity: 0.5,
      topics: ['family'],
      context: PARTIALS[2],
    });
    expect(ok).toBe(true);
    const [saved] = [...points.values()];
    expect(leakedPieces(saved)).toEqual([]);
    expect(Object.keys(saved).sort()).toEqual(['createdAt', 'emotion', 'intensity', 'timestamp']);
    expect(saved).toMatchObject({ emotion: 'worried', intensity: 0.5, timestamp: T });
  });

  it('saves nothing for a point whose label is text', async () => {
    const ok = await saveEmotionalDataPoint('u3', {
      timestamp: new Date(T),
      emotion: PARTIALS[0],
      intensity: 0.5,
      topics: [],
    });
    expect(ok).toBe(false);
    expect(points.size).toBe(0);
  });
});

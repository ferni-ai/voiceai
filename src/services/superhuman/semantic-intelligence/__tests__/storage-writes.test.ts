/**
 * What correlation mining and emotional arcs write to Firestore per turn:
 * only the correlations a turn changed, and no embeddings nobody reads back
 * (storage-shape.ts). Before, every observation rewrote up to 50 correlations
 * with two embeddings each, blocking the event loop 415-793 ms on dev.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const writes: Array<{ path: string; data: Record<string, unknown> }> = [];
let seeded: Array<Record<string, unknown>> = [];

function collection(path: string): unknown {
  const doc = (id: string) => ({
    collection: (name: string) => collection(`${path}/${id}/${name}`),
    set: async (data: Record<string, unknown>) => {
      writes.push({ path: `${path}/${id}`, data });
    },
  });
  const query = {
    orderBy: () => query,
    limit: () => query,
    get: async () => ({ docs: seeded.map((d) => ({ data: () => structuredClone(d) })) }),
  };
  return { doc, ...query };
}

const db = {
  collection,
  batch: () => {
    const staged: Array<{ path: string; data: Record<string, unknown> }> = [];
    return {
      set: (ref: { set: unknown; path?: string }, data: Record<string, unknown>) => {
        staged.push({ path: (ref as { __path?: string }).__path ?? '', data });
      },
      commit: async () => {
        writes.push(...staged);
      },
    };
  },
};

vi.mock('../../firestore-utils.js', () => ({
  getFirestoreDb: () => db,
  cleanForFirestore: (obj: unknown) => obj,
}));
vi.mock('../../../../memory/embeddings.js', () => ({
  embed: async () => Array.from({ length: 768 }, (_, i) => i / 768),
  cosineSimilarity: () => 0.9,
}));
vi.mock('../../../data-layer/hooks/better-than-human-hooks.js', () => ({
  onCorrelationInsightChange: vi.fn(async () => undefined),
}));
vi.mock('../../../data-layer/hooks/wisdom-hooks.js', () => ({
  onEmotionalPatternChange: vi.fn(async () => undefined),
}));

import { clearCorrelationCache, recordObservation } from '../correlation-mining.js';
import { clearArcCache, recordEmotionalWaypoint } from '../emotional-trajectories.js';

const vec = Array.from({ length: 768 }, () => 0.5);
function stored(id: string, a: [string, string], b: [string, string]): Record<string, unknown> {
  const now = Date.now();
  return {
    id,
    userId: 'u1',
    domainA: { type: a[0], pattern: a[1], embedding: vec },
    domainB: { type: b[0], pattern: b[1], embedding: vec },
    strength: 0.8,
    confidence: 0.67,
    observationCount: 10,
    coOccurrences: [],
    insight: 'x',
    insightType: 'pattern',
    firstObserved: now,
    lastObserved: now,
  };
}

beforeEach(() => {
  writes.length = 0;
  seeded = [];
  clearCorrelationCache();
  clearArcCache();
});

describe('correlation writes', () => {
  it('write only the correlation a turn touched, without embeddings', async () => {
    seeded = [
      stored('corr_touched', ['emotion', 'joy'], ['topic', 'music']),
      stored('corr_untouched', ['person', 'bob'], ['topic', 'work']),
    ];
    await recordObservation('u1', { domain: 'emotion', pattern: 'joy' });
    await recordObservation('u1', { domain: 'topic', pattern: 'music' });

    const ids = writes.map((w) => w.data.id);
    expect(ids).toContain('corr_touched');
    expect(ids).not.toContain('corr_untouched');
    for (const w of writes) {
      expect(w.data.domainA).not.toHaveProperty('embedding');
      expect(w.data.domainB).not.toHaveProperty('embedding');
    }
  });

  it('writes nothing when a turn changed no correlation', async () => {
    seeded = [stored('corr_untouched', ['person', 'bob'], ['topic', 'work'])];
    await recordObservation('u1', { domain: 'emotion', pattern: 'joy' });
    expect(writes).toHaveLength(0);
  });
});

describe('arc writes', () => {
  it('stores waypoints without embeddings and keeps them in memory', async () => {
    const arc = await recordEmotionalWaypoint('u1', {
      emotion: 'joy',
      intensity: 0.6,
      valence: 0.5,
      context: 'new job',
    });
    const saved = writes.find((w) => w.path.includes('emotional_arcs'))?.data as {
      waypoints: Array<Record<string, unknown>>;
      themeEmbedding?: number[];
    };
    expect(saved.waypoints).toHaveLength(1);
    expect(saved.waypoints[0]).not.toHaveProperty('embedding');
    expect(saved.waypoints[0].emotion).toBe('joy');
    expect(saved.themeEmbedding).toHaveLength(768);
    expect(arc?.waypoints[0].embedding).toHaveLength(768);
  });
});

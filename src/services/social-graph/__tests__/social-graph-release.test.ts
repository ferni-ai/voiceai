/**
 * The worker process serves many callers in turn, so each caller's social graph
 * must leave memory once it's saved at session end, and must not be dropped if
 * the save fails.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { firestore } = vi.hoisted(() => {
  const stored = new Map<string, Record<string, unknown>>();
  const docRef = (userId: string) => ({
    get: vi.fn(async () => ({
      exists: stored.has(userId),
      data: () => stored.get(userId),
    })),
    set: vi.fn(async (data: Record<string, unknown>) => {
      stored.set(userId, JSON.parse(JSON.stringify(data)) as Record<string, unknown>);
    }),
  });
  const db = {
    collection: () => ({
      doc: (userId: string) => ({
        collection: () => ({ doc: () => docRef(userId) }),
      }),
    }),
  };
  return { firestore: { db: db as typeof db | null, stored } };
});

vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => firestore.db,
}));
vi.mock('../../data-layer/hooks/better-than-human-hooks.js', () => ({
  onCorrelationInsightChange: vi.fn(),
}));
vi.mock('../../data-layer/hooks/superhuman-hooks.js', () => ({
  onRelationshipNetworkChange: vi.fn(),
}));

import {
  clearAllSocialGraphs,
  ensureGraphLoaded,
  getUserGraph,
  persistGraphToFirestore,
  recordMention,
  releaseSocialGraph,
} from '../index.js';

describe('social graph memory lifetime', () => {
  beforeEach(() => {
    clearAllSocialGraphs();
    firestore.stored.clear();
  });

  it('reloads a released graph from Firestore on the next call', async () => {
    recordMention('user-a', 'Sarah', 'my sister Sarah', 0.6);
    const graph = getUserGraph('user-a');
    expect(graph).toBeDefined();
    expect(await persistGraphToFirestore('user-a', graph!)).toBe(true);

    releaseSocialGraph('user-a');
    expect(getUserGraph('user-a')).toBeUndefined();

    await ensureGraphLoaded('user-a');
    expect(getUserGraph('user-a')?.people.size).toBe(1);
  });

  it('keeps graphs of different callers apart when one is released', async () => {
    recordMention('user-a', 'Sarah', 'my sister Sarah', 0.6);
    recordMention('user-b', 'Marcus', 'my friend Marcus', 0.4);

    releaseSocialGraph('user-a');

    expect(getUserGraph('user-a')).toBeUndefined();
    expect(getUserGraph('user-b')?.people.size).toBe(1);
  });

  it('reports a failed save so the caller can keep the graph', async () => {
    recordMention('user-a', 'Sarah', 'my sister Sarah', 0.6);
    const savedDb = firestore.db;
    firestore.db = null;
    try {
      expect(await persistGraphToFirestore('user-a', getUserGraph('user-a')!)).toBe(false);
    } finally {
      firestore.db = savedDb;
    }
  });
});

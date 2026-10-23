/**
 * A failed social graph read never overwrites the stored graph.
 *
 * Before: loadGraphFromFirestore caught a read error and returned as if the
 * user had no graph, and ensureGraphLoaded marked the user loaded. The call
 * then built a graph from scratch, and the save at session end (or mid-call)
 * replaced the stored people and mentions with it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { firestore } = vi.hoisted(() => {
  const stored = new Map<string, Record<string, unknown>>();
  const state = { failReads: false };
  const docRef = (userId: string) => ({
    get: async () => {
      if (state.failReads) throw new Error('4 DEADLINE_EXCEEDED: fake timeout');
      return { exists: stored.has(userId), data: () => stored.get(userId) };
    },
    set: async (data: Record<string, unknown>) => {
      stored.set(userId, JSON.parse(JSON.stringify(data)) as Record<string, unknown>);
    },
  });
  const db = {
    collection: () => ({
      doc: (userId: string) => ({ collection: () => ({ doc: () => docRef(userId) }) }),
    }),
  };
  return { firestore: { db, stored, state } };
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
} from '../index.js';

const USER = 'user-a';

/** Saves a one-person graph for USER, then forgets it in memory. */
async function storeGraphWithSarah(): Promise<Record<string, unknown>> {
  recordMention(USER, 'Sarah', 'my sister Sarah', 0.6);
  expect(await persistGraphToFirestore(USER, getUserGraph(USER)!)).toBe(true);
  clearAllSocialGraphs();
  return structuredClone(firestore.stored.get(USER)!);
}

const storedNames = (): string[] =>
  ((firestore.stored.get(USER)?.people ?? []) as Array<{ name: string }>).map((p) => p.name);

beforeEach(() => {
  clearAllSocialGraphs();
  firestore.stored.clear();
  firestore.state.failReads = false;
});

describe('social graph reads', () => {
  it('a read that throws leaves the stored graph unwritten', async () => {
    const stored = await storeGraphWithSarah();
    firestore.state.failReads = true;

    await ensureGraphLoaded(USER);
    recordMention(USER, 'Marcus', 'my friend Marcus', 0.4);

    expect(await persistGraphToFirestore(USER, getUserGraph(USER)!)).toBe(false);
    expect(firestore.stored.get(USER)).toEqual(stored);
  });

  it('a missing document still saves the new graph', async () => {
    await ensureGraphLoaded(USER);
    recordMention(USER, 'Marcus', 'my friend Marcus', 0.4);

    expect(await persistGraphToFirestore(USER, getUserGraph(USER)!)).toBe(true);
    expect(storedNames()).toEqual(['Marcus']);
  });

  it('a graph that loaded saves its changes and keeps the stored people', async () => {
    await storeGraphWithSarah();

    await ensureGraphLoaded(USER);
    expect(getUserGraph(USER)?.people.size).toBe(1);
    recordMention(USER, 'Marcus', 'my friend Marcus', 0.4);

    expect(await persistGraphToFirestore(USER, getUserGraph(USER)!)).toBe(true);
    expect(storedNames().sort()).toEqual(['Marcus', 'Sarah']);
  });

  it('a later read that succeeds allows saving again', async () => {
    const stored = await storeGraphWithSarah();
    firestore.state.failReads = true;
    await ensureGraphLoaded(USER);
    recordMention(USER, 'Marcus', 'my friend Marcus', 0.4);
    expect(await persistGraphToFirestore(USER, getUserGraph(USER)!)).toBe(false);
    expect(firestore.stored.get(USER)).toEqual(stored);

    // The failed read did not mark the user loaded, so the next call reads again.
    firestore.state.failReads = false;
    await ensureGraphLoaded(USER);
    recordMention(USER, 'Priya', 'my coworker Priya', 0.4);

    expect(await persistGraphToFirestore(USER, getUserGraph(USER)!)).toBe(true);
    expect(storedNames()).toContain('Sarah');
    expect(storedNames()).toContain('Priya');
  });
});

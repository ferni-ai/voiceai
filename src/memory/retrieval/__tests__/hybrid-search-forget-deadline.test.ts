/**
 * FORGET_EVERY_READER and hybridSearch's leg deadline (#2662): a cold or slow
 * forgotten-topics read never holds retrieval past the deadline (it waited up
 * to 300 ms more). Past it, the last topics read for the caller apply, and
 * with none, nothing is returned (fail closed).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ slow: false }));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
vi.mock('../bm25-search.js', () => ({
  searchEntitiesBM25: async () => [{ id: 'e1', score: 2, text: 'Biscuit the dog', metadata: {} }],
}));
vi.mock('../semantic-memory-search.js', () => ({
  searchMemories: async () => ({
    results: [{ documentId: 'm1', score: 0.8, text: 'grew tomatoes', source: 's', sourceId: 'x' }],
  }),
}));
vi.mock('../../entity-store/storage.js', () => ({
  findEntityByAlias: async () => null,
  searchEntities: async () => [],
}));
vi.mock('../../recall/forget.js', async (original) => ({
  ...(await original<typeof import('../../recall/forget.js')>()),
  forgottenTopicsOrNull: async () => {
    if (store.slow) await wait(1_000);
    return ['Biscuit'];
  },
}));

const { hybridSearch } = await import('../hybrid-search.js');
const { readTopics, resetForgetTopicsSource } =
  await import('../../recall/forget-topics-source.js');

const DEADLINE = 60;
let seq = 0;
let user = '';
beforeEach(() => {
  store.slow = false;
  resetForgetTopicsSource();
  user = `member-hybrid-deadline-${++seq}`;
  vi.stubEnv('FORGET_EVERY_READER', 'on');
});
afterEach(() => vi.unstubAllEnvs());

const search = () =>
  hybridSearch(user, 'Biscuit tomatoes', { topK: 5, minScore: 0, legDeadlineMs: DEADLINE });

describe('hybridSearch, a slow forgotten-topics read and the leg deadline', () => {
  it('a cold read: retrieval ends at the deadline and returns nothing', async () => {
    store.slow = true;
    const started = Date.now();
    const { results } = await search();
    expect(Date.now() - started).toBeLessThan(DEADLINE + 150);
    expect(results).toEqual([]);
  });

  it('topics read moments ago apply: the forgotten one is left out, the rest kept', async () => {
    await readTopics(user);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 20_000); // past the 15 s cache, inside 60 s
    store.slow = true;
    const { results } = await search();
    vi.restoreAllMocks();
    expect(results.map((r) => r.id)).toEqual(['m1']);
  });
});

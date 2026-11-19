/**
 * The live leak behind FORGET_RELATED_WORDS (dev, 2026-11-19): "forget
 * everything about the Denver job" stored "Denver job", and the next call's
 * check-in still raised the stored commitment "call the recruiter back on
 * Friday to give them an answer", which shares no word with it.
 *
 * The real forgetForCaller writes the topics (to an in-memory store); the real
 * commitment readers read them back, as the next call's prompt does
 * (loadCallCheckIns -> formatCheckIn) and as the web store does. Only Firestore
 * and the forget list's storage are fakes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ForgetStore } from '../../../memory/recall/forget.js';

const h = vi.hoisted(() => ({
  rows: [] as Array<{ id: string; data: Record<string, unknown> }>,
  topics: [] as string[],
}));

function query(): Record<string, unknown> {
  const docs = h.rows.map((r) => ({ id: r.id, data: () => r.data }));
  const q: Record<string, unknown> = {
    doc: () => q,
    collection: () => q,
    where: () => q,
    orderBy: () => q,
    limit: () => q,
    update: async () => undefined,
    get: async () => ({ empty: docs.length === 0, docs }),
  };
  return q;
}
const db = { collection: () => query(), collectionGroup: () => query() };

vi.mock('../../../utils/firestore-utils.js', async (orig) => ({
  ...(await orig<typeof import('../../../utils/firestore-utils.js')>()),
  getFirestoreDb: () => db,
}));
vi.mock('../firestore-utils.js', async (orig) => ({
  ...(await orig<typeof import('../firestore-utils.js')>()),
  getFirestoreDb: () => db,
}));
vi.mock('../../../memory/recall/forget.js', async (orig) => ({
  ...(await orig<typeof import('../../../memory/recall/forget.js')>()),
  forgottenTopicsOrNull: async () => [...h.topics],
}));

const { forgetForCaller } = await import('../../../memory/recall/forget.js');
const { formatCheckIn, loadCallCheckIns } = await import('../commitment-follow-up.js');
const { loadActiveCommitmentsOrThrow, commitmentCache } = await import('../commitment-store.js');

const UID = 'u-sam';
const NOW = Date.parse('2026-11-20T16:00:00Z');
const DAY = 86_400_000;
const RECRUITER = 'call the recruiter back on Friday to give them an answer';

/** The forget list as the real forget writes it; nothing else stored. */
const topicStore: ForgetStore = {
  facts: async () => [],
  markForgotten: async () => undefined,
  addTopic: async (_u, t) => {
    if (!h.topics.includes(t)) h.topics.push(t);
  },
  topics: async () => h.topics,
};

/** What the next call's first recall note says about open commitments. */
async function nextCallNote(): Promise<string> {
  return formatCheckIn(await loadCallCheckIns(UID, undefined, NOW), NOW) ?? '';
}
async function webShown(): Promise<string[]> {
  commitmentCache.delete(UID);
  return (await loadActiveCommitmentsOrThrow(UID)).map((c) => c.statement);
}

beforeEach(() => {
  h.topics = [];
  h.rows = [
    {
      id: 'c1',
      data: {
        userId: UID,
        statement: RECRUITER,
        summary: RECRUITER,
        status: 'active',
        createdAt: NOW - DAY,
        lastMentioned: NOW - DAY,
        followUpAfter: NOW - 3_600_000,
        followUpCount: 0,
      },
    },
  ];
});
afterEach(() => {
  delete process.env.FORGET_RELATED_WORDS;
});

describe('a commitment about a forgotten topic, in other words', () => {
  it('flag off: "the Denver job" alone leaves the recruiter call in the next call (the leak)', async () => {
    await forgetForCaller(UID, 'the Denver job', topicStore, ['the recruiter', 'job offer']);
    expect(h.topics).toEqual(['Denver job']);
    expect(await nextCallNote()).toContain('recruiter');
    expect(await webShown()).toEqual([RECRUITER]);
  });

  it('flag on: the recruiter the model named keeps it out of the prompt and the web', async () => {
    process.env.FORGET_RELATED_WORDS = 'on';
    await forgetForCaller(UID, 'the Denver job', topicStore, ['the recruiter', 'job offer']);
    expect(h.topics).toEqual(['Denver job', 'recruiter', 'job offer']);
    expect(await nextCallNote()).toBe('');
    expect(await webShown()).toEqual([]);
  });
});

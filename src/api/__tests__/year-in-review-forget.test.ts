/**
 * Your Year with Ferni does not rank a topic the caller asked Ferni to forget among the year's
 * top topics, with FORGET_EVERY_READER on; off, every topic is ranked as before. Runs the real
 * route and the real forget check; only Firestore, auth, the other year panels and the forgotten
 * list are faked. Fictional data.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { firestoreForgetStore } from '../../memory/recall/forget.js';
import { resetForgetTopicsSource } from '../../memory/recall/forget-topics-source.js';

const DAY = 864e5;
const at = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString();
const SUMMARIES = [
  { timestamp: at(30), duration: 600, mainTopics: ['the Denver office', 'sleep'] },
  { timestamp: at(20), duration: 600, mainTopics: ['the Denver office', 'garden'] },
  { timestamp: at(10), duration: 600, mainTopics: ['garden'] },
];

vi.mock('../auth-middleware.js', () => ({
  requireAuth: vi.fn(async () => ({ userId: 'u-fiction', isAdmin: false })),
}));
vi.mock('../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collection: () => ({
      doc: () => ({
        collection: (sub: string) => {
          const query = {
            where: () => query,
            orderBy: () => query,
            select: () => query,
            get: async () => ({
              docs: (sub === 'summaries' ? SUMMARIES : []).map((data, i) => ({
                id: `s${i}`,
                data: () => data,
              })),
            }),
          };
          return query;
        },
      }),
    }),
  }),
  cleanForFirestore: <T>(v: T) => v,
}));
vi.mock('../../services/superhuman/dream-keeper.js', () => ({ loadUserDreams: async () => [] }));
vi.mock('../../services/superhuman/commitment-keeper.js', () => ({
  loadUserCommitments: async () => [],
}));
vi.mock('../../services/superhuman/relationship-network.js', () => ({
  loadNetwork: async () => [],
}));

const { handleYearInReviewRoutes } = await import('../year-in-review-routes.js');

async function topTopics(): Promise<{ body: string; topics: string[] }> {
  let body = '';
  const res = {
    writeHead: () => res,
    setHeader: () => undefined,
    end: (b?: string) => void (body = b ?? ''),
  };
  await handleYearInReviewRoutes(
    { method: 'GET', headers: {} } as IncomingMessage,
    res as unknown as ServerResponse,
    { pathname: '/api/year-in-review/u-fiction', query: {} }
  );
  const topics = (JSON.parse(body).topTopics as Array<{ topic: string }>).map((t) => t.topic);
  return { body, topics };
}

const forgotten = (topics: string[]) =>
  vi.spyOn(firestoreForgetStore, 'topics').mockImplementation(async () => topics);

beforeEach(() => {
  vi.stubEnv('FORGET_EVERY_READER', 'on');
  resetForgetTopicsSource();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('year in review top topics with FORGET_EVERY_READER on', () => {
  it('leaves the forgotten topic out and keeps the rest', async () => {
    forgotten(['Denver job']);
    const { body, topics } = await topTopics();
    expect(topics).toEqual(['garden', 'sleep']);
    expect(body).not.toContain('Denver');
    // The calls still count: only the topic goes.
    expect(JSON.parse(body).stats.totalConversations).toBe(3);
  });

  it('nothing forgotten: every topic', async () => {
    forgotten([]);
    expect((await topTopics()).topics).toEqual(['the Denver office', 'garden', 'sleep']);
  });
});

describe('with FORGET_EVERY_READER off (prod today)', () => {
  it.each([[undefined], ['off']])('FORGET_EVERY_READER=%s ranks every topic', async (v) => {
    vi.stubEnv('FORGET_EVERY_READER', v);
    const read = forgotten(['Denver job']);
    expect((await topTopics()).topics).toEqual(['the Denver office', 'garden', 'sleep']);
    expect(read).not.toHaveBeenCalled();
  });
});

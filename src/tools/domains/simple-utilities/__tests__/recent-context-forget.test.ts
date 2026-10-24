/**
 * recentContext leaves out what the caller asked Ferni to forget (#2719).
 *
 * Its history path (session topics and insights) and its memories fallback read stored words
 * with no forget check, so "what did we talk about re the divorce" said the divorce back.
 * Each case shows the line coming back first, then forgets it with the real forgetTopic and the
 * real stored-topics read (forgottenTopicsOrNull over an in-memory store).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const memories = vi.hoisted(() => ({ contents: [] as string[] }));
const history = vi.hoisted(() => ({
  get: (async () => ({ sessions: [] })) as (userId: string) => Promise<unknown>,
}));

vi.mock('../../../../services/superhuman/semantic-intelligence/promise-keeper.js', () => ({
  recordReminderPromise: vi.fn(async () => {}),
}));
vi.mock('../../../../memory/profile-store.js', () => ({
  getProfileStore: async () => ({ getProfile: async () => null }),
}));
vi.mock('../../../../services/stores/conversation-history.js', () => ({
  getConversationHistoryService: () => ({ getHistory: (userId: string) => history.get(userId) }),
}));
vi.mock('../../../../memory/firestore-store.js', () => ({
  getFirestoreStore: () => ({
    getDatabase: async () => {
      const query = {
        where: () => query,
        limit: () => query,
        get: async () => ({
          empty: memories.contents.length === 0,
          docs: memories.contents.map((content) => ({ data: () => ({ content }) })),
        }),
      };
      return { collection: () => ({ doc: () => ({ collection: () => query }) }) };
    },
  }),
}));

import {
  forgetTopic,
  forgottenTopicsOrNull,
  type ForgetStore,
} from '../../../../memory/recall/forget.js';
import { essentialsToolDefinitions } from '../essentials-tools.js';
import { setRecentContextTopicsReader } from '../recent-context-forget.js';

type Exec = { execute: (args: Record<string, unknown>) => Promise<string> };

function recentContext(userId: string): Exec {
  const def = essentialsToolDefinitions.find((d) => d.id === 'recentContext')!;
  return def.create({ userId, agentId: 'ferni', agentDisplayName: 'Ferni' } as never) as never;
}

/** An in-memory forget store: forgetTopic records topics here, forgottenTopicsOrNull reads them. */
function topicStore(): ForgetStore {
  const topics: string[] = [];
  return {
    facts: async () => [],
    markForgotten: async () => {},
    addTopic: async (_userId, tokens) => {
      topics.push(tokens);
    },
    topics: async () => [...topics],
  };
}

const SESSIONS = {
  sessions: [
    {
      date: '2026-10-20T12:00:00Z',
      insights: ['we went over the divorce papers together'],
      topicsDiscussed: ['divorce papers'],
    },
    {
      date: '2026-10-21T12:00:00Z',
      insights: ['planning the spring garden'],
      topicsDiscussed: ['garden'],
    },
  ],
};

afterEach(() => {
  setRecentContextTopicsReader(undefined);
  memories.contents = [];
  history.get = async () => ({ sessions: [] });
});

describe('recentContext and forgotten topics', () => {
  it('the history path drops a forgotten topic, by topic and in the summary', async () => {
    const userId = 'u-2719-history';
    const store = topicStore();
    setRecentContextTopicsReader((u) => forgottenTopicsOrNull(u, store));
    history.get = async () => SESSIONS;
    const tool = recentContext(userId);

    // Before: the line comes back.
    expect(await tool.execute({ timeframe: 'all-time', topic: 'divorce' })).toContain(
      'divorce papers'
    );

    expect((await forgetTopic(userId, 'the divorce', store)).kind).toBe('forgotten');

    const byTopic = await tool.execute({ timeframe: 'all-time', topic: 'divorce' });
    expect(byTopic).not.toMatch(/divorce papers|went over/);
    const summary = await tool.execute({ timeframe: 'all-time' });
    expect(summary).toContain('garden');
    expect(summary).not.toContain('divorce papers');
  });

  it('the memories fallback (history unavailable) drops a forgotten topic', async () => {
    const userId = 'u-2719-fallback';
    const store = topicStore();
    setRecentContextTopicsReader((u) => forgottenTopicsOrNull(u, store));
    history.get = async () => {
      throw new Error('history down');
    };
    memories.contents = ['divorce papers are signed', 'divorce lawyer called back'];
    const tool = recentContext(userId);

    expect(await tool.execute({ timeframe: 'this-week', topic: 'divorce' })).toContain(
      'divorce papers are signed'
    );

    await forgetTopic(userId, 'the divorce', store);

    const said = await tool.execute({ timeframe: 'this-week', topic: 'divorce' });
    expect(said).not.toMatch(/papers are signed|lawyer called/);
    expect(said).toContain(`I don't have specific records about "divorce"`);
  });

  it('a topic forgotten in this process counts before the store has it', async () => {
    const userId = 'u-2719-in-process';
    // The stored topics read lags (empty), as on another call's process.
    setRecentContextTopicsReader(async () => []);
    history.get = async () => SESSIONS;
    await forgetTopic(userId, 'the divorce', topicStore());

    const said = await recentContext(userId).execute({ timeframe: 'all-time' });
    expect(said).toContain('garden');
    expect(said).not.toContain('divorce papers');
  });

  it.each([
    ['unreadable', async () => null],
    [
      'throwing',
      async () => {
        throw new Error('firestore down');
      },
    ],
  ])('fails closed when the stored topics are %s: nothing from memory', async (_case, reader) => {
    setRecentContextTopicsReader(reader as (u: string) => Promise<string[] | null>);
    history.get = async () => SESSIONS;
    memories.contents = ['divorce papers are signed'];

    const said = await recentContext('u-2719-closed').execute({ timeframe: 'all-time' });
    expect(said).toContain("I can't pull up our past conversations right now");
    expect(said).not.toMatch(/divorce|garden/);
  });
});

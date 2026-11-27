/**
 * The greeting's open thread and open questions (getProactiveContext) with FORGET_FRESH_READ: a
 * forget another process stored just before the call counts inside the shared 15 s cache, and an
 * unreadable store leaves the caller's words out (#2755). Off, the cached read as before. Only the
 * stored list and the session's threads are faked; fictional caller.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { firestoreForgetStore } from '../../../memory/recall/forget.js';
import {
  readTopics,
  resetForgetTopicsSource,
} from '../../../memory/recall/forget-topics-source.js';
import type { UserData } from '../../shared/types.js';
import { getProactiveContext } from '../greeting-proactive-context.js';

type SessionServices = Parameters<typeof getProactiveContext>[0];

const U = 'member-greeting-proactive';
const STARTER = 'How did the Denver interview go?';
const DENVER_Q = 'did the Denver office call back?';
const GARDEN_Q = 'did the tomatoes come up?';

function stored(topics: string[] | null): void {
  vi.spyOn(firestoreForgetStore, 'topics').mockImplementation(async () => topics);
}

const services = {
  userId: U,
  getOpenThreads: () => [{ questionsToAnswer: [DENVER_Q, GARDEN_Q] }],
  getThreadConversationStarter: () => STARTER,
  getProactiveInsights: async () => ({ highPriorityCount: 0 }),
  emotionalMemory: { getCheckInSuggestions: () => [], markFollowedUp: () => {} },
} as unknown as SessionServices;

const context = async () => getProactiveContext(services, {} as UserData, true);

describe('greeting open threads, FORGET_FRESH_READ (#2755)', () => {
  beforeEach(() => {
    resetForgetTopicsSource();
    vi.stubEnv('FORGET_EVERY_READER', 'on');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('on: a forget another process stored drops the thread starter and its question', async () => {
    vi.stubEnv('FORGET_FRESH_READ', 'on');
    stored([]);
    expect(await readTopics(U)).toEqual([]); // another reader warmed the shared cache
    stored(['the Denver job']); // written elsewhere: nothing in this process clears the cache
    const seen = await context();
    expect(seen.threadStarter).toBeUndefined();
    expect(seen.openQuestions).toEqual([GARDEN_Q]);
  });

  it('on: an unreadable store leaves the starter and every question out', async () => {
    vi.stubEnv('FORGET_FRESH_READ', 'on');
    stored([]);
    await readTopics(U);
    stored(null);
    const seen = await context();
    expect(seen.threadStarter).toBeUndefined();
    expect(seen.openQuestions).toEqual([]);
  });

  it('off: the shared cached list, as before', async () => {
    stored([]);
    await readTopics(U);
    stored(['the Denver job']);
    const seen = await context();
    expect(seen.threadStarter).toBe(STARTER);
    expect(seen.openQuestions).toEqual([DENVER_Q, GARDEN_Q]);
  });

  it('on, FORGET_EVERY_READER off: everything, and nothing is read', async () => {
    vi.stubEnv('FORGET_FRESH_READ', 'on');
    vi.stubEnv('FORGET_EVERY_READER', 'off');
    stored(['the Denver job']);
    const seen = await context();
    expect(seen.threadStarter).toBe(STARTER);
    expect(seen.openQuestions).toEqual([DENVER_Q, GARDEN_Q]);
    expect(firestoreForgetStore.topics).not.toHaveBeenCalled();
  });

  it('the insights fetch starts beside the forget read, not after it', async () => {
    vi.stubEnv('FORGET_FRESH_READ', 'on');
    let release!: (topics: string[]) => void;
    vi.spyOn(firestoreForgetStore, 'topics').mockImplementation(
      async () =>
        new Promise<string[]>((resolve) => {
          release = resolve;
        })
    );
    const insights = vi.fn(async () => ({ highPriorityCount: 0 }));
    const pending = getProactiveContext(
      { ...services, getProactiveInsights: insights } as unknown as SessionServices,
      {} as UserData,
      true
    );
    await vi.waitFor(() => expect(firestoreForgetStore.topics).toHaveBeenCalled());
    expect(insights).toHaveBeenCalledTimes(1); // while the forget read is still out
    release([]);
    expect((await pending).threadStarter).toBe(STARTER);
  });
});

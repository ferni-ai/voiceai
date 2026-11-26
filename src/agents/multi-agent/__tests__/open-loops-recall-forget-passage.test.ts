/**
 * The open-loops note through the real forget filter (#3995). A loop's context is the caller's
 * raw words, so a topic of several words leaves it out on any distinctive word; a topic
 * forgotten during the call (the real forgetTopic) leaves the note out from then on, as do two
 * loops that only together name one; and a topic that only matches the note's own fixed words
 * ("check in on these") doesn't silence it. Only the stored list is faked. The real check is the
 * shared fresh read (forgottenPassageWithin), so FORGET_EVERY_READER is on but where a test says.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OpenLoop } from '../../../services/superhuman/semantic-intelligence/open-loops.js';
import {
  firestoreForgetStore,
  forgetTopic,
  type ForgetStore,
} from '../../../memory/recall/forget.js';
import { resetForgetTopicsSource } from '../../../memory/recall/forget-topics-source.js';
import { createCallLoopsRecall } from '../open-loops-recall.js';

const NOW = new Date('2026-11-17T12:00:00Z');

function loop(id: string, content: string, context: string): OpenLoop {
  return {
    id,
    userId: 'u-fiction',
    type: 'intention',
    content,
    context,
    created: new Date(NOW.getTime() - 2 * 86_400_000),
    followUpAfter: NOW,
    followUpBefore: new Date(NOW.getTime() + 86_400_000),
    status: 'open',
    priority: 5,
    followUpCount: 0,
  };
}

function stored(topics: string[] | null): void {
  vi.spyOn(firestoreForgetStore, 'topics').mockImplementation(async () => topics);
}

async function loaded(userId: string, loops: OpenLoop[]) {
  const r = createCallLoopsRecall({
    userId,
    callId: `c-${userId}`,
    now: () => NOW,
    sources: {
      loops: async () => loops,
      promises: async () => ({ text: '', misses: [] }),
      markOffered: async () => undefined,
    },
  });
  await r.ready;
  return r;
}

const DENVER = loop('a', 'whether to take the offer', 'I got the offer from the Denver office');
const BROTHER = loop('b', 'text my brother tonight', 'his number is 435 555 0199');
const GARDEN = loop('c', 'plant the tomatoes this weekend', 'the garden is finally dry');

describe('open-loops note, real forget filter (#3995)', () => {
  beforeEach(() => {
    resetForgetTopicsSource();
    vi.stubEnv('FORGET_EVERY_READER', 'on');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('a topic of several words leaves out a loop whose context has one of them', async () => {
    stored(['brother phone number', 'Denver job offer']);
    const note = (await loaded('u-passage', [DENVER, BROTHER, GARDEN])).note() ?? '';
    expect(note).toContain('tomatoes');
    expect(note).not.toContain('435 555 0199');
    expect(note).not.toContain('Denver');
  });

  it('a topic forgotten during the call leaves the note out, and nothing is marked', async () => {
    stored([]);
    const marked = vi.fn(async () => undefined);
    const r = createCallLoopsRecall({
      userId: 'u-later',
      callId: 'c-later',
      now: () => NOW,
      sources: {
        loops: async () => [GARDEN],
        promises: async () => ({ text: '', misses: [] }),
        markOffered: marked,
      },
    });
    await r.ready;
    expect(r.note()).toContain('tomatoes');
    const store: ForgetStore = {
      facts: async () => [],
      markForgotten: async () => undefined,
      addTopic: async () => 1,
      topics: async () => [],
    };
    await forgetTopic('u-later', 'the tomatoes', store, NOW, {});
    expect(r.note()).toBeNull();
    r.raised();
    expect(marked).not.toHaveBeenCalled();
  });

  it("a topic matching only the note's own words doesn't silence it", async () => {
    stored(['the background check', 'all of these', 'following']);
    const note = (await loaded('u-header', [GARDEN])).note() ?? '';
    expect(note).toContain('Gently check in on these');
    expect(note).toContain('tomatoes');
  });

  it('two loops that only together name a topic leave the note out', async () => {
    stored(['Bob DUI']);
    const bob = loop('d', 'call Bob back', 'about the weekend');
    const hearing = loop('e', 'the DUI hearing', 'next month');
    expect((await loaded('u-pair', [bob, GARDEN])).note()).toContain('Bob');
    expect((await loaded('u-pair2', [bob, hearing, GARDEN])).note()).toBeNull();
  });

  it('an unreadable stored list gives no note', async () => {
    stored(null);
    expect((await loaded('u-unread', [GARDEN])).note()).toBeNull();
  });

  it('an unreadable list gives no note even after a good read: never the old list', async () => {
    vi.useFakeTimers({ now: 5_000_000 });
    try {
      stored([]);
      expect((await loaded('u-stale', [GARDEN])).note()).toContain('tomatoes');
      vi.setSystemTime(5_000_000 + 60_000); // the 15 s cache is stale
      stored(null);
      const r = createCallLoopsRecall({
        userId: 'u-stale',
        callId: 'c-u-stale-2',
        now: () => NOW,
        sources: {
          loops: async () => [GARDEN],
          promises: async () => ({ text: '', misses: [] }),
          markOffered: async () => undefined,
        },
      });
      await r.ready;
      expect(r.note()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a forget another process stored shows at the next call, inside the 15 s cache', async () => {
    stored([]);
    expect((await loaded('u-elsewhere', [GARDEN])).note()).toContain('tomatoes');
    stored(['the tomatoes']); // written elsewhere: nothing in this process clears the cache
    const r = createCallLoopsRecall({
      userId: 'u-elsewhere',
      callId: 'c-u-elsewhere-2',
      now: () => NOW,
      sources: {
        loops: async () => [GARDEN],
        promises: async () => ({ text: '', misses: [] }),
        markOffered: async () => undefined,
      },
    });
    await r.ready;
    expect(r.note()).toBeNull();
  });

  it('FORGET_EVERY_READER off: no note (no forget check, so nothing is said)', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'off');
    stored([]);
    expect((await loaded('u-flag-off', [GARDEN])).note()).toBeNull();
  });
});

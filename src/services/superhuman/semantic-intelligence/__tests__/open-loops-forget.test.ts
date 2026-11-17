/**
 * Open loops never show a topic the caller asked Ferni to forget (#3995). Every reader goes
 * through the store's three getters (the web panels, Story So Far, the semantic context and
 * the call's note), so these run the real getters, the real Story So Far read and the real
 * forget filter over stored loop shapes. Only Firestore and the forgotten list are faked.
 * Names and numbers are fictional.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  firestoreForgetStore,
  forgetTopic,
  type ForgetStore,
} from '../../../../memory/recall/forget.js';

type Doc = Record<string, unknown>;
const stored: Doc[] = [];

vi.mock('../../firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collection: () => ({
      doc: () => ({
        collection: () => {
          const query = {
            where: () => query,
            orderBy: () => query,
            limit: () => query,
            get: async () => ({ docs: stored.map((d) => ({ data: () => d })) }),
            doc: () => ({ set: async () => undefined, update: async () => undefined }),
          };
          return query;
        },
      }),
    }),
  }),
  cleanForFirestore: <T>(v: T) => v,
}));
vi.mock('../../../../api/verified-subject.js', () => ({
  requireVerifiedSubject: async () => 'u-fiction',
}));
vi.mock('../../../data-layer/hooks/coaching-hooks.js', () => ({
  onCoachingInsightChange: vi.fn(),
}));

const loops = await import('../open-loops.js');
const { fetchOpenLoops } = await import('../../../../api/your-story-sections.js');
const { handleSemanticIntelligenceRoutes } =
  await import('../../../../servers/api/routes/semantic-intelligence.js');

const DAY = 86_400_000;
const ts = (ms: number) => ({ toDate: () => new Date(ms) });

/** A stored loop, due for a follow-up now. */
function loop(id: string, content: string, context: string, description?: string): Doc {
  const now = Date.now();
  return {
    id,
    userId: 'u-fiction',
    type: 'intention',
    content,
    context,
    ...(description ? { description } : {}),
    status: 'open',
    priority: 5,
    followUpCount: 0,
    created: ts(now - 2 * DAY),
    followUpAfter: ts(now - DAY),
    followUpBefore: ts(now + 5 * DAY),
  };
}

const DENVER = loop('a', 'whether to take the offer', 'I got the offer from the Denver office');
const GARDEN = loop('c', 'plant the tomatoes this weekend', 'the garden is finally dry');

const forgotten = (topics: string[] | null) =>
  vi.spyOn(firestoreForgetStore, 'topics').mockImplementation(async () => topics);
const ids = (xs: Array<{ id: string }>) => xs.map((x) => x.id);

beforeEach(() => {
  stored.length = 0;
  stored.push(DENVER, GARDEN);
  loops.clearLoopCache();
});
afterEach(() => vi.restoreAllMocks());

describe('the open-loop getters leave forgotten topics out', () => {
  it('nothing forgotten: every loop is read', async () => {
    forgotten([]);
    expect(ids(await loops.getAllOpenLoops('u-fiction'))).toEqual(['a', 'c']);
  });

  it("a topic named only in the caller's words (context), on one distinctive word", async () => {
    forgotten(['Denver job']);
    expect(ids(await loops.getAllOpenLoops('u-fiction'))).toEqual(['c']);
    expect(ids(await loops.getLoopsReadyForFollowUp('u-fiction'))).toEqual(['c']);
    expect(ids(await loops.getLoopsByType('u-fiction', 'intention'))).toEqual(['c']);
  });

  it('a topic named only in the description', async () => {
    stored.push(loop('d', 'see how it went', 'we talked', 'Asking how the Kessler audit went'));
    forgotten(['Kessler audit']);
    expect(ids(await loops.getAllOpenLoops('u-fiction'))).toEqual(['a', 'c']);
  });

  it('a forgotten number in another format', async () => {
    stored.push(loop('b', 'text my brother tonight', 'his number is 435.555.0199'));
    forgotten(['435-555-0199']);
    expect(ids(await loops.getAllOpenLoops('u-fiction'))).toEqual(['a', 'c']);
  });

  // The verifier of #4048: a loop's side fields can name what its words don't ("call him").
  it.each([
    ['relatedPerson', { relatedPerson: 'Kessler' }],
    ['relatedTopic', { relatedTopic: 'the Kessler audit' }],
  ])('a topic named only in %s', async (_l, extra) => {
    stored.push({ ...loop('k', 'call him tomorrow', 'I will call him tomorrow'), ...extra });
    forgotten(['Kessler']);
    expect(ids(await loops.getAllOpenLoops('u-fiction'))).toEqual(['a', 'c']);
  });

  it('a topic forgotten during the call counts from then on', async () => {
    forgotten([]);
    expect(ids(await loops.getAllOpenLoops('u-later'))).toEqual(['a', 'c']);
    const store: ForgetStore = {
      facts: async () => [],
      markForgotten: async () => undefined,
      addTopic: async () => 1,
      topics: async () => [],
    };
    await forgetTopic('u-later', 'the tomatoes', store, new Date(), {});
    expect(ids(await loops.getAllOpenLoops('u-later'))).toEqual(['a']);
  });

  it('a list that cannot be read shows nothing (fails closed)', async () => {
    vi.spyOn(firestoreForgetStore, 'topics').mockRejectedValue(new Error('unavailable'));
    expect(await loops.getAllOpenLoops('u-fiction')).toEqual([]);
    expect(await loops.getLoopsReadyForFollowUp('u-fiction')).toEqual([]);
  });
});

describe('every reader through the getters', () => {
  it('the semantic context (web /context and the prompt) leaves the topic out', async () => {
    forgotten(['Denver job']);
    const text = await loops.formatOpenLoopsContext('u-fiction');
    expect(text).toContain('plant the tomatoes');
    expect(text).not.toMatch(/Denver|the offer/);
  });

  it('the /open-loops route (raw loop objects) leaves out a person named only in a side field', async () => {
    stored.push({ ...loop('k', 'call him tomorrow', 'I will'), relatedPerson: 'Kessler' });
    forgotten(['Kessler']);
    let body = '';
    const res = {
      writeHead: () => res,
      setHeader: () => undefined,
      end: (b: string) => void (body = b),
    } as unknown as import('http').ServerResponse;
    const req = {
      method: 'GET',
      url: '/api/semantic-intelligence/open-loops?userId=u-fiction',
      headers: {},
    } as unknown as import('http').IncomingMessage;
    expect(
      await handleSemanticIntelligenceRoutes(req, res, '/api/semantic-intelligence/open-loops')
    ).toBe(true);
    expect(JSON.parse(body).count).toBe(2);
    expect(body).not.toContain('Kessler');
  });

  it('Story So Far leaves the topic out', async () => {
    forgotten(['Denver job']);
    const read = await fetchOpenLoops('u-fiction');
    expect(read?.items.map((i) => i.id)).toEqual(['c']);
    expect(JSON.stringify(read)).not.toMatch(/Denver|the offer/);
  });
});

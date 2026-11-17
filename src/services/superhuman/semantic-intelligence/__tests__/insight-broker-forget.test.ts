/**
 * Proactive insights never surface a topic the caller asked Ferni to forget (#3995). An open
 * loop copies the caller's words into an insight ("You mentioned the Denver offer"), and every
 * reader (the sanctuary and semantic-intelligence routes, the session's prompt, the semantic
 * context) reads through getInsightsToSurface. These run the real broker, the real
 * /insights route and the real forget filter over stored insight shapes; only Firestore, the
 * caller check and the forgotten list are faked. Names are fictional.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';

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
  requireVerifiedSubject: async () => 'u-route',
}));

const broker = await import('../insight-broker.js');
const { handleSemanticIntelligenceRoutes } =
  await import('../../../../servers/api/routes/semantic-intelligence.js');

const ts = (ms: number) => ({ toDate: () => new Date(ms) });

/** A stored insight that surfaces at session start. */
function insight(id: string, text: string, context: string, extra: Doc = {}): Doc {
  return {
    id,
    userId: 'u-fiction',
    source: 'open_loop',
    priority: 'medium',
    insight: text,
    context,
    surfaceWhen: [{ type: 'session_start' }],
    created: ts(Date.now() - 86_400_000),
    surfaced: false,
    dismissed: false,
    confidence: 0.8,
    ...extra,
  };
}

const DENVER = insight('a', 'You mentioned the offer', 'I got the offer from the Denver office');
const GARDEN = insight('c', 'Ask how the planting went', 'plant the tomatoes this weekend');

const forgotten = (topics: string[] | null) =>
  vi.spyOn(firestoreForgetStore, 'topics').mockImplementation(async () => topics);

let n = 0;
/** A fresh caller each read: the broker surfaces an insight once per session per caller. */
async function surfaced(): Promise<string[]> {
  const userId = `u-${++n}`;
  const got = await broker.getInsightsToSurface(userId, { isSessionStart: true });
  return got.map((i) => i.id).sort();
}

beforeEach(() => {
  stored.length = 0;
  stored.push(DENVER, GARDEN);
  broker.clearInsightCache();
});
afterEach(() => vi.restoreAllMocks());

describe('getInsightsToSurface leaves forgotten topics out', () => {
  it('nothing forgotten: every insight surfaces', async () => {
    forgotten([]);
    expect(await surfaced()).toEqual(['a', 'c']);
  });

  it("a topic named only in the context (the caller's words), on one distinctive word", async () => {
    forgotten(['Denver job']);
    expect(await surfaced()).toEqual(['c']);
  });

  it('a topic named only in the insight text', async () => {
    stored.push(insight('k', 'Ask how the Kessler audit went', 'we talked'));
    forgotten(['Kessler audit']);
    expect(await surfaced()).toEqual(['a', 'c']);
  });

  it.each([
    ['relatedEntities', { relatedEntities: ['Kessler'] }],
    [
      'a trigger value',
      { surfaceWhen: [{ type: 'session_start' }, { type: 'person', value: 'Kessler' }] },
    ],
    ['a field outside the type (an old document)', { personName: 'Kessler' }],
  ])('a topic named only in %s', async (_l, extra) => {
    stored.push(insight('k', 'Check in about tomorrow', 'call him tomorrow', extra));
    forgotten(['Kessler']);
    expect(await surfaced()).toEqual(['a', 'c']);
  });

  it('its own labels are not caller text: a topic "medium session" hides nothing', async () => {
    forgotten(['medium session']);
    expect(await surfaced()).toEqual(['a', 'c']);
  });

  it('a topic forgotten during the call counts from then on', async () => {
    forgotten([]);
    expect(await surfaced()).toEqual(['a', 'c']);
    const store: ForgetStore = {
      facts: async () => [],
      markForgotten: async () => undefined,
      addTopic: async () => 1,
      topics: async () => [],
    };
    const userId = `u-${++n}`;
    await forgetTopic(userId, 'the tomatoes', store, new Date(), {});
    const got = await broker.getInsightsToSurface(userId, { isSessionStart: true });
    expect(got.map((i) => i.id)).toEqual(['a']);
  });

  it('a list that cannot be read surfaces nothing (fails closed)', async () => {
    vi.spyOn(firestoreForgetStore, 'topics').mockRejectedValue(new Error('unavailable'));
    expect(await surfaced()).toEqual([]);
  });

  it('a forgotten insight is not marked surfaced: it stays held, not used up', async () => {
    forgotten(['Denver job']);
    const userId = `u-${++n}`;
    await broker.getInsightsToSurface(userId, { isSessionStart: true });
    forgotten([]);
    const later = await broker.getInsightsToSurface(userId, { isSessionStart: true });
    expect(later.map((i) => i.id)).toEqual(['a']);
  });
});

describe('the /insights route', () => {
  it('returns no forgotten insight in its JSON', async () => {
    stored.push(
      insight('k', 'Check in about tomorrow', 'call him', { relatedEntities: ['Kessler'] })
    );
    forgotten(['Kessler']);
    let body = '';
    const res = {
      writeHead: () => res,
      setHeader: () => undefined,
      end: (b: string) => void (body = b),
    } as unknown as ServerResponse;
    const req = {
      method: 'GET',
      url: '/api/semantic-intelligence/insights?userId=u-route&sessionStart=true',
      headers: {},
    } as unknown as IncomingMessage;
    expect(
      await handleSemanticIntelligenceRoutes(req, res, '/api/semantic-intelligence/insights')
    ).toBe(true);
    expect(JSON.parse(body).count).toBe(2);
    expect(body).not.toContain('Kessler');
  });
});

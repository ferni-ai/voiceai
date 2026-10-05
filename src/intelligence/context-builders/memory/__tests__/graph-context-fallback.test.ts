/**
 * Graph context builder — Firestore fallback when Spanner is unavailable.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../memory/spanner-graph/index.js', () => ({
  isSpannerReady: vi.fn(() => false),
  getEntityContext: vi.fn(),
  getRelationshipContext: vi.fn(),
  searchFactsAboutEntity: vi.fn(),
}));

vi.mock('../../../../memory/entity-store/entity-resolver.js', () => ({
  whatDoWeKnowAbout: vi.fn(async (_userId: string, query: string) => {
    if (query.toLowerCase() === 'mike') {
      // Slower than Sarah, so lookups for several people finish out of order.
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
      return {
        entity: { id: 'e2', canonicalName: 'Mike', type: 'person', attributes: { _type: 'person' } },
        mentions: [],
        facts: [{ entityName: 'Mike', key: 'work', value: 'Stripe', confidence: 0.9 }],
        relationships: [],
        relatedEntities: [],
      };
    }
    if (query.toLowerCase() === 'sarah') {
      return {
        entity: { id: 'e1', canonicalName: 'Sarah', type: 'person', attributes: { _type: 'person' } },
        mentions: [],
        facts: [{ entityName: 'Sarah', key: 'work', value: 'Google', confidence: 0.9 }],
        relationships: [],
        relatedEntities: [],
      };
    }
    return {
      entity: null,
      mentions: [],
      facts: [],
      relationships: [],
      relatedEntities: [],
    };
  }),
}));

vi.mock('../../../../memory/firestore-vector-store/index.js', () => ({
  getFirestoreVectorStore: vi.fn(() => ({
    initialize: vi.fn(async () => undefined),
    search: vi.fn(async () => []),
  })),
}));

vi.mock('../../../entity-detector.js', () => ({
  detectEntities: vi.fn(() => []),
  extractEntityNames: vi.fn(() => []),
}));

vi.mock('../../../pronoun-context-store.js', () => ({
  getSessionPronounContext: vi.fn(() => undefined),
  updateSessionPronounContext: vi.fn(),
}));

vi.mock('../../index.js', () => ({
  createStandardInjection: (type: string, content: string, meta: unknown) => ({
    type,
    content,
    meta,
  }),
  registerContextBuilder: vi.fn(),
}));

import { detectEntities } from '../../../entity-detector.js';
import { buildGraphContext } from '../graph-context.js';

describe('buildGraphContext Firestore fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('injects non-empty entity context without Spanner', async () => {
    const injections = await buildGraphContext({
      userText: 'What do I know about Sarah?',
      services: { userId: 'user-1', sessionId: 'sess-1' },
    } as never);

    expect(injections.length).toBeGreaterThan(0);
    expect(injections[0].content).toMatch(/Sarah/i);
    expect(injections[0].content).toMatch(/Google|work/i);
  });

  it("keeps each person's facts with that person when lookups finish out of order", async () => {
    vi.mocked(detectEntities).mockReturnValueOnce([
      { name: 'Mike', type: 'person', confidence: 0.9 },
      { name: 'Sarah', type: 'person', confidence: 0.9 },
    ] as never);

    const injections = await buildGraphContext({
      userText: 'Lunch with Mike today, then Sarah called.',
      services: { userId: 'user-1', sessionId: 'sess-1' },
    } as never);

    // The createStandardInjection mock above returns { type, content, meta }.
    const mocked = injections as unknown as Array<{ type: string; content: string }>;
    const entity = mocked.filter((i) => i.type === 'entity_context').map((i) => i.content);
    expect(entity).toHaveLength(2);
    expect(entity[0]).toMatch(/Mike/);
    expect(entity[0]).toMatch(/Stripe/);
    expect(entity[0]).not.toMatch(/Google/);
    expect(entity[1]).toMatch(/Sarah/);
    expect(entity[1]).toMatch(/Google/);
  });
});

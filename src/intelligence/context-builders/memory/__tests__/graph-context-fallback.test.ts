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
});

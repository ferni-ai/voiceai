/**
 * World-model context builder injects a non-empty section when entity_store
 * has a person plus a relation.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../memory/entity-store/index.js', () => ({
  getAllEntities: vi.fn(async () => [
    {
      id: 'e1',
      canonicalName: 'Sarah',
      type: 'person',
      relationship: 'sister',
      specificRelation: 'sister',
      attributes: { _type: 'person', relationship: 'sister' },
    },
  ]),
  getRelationshipsForEntity: vi.fn(async () => [
    {
      id: 'r1',
      fromEntity: 'user',
      toEntity: 'e1',
      type: 'family',
      label: 'sister',
    },
  ]),
}));

vi.mock('../../../memory/human-signal-persistence.js', () => ({
  getPersistedHumanSignals: vi.fn(async () => ({ avoidances: [] })),
}));

vi.mock('../../unified-user-model.js', () => ({
  loadUserModel: vi.fn(async () => null),
}));

vi.mock('../../../memory/dynamic/stm-buffer.js', () => ({
  getRecentTopics: vi.fn(() => []),
}));

vi.mock('../../context-builders/index.js', () => ({
  createStandardInjection: (type: string, content: string, meta: unknown) => ({
    type,
    content,
    meta,
  }),
  registerContextBuilder: vi.fn(),
}));

import { getAllEntities } from '../../../memory/entity-store/index.js';
import { buildWorldModelContext } from '../builder.js';
import { resetWorldModelCacheForTests } from '../cache.js';

describe('buildWorldModelContext', () => {
  beforeEach(() => {
    resetWorldModelCacheForTests();
    vi.clearAllMocks();
  });

  it('includes a non-empty World Model section when entity_store has a person and relation', async () => {
    const injections = await buildWorldModelContext({
      userText: 'How is Sarah?',
      services: { userId: 'user-1', sessionId: 'sess-1' },
      analysis: { emotion: { primary: 'neutral', intensity: 0.2 } },
    } as never);

    expect(getAllEntities).toHaveBeenCalledWith('user-1', expect.any(Object));
    expect(injections.length).toBeGreaterThan(0);
    const mocked = injections as unknown as Array<{ type: string; content: string }>;
    expect(mocked[0].type).toBe('world-model');
    expect(mocked[0].content).toMatch(/World Model/);
    expect(mocked[0].content).toMatch(/Sarah/);
    expect(mocked[0].content).toMatch(/sister/);
    expect(mocked[0].content).toMatch(/Key relationships|Known entities/);
  });
});

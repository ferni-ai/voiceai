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
import { registerContextBuilder } from '../../context-builders/index.js';
import { buildWorldModelContext, registerWorldModelBuilder } from '../builder.js';
import { resetWorldModelCacheForTests } from '../cache.js';

// Taken before any beforeEach clears the mocks: what importing builder.ts did.
const registeredAtImport = vi.mocked(registerContextBuilder).mock.calls.length;
const ON = { WORLD_MODEL_SNAPSHOT: 'on' };
const turn = {
  userText: 'How is Sarah?',
  services: { userId: 'user-1', sessionId: 'sess-1' },
  analysis: { emotion: { primary: 'neutral', intensity: 0.2 } },
} as never;

describe('buildWorldModelContext', () => {
  beforeEach(() => {
    resetWorldModelCacheForTests();
    vi.clearAllMocks();
  });

  it('includes a non-empty World Model section when entity_store has a person and relation', async () => {
    const injections = await buildWorldModelContext(turn, { env: ON });

    expect(getAllEntities).toHaveBeenCalledWith('user-1', expect.any(Object));
    expect(injections.length).toBeGreaterThan(0);
    const mocked = injections as unknown as Array<{ type: string; content: string }>;
    expect(mocked[0].type).toBe('world-model');
    expect(mocked[0].content).toMatch(/World Model/);
    expect(mocked[0].content).toMatch(/Sarah/);
    expect(mocked[0].content).toMatch(/sister/);
    expect(mocked[0].content).toMatch(/Key relationships|Known entities/);
  });

  it('builds nothing and reads no store with WORLD_MODEL_SNAPSHOT unset or off', async () => {
    for (const env of [{}, { WORLD_MODEL_SNAPSHOT: 'off' }]) {
      expect(await buildWorldModelContext(turn, { env })).toEqual([]);
    }
    expect(getAllEntities).not.toHaveBeenCalled();
    // Same turn, flag on: the section is there.
    const on = (await buildWorldModelContext(turn, { env: ON })) as unknown as Array<{
      content: string;
    }>;
    expect(on[0]?.content).toMatch(/World Model/);
  });

  it('registers the live builder only with WORLD_MODEL_SNAPSHOT=on', () => {
    expect(process.env.WORLD_MODEL_SNAPSHOT).toBeUndefined();
    expect(registeredAtImport).toBe(0);
    expect(registerWorldModelBuilder({})).toBe(false);
    expect(registerContextBuilder).not.toHaveBeenCalled();
    expect(registerWorldModelBuilder(ON)).toBe(true);
    expect(registerContextBuilder).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'world-model' })
    );
  });
});

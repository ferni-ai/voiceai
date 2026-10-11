/**
 * Lifecycle maintenance must not archive memories the Protection Engine
 * protected. memory-decay used to look them up with a bare require() of an
 * export that never existed, so it threw in every environment (ReferenceError
 * in production ESM) and was swallowed; protected memories decayed
 * and were archived like any other.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const DAY = 24 * 60 * 60 * 1000;

interface FakeState {
  memories: Array<Record<string, unknown>>;
  protections: Array<{ id: string; data: Record<string, unknown> }>;
  protectionReadFails: boolean;
  updates: Array<{ id: string; data: Record<string, unknown> }>;
}

const state: FakeState = {
  memories: [],
  protections: [],
  protectionReadFails: false,
  updates: [],
};

function fakeDb() {
  const memoriesQuery = {
    where: () => memoriesQuery,
    orderBy: () => memoriesQuery,
    limit: () => memoriesQuery,
    get: async () => ({ docs: state.memories.map((m) => ({ id: m.id, data: () => m })) }),
  };
  const userDoc = {
    collection: (name: string) => {
      if (name === 'memories') {
        return {
          ...memoriesQuery,
          doc: (id: string) => ({
            update: async (data: Record<string, unknown>) => {
              state.updates.push({ id, data });
            },
          }),
        };
      }
      if (name === 'memory_protection') {
        return {
          get: async () => {
            if (state.protectionReadFails) throw new Error('firestore unavailable');
            return { docs: state.protections.map((p) => ({ id: p.id, data: () => p.data })) };
          },
        };
      }
      throw new Error(`unexpected collection ${name}`);
    },
  };
  return { collection: () => ({ doc: () => userDoc }) };
}

vi.mock('../../../utils/firestore-utils.js', () => ({
  getFirestoreDb: () => fakeDb(),
  cleanForFirestore: (obj: unknown) => obj,
}));
vi.mock('../../firestore-vector-store/index.js', () => ({
  getFirestoreVectorStore: () => ({ addDocument: vi.fn(), search: vi.fn(async () => []) }),
}));
vi.mock('../../memory-consolidator.js', () => ({
  getMemoryConsolidator: () => ({
    runConsolidationPass: async (m: unknown[]) => ({
      memoriesProcessed: m.length,
      groupsFound: 0,
      consolidated: [],
    }),
  }),
}));
vi.mock('../../memory-graph.js', () => ({
  getMemoryGraph: () => ({ detectLinks: async () => [] }),
}));

/** A memory weak enough to be archived: low importance, two years old. */
function weakMemory(id: string): Record<string, unknown> {
  return {
    id,
    userId: 'user-1',
    content: `old detail ${id}`,
    type: 'topic',
    strength: 0.1,
    emotionalWeight: 0.1,
    archived: false,
    createdAt: new Date(Date.now() - 730 * DAY),
    updatedAt: new Date(Date.now() - 730 * DAY),
  };
}

function archivedIds(): string[] {
  return state.updates.filter((u) => u.data.archived === true).map((u) => u.id);
}

describe('runLifecycleMaintenance honours Protection Engine protections', () => {
  beforeEach(async () => {
    state.memories = [weakMemory('mem_plain'), weakMemory('mem_protected')];
    state.protections = [];
    state.protectionReadFails = false;
    state.updates = [];
    const { resetProtectionEngine } = await import('../../operations/protection-engine.js');
    const { resetMemoryDecayManager } = await import('../../memory-decay.js');
    resetProtectionEngine();
    resetMemoryDecayManager();
  });

  it('archives a weak memory nobody protected (baseline)', async () => {
    const { runLifecycleMaintenance } = await import('../lifecycle-integration.js');
    const result = await runLifecycleMaintenance('user-1');

    expect(archivedIds().sort()).toEqual(['mem_plain', 'mem_protected']);
    expect(result.decay.memoriesArchived).toBe(2);
  });

  it('does not archive a weak memory the Protection Engine protected', async () => {
    state.protections = [
      {
        id: 'mem_protected',
        data: {
          protectionLevel: 'user_marked',
          protectedAt: new Date().toISOString(),
          reason: 'User explicitly requested to remember',
          expiresAt: null,
        },
      },
    ];
    const { runLifecycleMaintenance } = await import('../lifecycle-integration.js');
    const result = await runLifecycleMaintenance('user-1');

    expect(archivedIds()).toEqual(['mem_plain']);
    expect(result.decay.memoriesArchived).toBe(1);
  });

  it('still archives a memory whose protection has expired', async () => {
    state.protections = [
      {
        id: 'mem_protected',
        data: {
          protectionLevel: 'commitment',
          protectedAt: new Date(Date.now() - 90 * DAY).toISOString(),
          reason: 'Protected type: commitment',
          expiresAt: new Date(Date.now() - DAY).toISOString(),
        },
      },
    ];
    const { runLifecycleMaintenance } = await import('../lifecycle-integration.js');
    await runLifecycleMaintenance('user-1');

    expect(archivedIds().sort()).toEqual(['mem_plain', 'mem_protected']);
  });

  it('archives nothing when the protections cannot be read', async () => {
    state.protectionReadFails = true;
    const { runLifecycleMaintenance } = await import('../lifecycle-integration.js');
    const result = await runLifecycleMaintenance('user-1');

    expect(archivedIds()).toEqual([]);
    expect(result.decay.memoriesArchived).toBe(0);
  });
});

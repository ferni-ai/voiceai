/**
 * FORGET_EVERY_READER: entity proactive surfacing ("remember when...") reached
 * the prompt with no forget check. A forgotten entity's opportunity is left
 * out with the flag on and still offered with it off.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@google-cloud/firestore', () => ({
  Firestore: class {
    collection() {
      return { doc: () => ({ get: async () => ({ exists: false }) }) };
    }
  },
  FieldValue: { delete: () => undefined },
}));
vi.mock('../store.js', () => ({ getEntityStore: () => ({ initialize: async () => undefined }) }));
vi.mock('../proactive-surfacing.js', () => ({
  getProactiveSurfacingEngine: () => ({
    analyze: async () => [
      {
        type: 'entity_context',
        timing: 'immediate',
        naturalPhrasing: 'How is he doing?',
        entity: { id: 'e1', canonicalName: 'Biscuit', aliases: [] },
      },
      {
        type: 'entity_context',
        timing: 'immediate',
        naturalPhrasing: 'How did the race go?',
        entity: { id: 'e2', canonicalName: 'Boston marathon', aliases: [] },
      },
    ],
  }),
}));
vi.mock('../../recall/forget.js', async (original) => ({
  ...(await original<typeof import('../../recall/forget.js')>()),
  forgottenTopicsOrNull: async () => ['Biscuit'],
}));

const USER = 'member-surfacing-forget';

afterEach(() => {
  delete process.env.FORGET_EVERY_READER;
});

describe.each([true, false])('checkProactiveSurfacing, FORGET_EVERY_READER %s', (on) => {
  it(on ? 'leaves out a forgotten entity' : 'offers every entity', async () => {
    if (on) process.env.FORGET_EVERY_READER = 'on';
    const { checkProactiveSurfacing, initializeEntityStore, isEntityStoreReady } =
      await import('../integration.js');
    await initializeEntityStore();
    expect(isEntityStoreReady()).toBe(true);
    const found = await checkProactiveSurfacing(USER, 'what a week', {
      sessionId: 's1',
      personaId: 'ferni',
      turnNumber: 3,
    } as never);
    const names = found.map((o) => o.entity.canonicalName);
    expect(names).toEqual(on ? ['Boston marathon'] : ['Biscuit', 'Boston marathon']);
  });
});

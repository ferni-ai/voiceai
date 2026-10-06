/**
 * "Proactive surfacing check failed: EntityStore not initialized" on 112 of
 * 112 dev turns: the integration layer checked Firestore and set its own
 * flag, but never initialized the EntityStore that surfacing reads, so the
 * "remember when..." feature never ran.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@google-cloud/firestore', () => ({
  Firestore: class {
    collection() {
      return { doc: () => ({ get: async () => ({ exists: false }) }) };
    }
  },
}));

describe('initializeEntityStore', () => {
  it('initializes the EntityStore that proactive surfacing uses', async () => {
    const { initializeEntityStore, isEntityStoreReady } = await import('../integration.js');
    const { getEntityStore } = await import('../store.js');
    await initializeEntityStore();
    expect(isEntityStoreReady()).toBe(true);
    expect((getEntityStore() as unknown as { initialized: boolean }).initialized).toBe(true);
  });
});

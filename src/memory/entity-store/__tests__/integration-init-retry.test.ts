/**
 * The module starts initializing as soon as it loads. If that first attempt
 * failed (Firestore not reachable yet), it recorded the error and never cleared
 * it, so a later attempt that succeeded still left isEntityStoreReady() false:
 * every capture threw "Entity store not ready" for the life of the process.
 */
import { describe, expect, it, vi } from 'vitest';

const firestore = vi.hoisted(() => ({ reachable: false, healthChecks: 0 }));

vi.mock('@google-cloud/firestore', () => ({
  Firestore: class {
    collection() {
      return {
        doc: () => ({
          get: async () => {
            firestore.healthChecks += 1;
            if (!firestore.reachable) throw new Error('UNAVAILABLE: no connection');
            return { exists: false };
          },
        }),
      };
    }
  },
}));

describe('initializeEntityStore after a failed first attempt', () => {
  it('is ready once a later attempt succeeds', async () => {
    const { initializeEntityStore, isEntityStoreReady } = await import('../integration.js');

    // The attempt made on load fails.
    await vi.waitFor(() => expect(firestore.healthChecks).toBeGreaterThanOrEqual(1));
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(isEntityStoreReady()).toBe(false);

    // Firestore comes up and the next attempt succeeds.
    firestore.reachable = true;
    await initializeEntityStore();
    expect(isEntityStoreReady()).toBe(true);
  });
});

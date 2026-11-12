/**
 * The module-load init attempt and a later retry (knowledge-capture calls
 * initializeEntityStore() when the store isn't ready) can be in flight at the
 * same time. If one succeeds and the other then fails, the failure used to
 * record initializationError after `initialized` was already true. Every
 * later init returned early on `initialized`, so isEntityStoreReady() stayed
 * false for the life of the process and the legacy collections were used.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Deferred {
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
}

const { pending } = vi.hoisted(() => ({ pending: [] as Deferred[] }));

vi.mock('@google-cloud/firestore', () => ({
  Firestore: class {
    collection() {
      return {
        doc: () => ({
          get: () =>
            new Promise((resolve, reject) => {
              pending.push({ resolve, reject });
            }),
        }),
      };
    }
  },
}));

const settle = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

async function loadWithAttemptInFlight() {
  const mod = await import('../integration.js');
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  return mod;
}

describe('initializeEntityStore with two attempts in flight', () => {
  beforeEach(() => {
    vi.resetModules();
    pending.length = 0;
  });

  it('stays ready when the load-time attempt fails after a retry succeeded', async () => {
    const { initializeEntityStore, isEntityStoreReady } = await loadWithAttemptInFlight();
    const retry = initializeEntityStore();
    await vi.waitFor(() => expect(pending).toHaveLength(2));

    pending[1].resolve({ exists: false });
    await retry;
    expect(isEntityStoreReady()).toBe(true);

    pending[0].reject(new Error('firestore unavailable'));
    await settle();
    expect(isEntityStoreReady()).toBe(true);
  });

  it('stays ready when a retry fails after the load-time attempt succeeded', async () => {
    const { initializeEntityStore, isEntityStoreReady } = await loadWithAttemptInFlight();
    const retry = initializeEntityStore();
    await vi.waitFor(() => expect(pending).toHaveLength(2));

    pending[0].resolve({ exists: false });
    await settle();
    expect(isEntityStoreReady()).toBe(true);

    pending[1].reject(new Error('firestore unavailable'));
    await retry;
    expect(isEntityStoreReady()).toBe(true);
  });
});

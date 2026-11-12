/**
 * The module-load init attempt and a later retry (knowledge-capture calls
 * initializeEntityStore() when the store isn't ready) can be in flight at the
 * same time. If one succeeds and the other then fails, the failure used to
 * record initializationError after `initialized` was already true. Every
 * later init returned early on `initialized`, so isEntityStoreReady() stayed
 * false for the life of the process and the legacy collections were used.
 *
 * Each attempt parks on two calls the test settles by hand: the Firestore
 * health read and the EntityStore initialize. The test waits for those calls
 * to be reached, never for time to pass, so a cold module transform can't
 * reorder anything.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Deferred {
  resolve: (v?: unknown) => void;
  reject: (e: unknown) => void;
}

const parked = vi.hoisted(() => {
  const reads: Deferred[] = [];
  const storeInits: Deferred[] = [];
  let wake: Array<() => void> = [];
  return {
    reads,
    storeInits,
    /** A call the test settles by hand. */
    hold(list: Deferred[]): Promise<unknown> {
      return new Promise((resolve, reject) => {
        list.push({ resolve, reject });
        const woken = wake;
        wake = [];
        for (const w of woken) w();
      });
    },
    /** Resolves once `n` calls are parked on `list`. */
    reached(list: Deferred[], n: number): Promise<void> {
      return new Promise<void>((resolve) => {
        const check = () => {
          if (list.length >= n) resolve();
          else wake.push(check);
        };
        check();
      });
    },
    reset(): void {
      reads.length = 0;
      storeInits.length = 0;
      wake = [];
    },
  };
});

vi.mock('@google-cloud/firestore', () => ({
  Firestore: class {
    collection() {
      return { doc: () => ({ get: () => parked.hold(parked.reads) }) };
    }
  },
}));

vi.mock('../store.js', () => ({
  getEntityStore: () => ({ initialize: () => parked.hold(parked.storeInits) }),
}));

/**
 * Once the last parked call an attempt makes has settled, only microtasks
 * remain in that attempt; one macrotask drains them all.
 */
const drainMicrotasks = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

async function loadWithTwoAttemptsInFlight() {
  const mod = await import('../integration.js');
  await parked.reached(parked.reads, 1); // the load-time attempt
  const retry = mod.initializeEntityStore();
  await parked.reached(parked.reads, 2);
  return { ...mod, retry };
}

describe('initializeEntityStore with two attempts in flight', () => {
  beforeEach(() => {
    vi.resetModules();
    parked.reset();
  });

  it('stays ready when the load-time attempt fails after a retry succeeded', async () => {
    const { isEntityStoreReady, retry } = await loadWithTwoAttemptsInFlight();

    parked.reads[1].resolve({ exists: false });
    await parked.reached(parked.storeInits, 1);
    parked.storeInits[0].resolve();
    await retry;
    expect(isEntityStoreReady()).toBe(true);

    parked.reads[0].reject(new Error('firestore unavailable'));
    await drainMicrotasks();
    expect(isEntityStoreReady()).toBe(true);
  });

  it('stays ready when a retry fails after the load-time attempt succeeded', async () => {
    const { isEntityStoreReady, retry } = await loadWithTwoAttemptsInFlight();

    parked.reads[0].resolve({ exists: false });
    await parked.reached(parked.storeInits, 1);
    parked.storeInits[0].resolve();
    await drainMicrotasks();
    expect(isEntityStoreReady()).toBe(true);

    parked.reads[1].reject(new Error('firestore unavailable'));
    await retry;
    expect(isEntityStoreReady()).toBe(true);
  });
});

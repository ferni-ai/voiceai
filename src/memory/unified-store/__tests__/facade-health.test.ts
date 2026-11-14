/**
 * health() on the real facade: `degraded` follows the four stores it still has, and nothing
 * else. Each adapter is swapped for one that reports a fixed health.
 */
import { describe, expect, it } from 'vitest';
import { UnifiedMemoryStoreFacade } from '../facade.js';
import type { StoreHealth } from '../types.js';

const STORES = ['firestore', 'vector', 'redis', 'memory'] as const;
type Store = (typeof STORES)[number];

const report = (name: string, healthy: boolean): StoreHealth => ({
  name,
  healthy,
  initialized: true,
  latencyMs: 1,
  errorRate: healthy ? 0 : 1,
});

/** The facade with every store healthy except the ones named. */
function facadeWith(down: readonly Store[] = []): UnifiedMemoryStoreFacade {
  const facade = new UnifiedMemoryStoreFacade();
  const internals = facade as unknown as Record<string, unknown>;
  for (const store of STORES)
    internals[`${store}Adapter`] = { health: async () => report(store, !down.includes(store)) };
  return facade;
}

describe('UnifiedMemoryStoreFacade.health degraded', () => {
  it('is not degraded when every store is healthy', async () => {
    const health = await facadeWith().health();
    expect(health.degraded).toBe(false);
    expect(health.healthy).toBe(true);
    expect(health.degradationReason).toBeUndefined();
    expect(health.recommendations).toBeUndefined();
  });

  it.each(STORES)('is degraded when only %s is unhealthy', async (store) => {
    const health = await facadeWith([store]).health();
    expect(health.degraded).toBe(true);
    expect(health.stores[store].healthy).toBe(false);
  });

  it('reports exactly the four stores it reads', async () => {
    const health = await facadeWith().health();
    expect(Object.keys(health.stores).sort()).toEqual([...STORES].sort());
  });
});

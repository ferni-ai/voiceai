import { afterEach, describe, expect, it, vi } from 'vitest';

const { isConnectedAsync } = vi.hoisted(() => ({ isConnectedAsync: vi.fn() }));
vi.mock('../../../../services/integrations/index.js', () => ({
  getIntegrationHub: () => ({ isConnectedAsync }),
}));

const { buildServiceAvailabilityInjection } = await import('../service-availability.js');
const { clearNonVolatileInjectionCache } = await import('../cache.js');

const ctx = (userId: string) => ({ services: { userId } }) as never;

describe('buildServiceAvailabilityInjection', () => {
  afterEach(() => {
    isConnectedAsync.mockReset();
    clearNonVolatileInjectionCache('u1');
  });

  it('tells the model what the caller has not connected', async () => {
    isConnectedAsync.mockImplementation(async (_u: string, id: string) => id === 'spotify');
    const injection = await buildServiceAvailabilityInjection(ctx('u1'));
    expect(injection?.content).toContain('Gmail: NOT CONNECTED');
    expect(injection?.content).not.toContain('Spotify: NOT CONNECTED');
    expect(injection?.content).toContain('Connected services: Spotify');
  });

  it('answers later turns from the cache instead of four lookups each', async () => {
    isConnectedAsync.mockResolvedValue(false);
    await buildServiceAvailabilityInjection(ctx('u1'));
    const lookups = isConnectedAsync.mock.calls.length;
    const second = await buildServiceAvailabilityInjection(ctx('u1'));
    expect(second?.content).toContain('NOT CONNECTED');
    expect(isConnectedAsync.mock.calls.length).toBe(lookups);
  });

  it('shares a lookup still running from an earlier turn, so it lands once it finishes', async () => {
    const pending: Array<(connected: boolean) => void> = [];
    isConnectedAsync.mockImplementation(() => new Promise<boolean>((r) => pending.push(r)));
    const first = buildServiceAvailabilityInjection(ctx('u1')); // the turn's budget gives up on this
    const second = buildServiceAvailabilityInjection(ctx('u1')); // next turn, lookup still running
    await vi.waitFor(() => expect(pending).toHaveLength(4));
    await new Promise((r) => setTimeout(r, 10));
    expect(isConnectedAsync).toHaveBeenCalledTimes(4); // one lookup, not two
    pending.forEach((resolve) => resolve(false));
    expect(await first).toBe(await second);

    isConnectedAsync.mockClear();
    const next = await buildServiceAvailabilityInjection(ctx('u1'));
    expect(next?.content).toContain('NOT CONNECTED');
    expect(isConnectedAsync).not.toHaveBeenCalled(); // served from what the shared lookup cached
  });

  it('says nothing for an anonymous caller', async () => {
    await expect(buildServiceAvailabilityInjection(ctx(''))).resolves.toBeNull();
    expect(isConnectedAsync).not.toHaveBeenCalled();
  });
});

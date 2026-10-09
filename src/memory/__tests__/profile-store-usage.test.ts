import { beforeEach, describe, expect, it, vi } from 'vitest';

const info = vi.hoisted(() => vi.fn());
vi.mock('../../utils/safe-logger.js', () => ({
  getLogger: () => ({ child: () => ({ info, debug: vi.fn(), warn: vi.fn(), error: vi.fn() }) }),
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../utils/interval-manager.js', () => ({ registerInterval: vi.fn(), hasInterval: vi.fn(() => false) }));

import { flushUsage, takeUsageSnapshot, withUsageTiming } from '../profile-store-usage.js';

class FakeStore {
  #profiles = new Map<string, string>([['u1', 'Sam']]);
  async getProfile(id: string): Promise<string | null> {
    return this.#profiles.get(id) ?? null;
  }
  async saveProfile(): Promise<void> {
    throw new Error('write failed');
  }
  label(): string {
    return 'fake';
  }
}

beforeEach(() => {
  takeUsageSnapshot();
  info.mockClear();
});

describe('withUsageTiming', () => {
  it('returns what the real method returns, with the real store as `this` (private fields work)', async () => {
    const store = withUsageTiming(new FakeStore(), 'in-memory');
    expect(await store.getProfile('u1')).toBe('Sam');
    expect(store.label()).toBe('fake');
    expect(store).toBeInstanceOf(FakeStore);
  });

  it('counts and times every call per method', async () => {
    const store = withUsageTiming(new FakeStore(), 'configured');
    await store.getProfile('u1');
    await store.getProfile('nobody');
    store.label();
    const snap = takeUsageSnapshot();
    expect(snap.getProfile?.calls).toBe(2);
    expect(snap.label?.calls).toBe(1);
    expect(snap.getProfile?.totalMs).toBeGreaterThanOrEqual(0);
  });

  it('still times a call that rejects, and the rejection reaches the caller', async () => {
    const store = withUsageTiming(new FakeStore(), 'configured');
    await expect(store.saveProfile()).rejects.toThrow('write failed');
    expect(takeUsageSnapshot().saveProfile?.calls).toBe(1);
  });

  it('reaches a method that was replaced on the store after wrapping', async () => {
    const raw = new FakeStore();
    const store = withUsageTiming(raw, 'configured');
    await store.getProfile('u1');
    raw.getProfile = async () => 'replaced';
    expect(await store.getProfile('u1')).toBe('replaced');
  });

  it('wraps a store once, so repeated getProfileStore() calls share one proxy', () => {
    const raw = new FakeStore();
    expect(withUsageTiming(raw, 'configured')).toBe(withUsageTiming(raw, 'configured'));
  });
});

describe('flushUsage', () => {
  it('logs one line for the window with the store, call count and per-method numbers, then resets', async () => {
    const store = withUsageTiming(new FakeStore(), 'configured');
    await store.getProfile('u1');
    flushUsage();
    expect(info).toHaveBeenCalledTimes(1);
    const [fields, msg] = info.mock.calls[0] as [Record<string, unknown>, string];
    expect(msg).toBe('Agent profile store usage');
    expect(fields).toMatchObject({ store: 'configured', calls: 1, methods: { getProfile: { calls: 1 } } });
    expect(takeUsageSnapshot()).toEqual({});
  });

  it('logs nothing for a window with no calls', () => {
    flushUsage();
    expect(info).not.toHaveBeenCalled();
  });
});

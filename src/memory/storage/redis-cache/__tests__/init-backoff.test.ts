/**
 * An unreachable Redis is dialed once per backoff window, not once per caller.
 *
 * About 50 call sites run `getRedisCache().initialize()` before each use. When
 * Redis went away (prod Memorystore deleted 2026-10-16), every one of them
 * dialed again and logged "Redis initialization failed" at error level, so the
 * web server logged hundreds of them. After a failure, initialize() now
 * rejects at once with the same error until the backoff passes, and the
 * failure is logged once per window.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dials, log } = vi.hoisted(() => ({
  dials: { count: 0 },
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('ioredis', () => ({
  default: class {
    constructor() {
      dials.count++;
    }
    on(): void {}
    connect(): Promise<void> {
      return Promise.reject(new Error('connect ECONNREFUSED 127.0.0.1:6379'));
    }
    disconnect(): void {}
  },
}));

vi.mock('../../../../utils/safe-logger.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getLogger: () => log,
}));

import { RedisCache } from '../redis-cache.js';

describe('RedisCache.initialize with Redis unreachable', () => {
  beforeEach(() => {
    dials.count = 0;
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('dials once and logs once for many callers, then retries after the backoff', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-17T12:00:00Z') });
    const cache = new RedisCache({ url: 'redis://127.0.0.1:6379', keyPrefix: 'bogle:' });

    for (let i = 0; i < 5; i++) {
      await expect(cache.initialize()).rejects.toThrow(/ECONNREFUSED/);
    }
    expect(dials.count).toBe(1);
    expect(log.error).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(cache.isConnected()).toBe(false);

    vi.advanceTimersByTime(5 * 60_000 + 1);
    await expect(cache.initialize()).rejects.toThrow(/ECONNREFUSED/);
    expect(dials.count).toBe(2);
    expect(log.warn).toHaveBeenCalledTimes(2);
  });
});

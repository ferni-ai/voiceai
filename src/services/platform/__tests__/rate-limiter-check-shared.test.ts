/**
 * rateLimiter.checkShared is for spend caps: with Redis configured but
 * unreachable it must return null (the caller fails closed), never count in
 * this instance's memory. With no Redis configured it counts in memory.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllEnvs());

describe('rateLimiter.checkShared', () => {
  it('returns null when Redis is configured but unreachable', async () => {
    vi.stubEnv('REDIS_URL', 'redis://127.0.0.1:1');
    vi.stubEnv('REDIS_RATE_LIMIT_URL', '');
    const { rateLimiter } = await import('../rate-limiter.js');
    expect(await rateLimiter.checkShared('test:shared:down', 10, 60_000, 3)).toBeNull();
    // The ordinary check still answers, from memory, for limits that may.
    expect((await rateLimiter.check('test:plain:down', 10, 60_000)).allowed).toBe(true);
    await rateLimiter.close();
  });

  it('counts in memory, with cost, when no Redis is configured', async () => {
    vi.stubEnv('REDIS_URL', '');
    vi.stubEnv('REDIS_RATE_LIMIT_URL', '');
    const { rateLimiter } = await import('../rate-limiter.js');
    expect(await rateLimiter.checkShared('test:shared:local', 10, 60_000, 7)).toMatchObject({
      allowed: true,
      remaining: 3,
    });
    expect(await rateLimiter.checkShared('test:shared:local', 10, 60_000, 4)).toMatchObject({
      allowed: false,
    });
  });
});

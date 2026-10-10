/**
 * The "in-memory rate limiting in production" warning fires only when no Redis is configured.
 *
 * It ran at module load, before the Redis connection (which only marks itself available on
 * 'connect') could finish, so every production start logged the SECURITY warning six seconds
 * before "Redis connected for rate limiting".
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const warn = vi.fn();
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn, error: vi.fn() }),
}));
vi.mock('../../../utils/interval-manager.js', () => ({ registerInterval: vi.fn() }));
vi.mock('ioredis', () => ({
  // A connection that is still in flight when the module finishes loading
  default: class {
    on(): void {}
    connect(): Promise<void> {
      return new Promise(() => {});
    }
  },
}));

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
  warn.mockReset();
  vi.resetModules();
});

const securityWarnings = () =>
  warn.mock.calls.filter((args) => String(args.at(-1)).includes('in-memory rate limiting in production'));

describe('rate limiter startup warning', () => {
  it('stays quiet in production while a configured Redis is still connecting', async () => {
    process.env.K_SERVICE = 'john-bogle-ui';
    process.env.REDIS_URL = 'redis://10.0.0.1:6379';
    await import('../rate-limiter.js');
    expect(securityWarnings()).toHaveLength(0);
  });

  it('warns in production when no Redis is configured', async () => {
    process.env.K_SERVICE = 'john-bogle-ui';
    delete process.env.REDIS_URL;
    delete process.env.REDIS_RATE_LIMIT_URL;
    await import('../rate-limiter.js');
    expect(securityWarnings()).toHaveLength(1);
  });
});

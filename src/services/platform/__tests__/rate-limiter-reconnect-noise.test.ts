/**
 * An unreachable Redis doesn't log a warning per reconnect attempt.
 *
 * ioredis emits 'error' and 'close' on every reconnect attempt. After prod's
 * Memorystore was deleted (2026-10-16) each one was a warn line on every
 * instance. The outage is reported by rate_limit_redis_down, once per revive
 * window; the per-attempt events are debug.
 */
import { describe, expect, it, vi } from 'vitest';

const { log, handlers } = vi.hoisted(() => ({
  log: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  handlers: new Map<string, (arg?: unknown) => void>(),
}));
vi.mock('../../../utils/safe-logger.js', () => ({ createLogger: () => log }));
vi.mock('../../../utils/interval-manager.js', () => ({ registerInterval: vi.fn() }));
vi.mock('ioredis', () => ({
  default: class {
    on(event: string, handler: (arg?: unknown) => void): void {
      handlers.set(event, handler);
    }
    connect(): Promise<void> {
      return new Promise(() => {}); // still dialing
    }
  },
}));

describe('rate limiter with Redis unreachable', () => {
  it('logs reconnect errors and closes at debug, not warn', async () => {
    process.env.REDIS_URL = 'redis://127.0.0.1:6379';
    await import('../rate-limiter.js');
    log.warn.mockClear();

    for (let i = 0; i < 5; i++) {
      handlers.get('error')?.(new Error('connect ECONNREFUSED 127.0.0.1:6379'));
      handlers.get('close')?.();
    }

    expect(handlers.has('error')).toBe(true);
    expect(log.warn).not.toHaveBeenCalled();
    expect(log.debug).toHaveBeenCalledWith(
      { error: 'Error: connect ECONNREFUSED 127.0.0.1:6379' },
      'Redis connection error'
    );
  });
});

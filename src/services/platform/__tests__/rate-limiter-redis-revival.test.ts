/**
 * After ioredis gives up reconnecting (retryStrategy returns null, status 'end'),
 * the next check after a backoff connects again, so spend caps that fail closed
 * (checkShared) recover without a restart. ioredis is a fake here; the module under
 * test is the real rate limiter.
 */
import type { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeRedis extends EventEmitter {
  status: string;
  connect: ReturnType<typeof vi.fn>;
  eval: ReturnType<typeof vi.fn>;
  quit: ReturnType<typeof vi.fn>;
  retryStrategy: (times: number) => number | null;
}

const { clients, log } = vi.hoisted(() => ({
  clients: [] as FakeRedis[],
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('ioredis', async () => {
  const { EventEmitter } = await import('events');
  class Redis extends EventEmitter {
    status = 'wait';
    connect = vi.fn(async () => {
      this.status = 'connecting';
    });
    eval = vi.fn(async () => [1, 9, Date.now() + 60_000]);
    quit = vi.fn(async () => 'OK');
    retryStrategy: (times: number) => number | null;
    constructor(_url: string, options: { retryStrategy: (times: number) => number | null }) {
      super();
      this.retryStrategy = options.retryStrategy;
      clients.push(this as unknown as FakeRedis);
    }
  }
  return { default: Redis };
});
vi.mock('../../../utils/safe-logger.js', () => ({ createLogger: () => log }));
vi.mock('../../../utils/interval-manager.js', () => ({ registerInterval: vi.fn() }));

/** The limiter, with its one Redis client given up on: retries spent, status 'end'. */
async function givenUpLimiter() {
  const { rateLimiter } = await import('../rate-limiter.js');
  const client = clients[clients.length - 1];
  expect(client.retryStrategy(6)).toBeNull();
  client.emit('error', new Error('ECONNREFUSED'));
  client.status = 'end';
  client.connect.mockClear();
  return { rateLimiter, client };
}

const downAlerts = (): number =>
  log.error.mock.calls.filter((call) => call[1] === 'rate_limit_redis_down').length;

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-17T00:00:00Z'));
  vi.stubEnv('REDIS_URL', 'redis://redis.test:6379');
  clients.length = 0;
  for (const fn of Object.values(log)) fn.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('rate limiter Redis revival', () => {
  it('reconnects a given-up client on the next shared check, and fails closed meanwhile', async () => {
    const { rateLimiter, client } = await givenUpLimiter();

    expect(await rateLimiter.checkShared('transcribe:u1', 10, 60_000, 2)).toBeNull();
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.eval).not.toHaveBeenCalled();
  });

  it('makes no second attempt inside the backoff window, then backs off longer', async () => {
    const { rateLimiter, client } = await givenUpLimiter();
    await rateLimiter.checkShared('transcribe:u1', 10, 60_000);
    client.status = 'end'; // the attempt failed

    vi.advanceTimersByTime(29_000);
    await rateLimiter.checkShared('transcribe:u1', 10, 60_000);
    await rateLimiter.check('api:u1', 10, 60_000);
    expect(client.connect).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2_000); // 31 s: the first window is over
    await rateLimiter.checkShared('transcribe:u1', 10, 60_000);
    expect(client.connect).toHaveBeenCalledTimes(2);
    client.status = 'end';

    vi.advanceTimersByTime(59_000); // the second window is 60 s
    await rateLimiter.checkShared('transcribe:u1', 10, 60_000);
    expect(client.connect).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(2_000);
    await rateLimiter.checkShared('transcribe:u1', 10, 60_000);
    expect(client.connect).toHaveBeenCalledTimes(3);
  });

  it('raises rate_limit_redis_down once per window, with the key prefix', async () => {
    const { rateLimiter, client } = await givenUpLimiter();
    const checkFiveTimes = async (): Promise<void> => {
      for (let i = 0; i < 5; i++) {
        await rateLimiter.checkShared('transcribe:u1', 10, 60_000);
        client.status = 'end'; // each attempt fails at once
      }
    };
    await checkFiveTimes();
    expect(downAlerts()).toBe(1);
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ keyPrefix: 'transcribe' }),
      'rate_limit_redis_down'
    );

    vi.advanceTimersByTime(31_000);
    await checkFiveTimes();
    expect(downAlerts()).toBe(2);
  });

  it("counts in Redis again once 'connect' fires, and logs the recovery", async () => {
    const { rateLimiter, client } = await givenUpLimiter();
    await rateLimiter.checkShared('transcribe:u1', 10, 60_000);
    expect(await rateLimiter.checkShared('transcribe:u1', 10, 60_000)).toBeNull();

    client.status = 'connect';
    client.emit('connect');

    expect(await rateLimiter.checkShared('transcribe:u1', 10, 60_000, 2)).toMatchObject({
      allowed: true,
      remaining: 9,
    });
    expect(client.eval).toHaveBeenCalledTimes(1);
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ downForMs: expect.any(Number) }),
      'rate_limit_redis_recovered'
    );
  });

  it('leaves a client that ioredis is still retrying alone', async () => {
    const { rateLimiter } = await import('../rate-limiter.js');
    const client = clients[clients.length - 1];
    client.status = 'reconnecting';
    client.connect.mockClear();

    expect(await rateLimiter.checkShared('transcribe:u1', 10, 60_000)).toBeNull();
    expect(client.connect).not.toHaveBeenCalled();
    expect(downAlerts()).toBe(0);
  });

  it('still answers the ordinary check from memory while Redis is down', async () => {
    const { rateLimiter, client } = await givenUpLimiter();
    expect(await rateLimiter.check('api:u1', 2, 60_000)).toMatchObject({
      allowed: true,
      remaining: 1,
    });
    expect(await rateLimiter.check('api:u1', 2, 60_000)).toMatchObject({
      allowed: true,
      remaining: 0,
    });
    expect((await rateLimiter.check('api:u1', 2, 60_000)).allowed).toBe(false);
    expect(client.eval).not.toHaveBeenCalled();
    expect(client.connect).toHaveBeenCalledTimes(1); // the ordinary check revives too
  });
});

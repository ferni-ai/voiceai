/**
 * A failed Pub/Sub start closes both Redis clients.
 *
 * initialize() dropped its publisher and subscriber when Redis was
 * unreachable but never closed them, so both kept reconnecting in the
 * background for the life of the instance.
 */
import { describe, expect, it, vi } from 'vitest';

const { disconnects } = vi.hoisted(() => ({ disconnects: { count: 0 } }));
vi.mock('ioredis', () => {
  class FakeRedis {
    on(): void {}
    duplicate(): FakeRedis {
      return new FakeRedis();
    }
    connect(): Promise<void> {
      return Promise.reject(new Error('connect ECONNREFUSED 127.0.0.1:6379'));
    }
    disconnect(): void {
      disconnects.count++;
    }
  }
  return { default: FakeRedis };
});

import { initializeRedisPubSub } from '../redis-pubsub.js';

describe('Redis Pub/Sub with Redis unreachable', () => {
  it('reports not started and closes the publisher and subscriber', async () => {
    process.env.REDIS_URL = 'redis://127.0.0.1:6379';
    expect(await initializeRedisPubSub()).toBe(false);
    expect(disconnects.count).toBe(2);
  });
});

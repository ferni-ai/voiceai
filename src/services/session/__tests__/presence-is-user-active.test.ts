/**
 * #3692: RedisCache.isUserActive must see the presence that the session lifecycle
 * writes. onStart/onHeartbeat store presence:{uid} = 'active' and onEnd deletes it;
 * isUserActive used to JSON-parse that key, fail, and always answer false.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// An in-memory stand-in for ioredis, so the real RedisCache runs end to end.
vi.mock('ioredis', () => {
  const store = new Map<string, string>();
  class FakeRedis {
    connect = async () => undefined;
    ping = async () => 'PONG';
    on = () => this;
    disconnect = () => undefined;
    quit = async () => 'OK';
    get = async (key: string) => store.get(key) ?? null;
    set = async (key: string, value: string) => (store.set(key, value), 'OK');
    setex = async (key: string, _ttl: number, value: string) => (store.set(key, value), 'OK');
    del = async (...keys: string[]) => keys.filter((k) => store.delete(k)).length;
    constructor() {
      // Any other command the hooks happen to call is a harmless no-op.
      return new Proxy(this, {
        get: (target, prop) =>
          prop in target ? target[prop as keyof FakeRedis] : async () => null,
      });
    }
  }
  return { default: FakeRedis };
});
vi.mock('../../superhuman/persona-affinity.js', () => ({
  personaAffinity: {
    getAll: async () => [],
    updateAfterSession: async () => undefined,
    recordInteraction: async () => undefined,
  },
}));
vi.mock('../../superhuman/user-corrections.js', () => ({
  userCorrections: { getAll: async () => [] },
}));
vi.mock('../../data/redis-pubsub.js', () => ({ publishSessionEvent: () => undefined }));

import { getRedisCache, resetRedisCache } from '../../../memory/redis-cache.js';
import { onSessionEnd, onSessionHeartbeat, onSessionStart } from '../session-lifecycle-hooks.js';

const UID = 'user_presence_3692';
const SID = 'sess_presence_3692';

beforeAll(async () => {
  vi.stubEnv('REDIS_HOST', 'fake-redis');
  await getRedisCache().initialize();
});
afterAll(async () => {
  await resetRedisCache();
  vi.unstubAllEnvs();
});

describe('isUserActive follows the session lifecycle', () => {
  it('is false before a session, true during it, and false after it ends', async () => {
    const redis = getRedisCache();
    expect(redis.isConnected()).toBe(true);
    expect(await redis.isUserActive(UID)).toBe(false);

    await onSessionStart(UID, SID, 'ferni', 'voice');
    expect(await redis.isUserActive(UID)).toBe(true);

    await onSessionHeartbeat(UID, SID, 'ferni');
    expect(await redis.isUserActive(UID)).toBe(true);

    await onSessionEnd(UID, SID, {
      personaId: 'ferni',
      duration: 5,
      topics: [],
      sentiment: 'neutral',
      userEngagement: 'medium',
    });
    expect(await redis.isUserActive(UID)).toBe(false);
  });

  it('a different user stays inactive while one is in a session', async () => {
    const redis = getRedisCache();
    await onSessionStart(UID, SID, 'ferni', 'voice');
    expect(await redis.isUserActive('user_someone_else')).toBe(false);
  });
});

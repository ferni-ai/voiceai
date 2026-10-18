/**
 * Without Redis, checkShared counts in Firestore so a spend cap holds across
 * instances instead of multiplying by the instance count. Two "instances" here are
 * two separately imported rate limiter modules sharing one fake Firestore, whose
 * transactions run one at a time like Firestore's do. Any Firestore error fails
 * closed (null), and the callers refuse.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Doc = Record<string, unknown>;

const { store, firestore, state, redisClients } = vi.hoisted(() => {
  const store = new Map<string, Doc>();
  const state = { fail: false, unavailable: false, transactions: 0 };
  let queue: Promise<unknown> = Promise.resolve();
  const firestore = {
    collection: (name: string) => ({
      doc: (id: string) => ({ path: `${name}/${id}` }),
    }),
    runTransaction<T>(work: (tx: unknown) => Promise<T>): Promise<T> {
      state.transactions++;
      const run = queue.then(async () => {
        if (state.fail) throw new Error('DEADLINE_EXCEEDED');
        const writes = new Map<string, Doc>();
        const tx = {
          get: async (ref: { path: string }) => {
            const data = store.get(ref.path);
            return { exists: !!data, get: (field: string) => data?.[field] };
          },
          set: (ref: { path: string }, data: Doc) => writes.set(ref.path, data),
        };
        const result = await work(tx);
        for (const [path, data] of writes) store.set(path, data);
        return result;
      });
      queue = run.catch(() => undefined);
      return run;
    },
  };
  return { store, firestore, state, redisClients: [] as Array<Record<string, unknown>> };
});

vi.mock('../../../utils/firestore-utils.js', () => ({
  getFirestoreDb: () => (state.unavailable ? null : firestore),
}));
vi.mock('../../../utils/interval-manager.js', () => ({ registerInterval: vi.fn() }));
vi.mock('ioredis', async () => {
  const { EventEmitter } = await import('events');
  class Redis extends EventEmitter {
    status = 'wait';
    connect = vi.fn(async () => {
      this.status = 'ready';
      this.emit('connect');
    });
    eval = vi.fn(async () => [1, 41, Date.now() + 60_000]);
    quit = vi.fn(async () => 'OK');
    constructor() {
      super();
      redisClients.push(this as unknown as Record<string, unknown>);
    }
  }
  return { default: Redis };
});

/** A fresh rate limiter module: what a second Cloud Run instance would load. */
async function instance() {
  vi.resetModules();
  return (await import('../rate-limiter.js')).rateLimiter;
}

const HOUR = 3_600_000;

beforeEach(() => {
  store.clear();
  Object.assign(state, { fail: false, unavailable: false, transactions: 0 });
  redisClients.length = 0;
  vi.stubEnv('REDIS_URL', '');
  vi.stubEnv('REDIS_RATE_LIMIT_URL', '');
  vi.stubEnv('K_SERVICE', 'john-bogle-ui'); // what Cloud Run sets
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-17T10:15:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('checkShared without Redis', () => {
  it('holds one cap across two instances', async () => {
    const a = await instance();
    const b = await instance();
    expect(a).not.toBe(b);

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => (i % 2 ? a : b).checkShared('web-search:day', 5, HOUR))
    );

    expect(results.filter((r) => r?.allowed)).toHaveLength(5);
    expect(results.filter((r) => r && !r.allowed)).toHaveLength(5);
    expect(state.transactions).toBe(10);
  });

  it('charges a cost above 1 and refuses one that would pass the cap, without counting it', async () => {
    const a = await instance();
    const b = await instance();
    const key = 'expensive:journal-transcribe:audio-tokens';

    expect(await a.checkShared(key, 10, HOUR, 7)).toMatchObject({ allowed: true, remaining: 3 });
    expect(await b.checkShared(key, 10, HOUR, 4)).toMatchObject({ allowed: false, remaining: 3 });
    expect(await b.checkShared(key, 10, HOUR, 3)).toMatchObject({ allowed: true, remaining: 0 });
    expect(await a.checkShared(key, 10, HOUR, 1)).toMatchObject({ allowed: false, remaining: 0 });
  });

  it('starts a new count in a new window, with a TTL at the window end', async () => {
    const a = await instance();
    expect((await a.checkShared('web-search:day', 1, HOUR))?.allowed).toBe(true);
    expect((await a.checkShared('web-search:day', 1, HOUR))?.allowed).toBe(false);

    vi.setSystemTime(new Date('2026-10-17T11:00:00Z')); // the next hour
    const next = await a.checkShared('web-search:day', 1, HOUR);
    expect(next).toMatchObject({ allowed: true, resetAt: Date.parse('2026-10-17T12:00:00Z') });

    const docs = [...store.entries()];
    expect(docs).toHaveLength(2);
    for (const [path, doc] of docs) {
      expect(path.startsWith('rate_limits/web-search%3Aday@')).toBe(true);
      expect(doc.expireAt).toEqual(new Date(doc.resetAt as number));
    }
  });

  it('returns null on a Firestore error, and when Firestore is unavailable', async () => {
    const a = await instance();
    state.fail = true;
    expect(await a.checkShared('web-search:day', 5, HOUR)).toBeNull();
    state.fail = false;
    state.unavailable = true;
    expect(await a.checkShared('web-search:day', 5, HOUR)).toBeNull();
  });

  it('makes the callers refuse when Firestore fails', async () => {
    state.fail = true;
    vi.resetModules();
    const { chargeAudioBudget, TranscribeBudgetSpentError } =
      await import('../../custom-agent/transcribe-budget.js');
    await expect(chargeAudioBudget(100)).rejects.toBeInstanceOf(TranscribeBudgetSpentError);

    const { runWebSearch, CAPPED } =
      await import('../../../tools/domains/information/web-search.js');
    expect(await runWebSearch('weather in Tampa today', 'user:u1')).toBe(CAPPED);
  });

  it("keeps the ordinary check in this instance's memory, never Firestore", async () => {
    const a = await instance();
    for (let i = 0; i < 3; i++) await a.check('api:u1', 10, HOUR);
    expect(state.transactions).toBe(0);
  });

  it('counts in memory in local development (no Google Cloud, no emulator)', async () => {
    vi.stubEnv('K_SERVICE', '');
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', '');
    vi.stubEnv('FIRESTORE_EMULATOR_HOST', '');
    vi.stubEnv('NODE_ENV', 'test');
    const a = await instance();
    expect(await a.checkShared('web-search:day', 5, HOUR, 2)).toMatchObject({ remaining: 3 });
    expect(state.transactions).toBe(0);
  });
});

describe('checkShared with Redis configured and healthy', () => {
  it('still counts in Redis, not Firestore', async () => {
    vi.stubEnv('REDIS_URL', 'redis://redis.test:6379');
    const a = await instance();
    await vi.waitFor(() => expect(redisClients).toHaveLength(1));

    expect(await a.checkShared('web-search:day', 42, HOUR)).toMatchObject({
      allowed: true,
      remaining: 41,
    });
    expect(redisClients[0].eval).toHaveBeenCalledTimes(1);
    expect(state.transactions).toBe(0);
  });
});

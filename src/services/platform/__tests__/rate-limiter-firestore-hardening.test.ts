/**
 * Hardening for the Firestore-backed checkShared (firestore-rate-limit.ts):
 * - a hot or stuck document can't stall a voice turn: null after 1.5 s, three attempts
 * - the global key is charged first, so its refusal never uses up a caller's quota
 * - which environments count in Firestore
 * - a bad cost, or a corrupt stored count, is refused
 * - status, the startup log and the unavailable log
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Doc = Record<string, unknown>;

const { store, firestore, state, log } = vi.hoisted(() => {
  const store = new Map<string, Doc>();
  const state = {
    fail: false,
    hang: false,
    /** Paths whose transaction fails with ABORTED (contention). */
    abortedPaths: [] as string[],
    options: [] as unknown[],
    transactions: 0,
  };
  let queue: Promise<unknown> = Promise.resolve();
  const firestore = {
    collection: (name: string) => ({ doc: (id: string) => ({ path: `${name}/${id}` }) }),
    runTransaction<T>(work: (tx: unknown) => Promise<T>, options?: unknown): Promise<T> {
      state.transactions++;
      state.options.push(options);
      if (state.hang) return new Promise<T>(() => {});
      const run = queue.then(async () => {
        if (state.fail) throw new Error('DEADLINE_EXCEEDED');
        const writes = new Map<string, Doc>();
        const tx = {
          get: async (ref: { path: string }) => {
            if (state.abortedPaths.some((p) => ref.path.startsWith(p))) {
              throw new Error('10 ABORTED: Too much contention on these documents');
            }
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
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  return { store, firestore, state, log };
});

vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => firestore }));
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => log,
  getLogger: () => log,
}));
vi.mock('../../../utils/interval-manager.js', () => ({ registerInterval: vi.fn() }));

const HOUR = 3_600_000;
const docPrefix = (key: string): string => `rate_limits/${encodeURIComponent(key)}@`;
const docsFor = (key: string): Doc[] =>
  [...store.entries()].filter(([path]) => path.startsWith(docPrefix(key))).map(([, d]) => d);
const unavailableLogs = (): number =>
  log.error.mock.calls.filter((call) => call[1] === 'rate_limit_firestore_unavailable').length;

async function limiter() {
  vi.resetModules();
  return (await import('../rate-limiter.js')).rateLimiter;
}

beforeEach(() => {
  store.clear();
  Object.assign(state, {
    fail: false,
    hang: false,
    abortedPaths: [],
    options: [],
    transactions: 0,
  });
  for (const fn of Object.values(log)) fn.mockClear();
  vi.stubEnv('REDIS_URL', '');
  vi.stubEnv('REDIS_RATE_LIMIT_URL', '');
  vi.stubEnv('K_SERVICE', 'john-bogle-ui');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('a stuck or contended document', () => {
  it('fails closed after 1.5 s instead of waiting', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const rateLimiter = await limiter();
    state.hang = true;

    let answer: unknown = 'pending';
    const check = rateLimiter.checkShared('web-search:day', 5, HOUR).then((r) => (answer = r));
    await vi.advanceTimersByTimeAsync(1_499);
    expect(answer).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    await check;
    expect(answer).toBeNull();
  });

  it('asks Firestore for at most three transaction attempts', async () => {
    const rateLimiter = await limiter();
    await rateLimiter.checkShared('web-search:day', 5, HOUR);
    expect(state.options).toEqual([{ maxAttempts: 3 }]);
  });
});

describe('the global key is charged first', () => {
  it("web search: an ABORTED day leaves the caller's hour untouched", async () => {
    const { runWebSearch, CAPPED, DAY_KEY, PERSON_KEY } =
      await import('../../../tools/domains/information/web-search.js');
    state.abortedPaths = [docPrefix(DAY_KEY)];

    expect(await runWebSearch('weather in Tampa today', 'user:u1')).toBe(CAPPED);
    expect(docsFor(`${PERSON_KEY}:user:u1`)).toHaveLength(0);
  });

  it("journal: an ABORTED shared budget leaves the caller's hour untouched", async () => {
    const {
      chargeAudioBudget,
      withTranscribeCaller,
      TranscribeBudgetSpentError,
      AUDIO_BUDGET_KEY,
    } = await import('../../custom-agent/transcribe-budget.js');
    state.abortedPaths = [docPrefix(AUDIO_BUDGET_KEY)];

    await expect(
      withTranscribeCaller('user:u1', () => chargeAudioBudget(100))
    ).rejects.toBeInstanceOf(TranscribeBudgetSpentError);
    expect(docsFor(`${AUDIO_BUDGET_KEY}:user:u1`)).toHaveLength(0);
  });

  it('journal: with the shared budget open, the caller is charged too', async () => {
    const { chargeAudioBudget, withTranscribeCaller, AUDIO_BUDGET_KEY } =
      await import('../../custom-agent/transcribe-budget.js');
    await withTranscribeCaller('user:u1', () => chargeAudioBudget(100));
    expect(docsFor(AUDIO_BUDGET_KEY)[0]).toMatchObject({ count: 100 });
    expect(docsFor(`${AUDIO_BUDGET_KEY}:user:u1`)[0]).toMatchObject({ count: 100 });
  });
});

describe('wantsFirestoreSharedLimits', () => {
  const none = {
    NODE_ENV: '',
    K_SERVICE: '',
    GOOGLE_CLOUD_PROJECT: '',
    FIRESTORE_EMULATOR_HOST: '',
  };
  it.each([
    // The prod voice agent on LiveKit Cloud has no K_SERVICE; NODE_ENV is what it sets.
    ['NODE_ENV=production', { NODE_ENV: 'production' }, true],
    ['K_SERVICE (Cloud Run)', { K_SERVICE: 'john-bogle-ui' }, true],
    ['GOOGLE_CLOUD_PROJECT', { GOOGLE_CLOUD_PROJECT: 'johnb-2025' }, true],
    ['FIRESTORE_EMULATOR_HOST', { FIRESTORE_EMULATOR_HOST: 'localhost:8080' }, true],
    ['NODE_ENV=test alone', { NODE_ENV: 'test' }, false],
    ['all unset', {}, false],
  ])('%s → %s', async (_name, env, expected) => {
    const { wantsFirestoreSharedLimits } = await import('../firestore-rate-limit.js');
    expect(wantsFirestoreSharedLimits({ ...none, ...env })).toBe(expected);
  });
});

describe('bad input', () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, 0, -1])(
    'refuses a cost of %s without touching the store',
    async (cost) => {
      const rateLimiter = await limiter();
      expect(await rateLimiter.checkShared('web-search:day', 5, HOUR, cost)).toBeNull();
      expect(state.transactions).toBe(0);
    }
  );

  it.each([Number.POSITIVE_INFINITY, Number.NaN, 'abc', null])(
    'treats a stored count of %s as a refusal, not 0',
    async (count) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-17T10:15:00Z'));
      const windowStart = Date.parse('2026-10-17T10:00:00Z');
      store.set(`${docPrefix('web-search:day')}${windowStart}`, { count });
      const rateLimiter = await limiter();

      expect(await rateLimiter.checkShared('web-search:day', 5, HOUR)).toMatchObject({
        allowed: false,
        remaining: 0,
      });
    }
  );
});

describe('status and logs', () => {
  it("reports 'firestore' for shared limits, and 'memory' in local development", async () => {
    expect((await limiter()).getStatus()).toEqual({ backend: 'firestore', connected: true });
    vi.stubEnv('K_SERVICE', '');
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', '');
    vi.stubEnv('NODE_ENV', 'test');
    expect((await limiter()).getStatus()).toEqual({ backend: 'memory', connected: false });
  });

  it('logs rate_limit_firestore_unavailable once per key per window', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-17T10:15:00Z'));
    const rateLimiter = await limiter();
    state.fail = true;

    for (let i = 0; i < 5; i++) await rateLimiter.checkShared('web-search:day', 5, HOUR);
    expect(unavailableLogs()).toBe(1);
    await rateLimiter.checkShared('web-search:person:user:u1', 5, HOUR);
    expect(unavailableLogs()).toBe(2);

    vi.setSystemTime(new Date('2026-10-17T11:00:00Z'));
    await rateLimiter.checkShared('web-search:day', 5, HOUR);
    expect(unavailableLogs()).toBe(3);
  });
});

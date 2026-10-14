import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, Record<string, unknown>>();
function ref(path: string) {
  return {
    path,
    get: async () => ({ exists: store.has(path), data: () => store.get(path) }),
    set: async (data: Record<string, unknown>) => void store.set(path, data),
  };
}
const db = {
  collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
  runTransaction: async <T>(
    fn: (tx: { get: typeof getDoc; set: typeof setDoc }) => Promise<T>
  ): Promise<T> => fn({ get: getDoc, set: setDoc }),
};
const getDoc = async (r: ReturnType<typeof ref>) => r.get();
const setDoc = (r: ReturnType<typeof ref>, data: Record<string, unknown>) => void r.set(data);
let useDb = true;
vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => (useDb ? db : null) }));

const { cachedFor, CACHE_DAYS, resetQuotaMemory, takeDailyBudget } = await import('../quota.js');

beforeEach(() => {
  store.clear();
  resetQuotaMemory();
  useDb = true;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-11T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('takeDailyBudget', () => {
  it('counts in Firestore, so a fresh process sees what others spent', async () => {
    expect(await takeDailyBudget('youtube-search', 2)).toBe(true);
    resetQuotaMemory(); // another worker
    expect(await takeDailyBudget('youtube-search', 2)).toBe(true);
    expect(await takeDailyBudget('youtube-search', 2)).toBe(false);
    expect([...store.values()][0]).toMatchObject({ name: 'youtube-search', used: 2 });
  });

  it('starts over the next day and counts per name', async () => {
    await takeDailyBudget('grounding:u1', 1);
    expect(await takeDailyBudget('grounding:u1', 1)).toBe(false);
    expect(await takeDailyBudget('grounding:u2', 1)).toBe(true);
    vi.setSystemTime(new Date('2026-10-12T12:00:00Z'));
    expect(await takeDailyBudget('grounding:u1', 1)).toBe(true);
  });

  it('counts in process without Firestore', async () => {
    useDb = false;
    expect(await takeDailyBudget('x', 1)).toBe(true);
    expect(await takeDailyBudget('x', 1)).toBe(false);
  });
});

describe('cachedFor', () => {
  it(`serves a stored value for ${CACHE_DAYS} days, across processes, then loads again`, async () => {
    const load = vi.fn(async () => ['a']);
    expect(await cachedFor('video:any:sleep', load)).toEqual(['a']);
    resetQuotaMemory();
    vi.setSystemTime(new Date(Date.now() + (CACHE_DAYS - 1) * 86_400_000));
    expect(await cachedFor('video:any:sleep', load)).toEqual(['a']);
    expect(load).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date(Date.now() + 2 * 86_400_000));
    await cachedFor('video:any:sleep', load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not cache an empty result', async () => {
    const load = vi.fn(async () => [] as string[]);
    await cachedFor('book:x', load);
    await cachedFor('book:x', load);
    expect(load).toHaveBeenCalledTimes(2);
  });
});

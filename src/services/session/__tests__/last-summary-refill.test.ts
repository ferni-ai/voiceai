/**
 * #2801: a topic the caller asked Ferni to forget never comes back through the
 * call-start "last time" refill. createSessionServices fills a profile with no last
 * summary from realtime memory's last call (session-manager, both the loaded and the
 * deferred profile path). forgetTopic clears the profile's summaries, not the stored
 * calls, so the refill used to write the forgotten topic straight back.
 *
 * Real code: createSessionServices and both refills, realtime-memory, forgetTopic and
 * its store, the shared topics read. Fakes: the Firestore client (a document map;
 * queries honour orderBy direction and limit), the global store over the same map,
 * and the profile cache.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  type Data = Record<string, unknown>;
  const docs = new Map<string, Data>();
  const state = {
    /** How the forgotten-topics document reads: normally, throwing, or never answering. */
    topicsRead: 'ok' as 'ok' | 'throws' | 'hangs',
    /** startConversation's write fails (it still returns the new id). */
    startWriteFails: false,
  };
  const merge = (path: string, d: Data) => docs.set(path, { ...(docs.get(path) ?? {}), ...d });
  const snap = (path: string): any => ({
    id: path.split('/').pop(),
    exists: docs.has(path),
    data: () => docs.get(path),
  });
  const sortKey = (v: unknown) => (v instanceof Date ? v.getTime() : String(v ?? ''));
  const coll = (path: string, order?: { field: string; dir: string }, max?: number): any => ({
    doc: (id?: string) => ref(`${path}/${id ?? Math.random().toString(36).slice(2)}`),
    add: async (d: Data) => void merge(`${path}/${Math.random().toString(36).slice(2)}`, d),
    where: () => coll(path, order, max),
    orderBy: (field: string, dir = 'asc') => coll(path, { field, dir }, max),
    limit: (n: number) => coll(path, order, n),
    get: async () => {
      let under = [...docs.keys()].filter(
        (k) => k.startsWith(`${path}/`) && !k.slice(path.length + 1).includes('/')
      );
      if (order) {
        const key = (k: string) => sortKey(docs.get(k)?.[order.field]);
        under.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
        if (order.dir === 'desc') under.reverse();
      }
      if (max !== undefined) under = under.slice(0, max);
      const found = under.map(snap);
      return { docs: found, empty: found.length === 0, size: found.length };
    },
  });
  const ref = (path: string): any => ({
    path,
    get: async () => {
      if (path.endsWith('/memory_state/forgotten') && state.topicsRead !== 'ok') {
        if (state.topicsRead === 'throws') throw new Error('topics read failed');
        return new Promise(() => {}); // never answers
      }
      return snap(path);
    },
    set: async (d: Data, o?: { merge?: boolean }) => {
      if (state.startWriteFails && /\/conversations\/conv_[^/]+$/.test(path)) {
        throw new Error('start write failed');
      }
      if (o?.merge) merge(path, d);
      else docs.set(path, { ...d });
    },
    update: async (d: Data) => void merge(path, d),
    delete: async () => void docs.delete(path),
    collection: (c: string) => coll(`${path}/${c}`),
  });
  const db = {
    collection: (c: string) => coll(c),
    batch: () => {
      const ops: Array<() => void> = [];
      return {
        set: (r: { path: string }, d: Data) => ops.push(() => merge(r.path, d)),
        update: (r: { path: string }, d: Data) => ops.push(() => merge(r.path, d)),
        delete: (r: { path: string }) => ops.push(() => void docs.delete(r.path)),
        commit: async () => ops.forEach((f) => f()),
      };
    },
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: async (r: { path: string }) => snap(r.path),
        set: (r: { path: string }, d: Data) => merge(r.path, d),
        update: (r: { path: string }, d: Data) => merge(r.path, d),
      }),
  };
  return { docs, state, db, merge };
});

const store = vi.hoisted(() => ({
  getProfileForWrite: async (_u: string): Promise<unknown> => null,
  saveProfile: async () => undefined,
  saveSummary: async () => undefined,
}));

vi.mock('@google-cloud/firestore', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  Firestore: class {
    constructor() {
      return fake.db;
    }
  },
}));
vi.mock('../../../utils/firestore-utils.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getFirestoreDb: () => fake.db,
}));
vi.mock('../../global-services.js', () => ({ getGlobalServices: async () => ({ store }) }));
vi.mock('../../data-layer/profile-cache.js', () => ({
  getProfileWithCache: async (uid: string, load: (u: string) => Promise<unknown>) => load(uid),
  cacheProfile: async () => undefined,
  invalidateProfile: async () => undefined,
}));

const { createUserProfile } = await import('../../../types/user-profile.js');
const { createSessionServices } = await import('../session-manager.js');
const { forgetTopic } = await import('../../../memory/recall/forget.js');
const { resetForgetTopicsSource } = await import('../../../memory/recall/forget-topics-source.js');

type Path = 'loaded' | 'deferred';
const DAY = 24 * 60 * 60 * 1000;
const profileOf = (uid: string): any => fake.docs.get(`bogle_users/${uid}`) ?? {};

/** Sam's last finished call, as realtime memory stored it: a summary, or only the turns. */
function seedLastCall(uid: string, last: { summary?: string; said?: string[] }) {
  const conv = `bogle_users/${uid}/conversations/conv_${Date.now() - DAY}_done`;
  fake.merge(conv, {
    startedAt: new Date(Date.now() - DAY),
    personaId: 'ferni',
    turnCount: last.said?.length ?? 4,
    summarized: last.summary !== undefined,
    ...(last.summary !== undefined ? { summary: last.summary } : {}),
  });
  (last.said ?? []).forEach((content, i) =>
    fake.merge(`${conv}/turns/t${i}`, {
      role: 'user',
      content,
      timestamp: new Date(Date.now() - DAY + i * 1000),
    })
  );
}

/** A returning caller's profile; `summary` undefined means the field was never written. */
function seedProfile(uid: string, summary?: string) {
  fake.merge(`bogle_users/${uid}`, {
    totalConversations: 4,
    ...(summary !== undefined ? { lastConversationSummary: summary } : {}),
  });
}

/** The next call opens; resolves with the profile's last summary once the refill had its turn. */
async function nextCallOpens(uid: string, path: Path, settleMs = 60): Promise<string | undefined> {
  const services = await createSessionServices({
    sessionId: `sess-${uid}-${Math.random().toString(36).slice(2)}`,
    userId: uid,
    deferProfileLoad: path === 'deferred',
  });
  await new Promise((r) => {
    setTimeout(r, settleMs);
  });
  return services.userProfile?.lastConversationSummary;
}

beforeEach(() => {
  fake.docs.clear();
  Object.assign(fake.state, { topicsRead: 'ok', startWriteFails: false });
  resetForgetTopicsSource();
  store.getProfileForWrite = async (uid: string) => ({
    ...createUserProfile(uid, 'Sam'),
    ...profileOf(uid),
  });
});

/** What Sam's last call left behind about the divorce: ten summaries, ten turns-only calls. */
const DIVORCE_CALLS: Array<{ summary?: string; said?: string[] }> = [
  { summary: 'Sam talked about the divorce and the lawyer meeting on Friday' },
  { summary: 'Discussed: the divorce paperwork is finally filed' },
  { summary: 'Sam is anxious about telling the kids about the divorce' },
  { summary: 'Sam said the divorce mediation went badly' },
  { summary: 'Talked through how the divorce is affecting sleep' },
  { said: ['the divorce is going to court next month'] },
  { said: ['I keep thinking about the divorce', 'Alex says I should rest more'] },
  { said: ['my lawyer called about the divorce settlement'] },
  { said: ['the divorce makes the holidays hard this year'] },
  { said: ['I signed the divorce papers this morning'] },
];

describe('#2801: a forgotten topic stays out of the call-start refill', () => {
  it('20 next-call openers over both refills: none brings "the divorce" back', async () => {
    const openers: Array<{ path: Path; last: (typeof DIVORCE_CALLS)[number] }> = [
      ...DIVORCE_CALLS.map((last) => ({ path: 'loaded' as Path, last })),
      ...DIVORCE_CALLS.map((last) => ({ path: 'deferred' as Path, last })),
    ];
    const leaks: string[] = [];
    for (const [i, { path, last }] of openers.entries()) {
      const uid = `e2e-2801-sam-${i}`;
      seedLastCall(uid, last);
      // loaded: the profile never had a last summary; deferred: forgetTopic clears it to ''
      seedProfile(uid, path === 'deferred' ? 'Sam talked about the divorce' : undefined);
      // deferred: this call's own start write fails, so the last call is the newest one
      fake.state.startWriteFails = path === 'deferred';

      expect((await forgetTopic(uid, 'the divorce')).kind).toBe('forgotten');
      const before = profileOf(uid).lastConversationSummary;
      expect(before === undefined || before === '').toBe(true); // precondition: nothing to say

      const after = await nextCallOpens(uid, path);
      if (after && /divorce/i.test(after)) leaks.push(`${path} #${i}: ${after}`);
    }
    expect(leaks).toEqual([]);
  });

  it('never lower: an unrelated last call still refills, on both paths', async () => {
    const loaded = 'e2e-2801-sam-marathon-a';
    seedLastCall(loaded, { summary: 'Sam talked about the half marathon training' });
    seedProfile(loaded);
    expect(await nextCallOpens(loaded, 'loaded')).toBe(
      'Sam talked about the half marathon training'
    );

    const deferred = 'e2e-2801-sam-marathon-b';
    seedLastCall(deferred, { said: ['my half marathon is on Sunday'] });
    seedProfile(deferred, '');
    fake.state.startWriteFails = true;
    expect(await nextCallOpens(deferred, 'deferred')).toContain('half marathon');
  });

  it('fails closed: topics that throw or never answer mean no refill, even an unrelated one', async () => {
    fake.state.topicsRead = 'throws';
    const threw = 'e2e-2801-sam-throws';
    seedLastCall(threw, { summary: 'Sam talked about the half marathon training' });
    seedProfile(threw);
    expect(await nextCallOpens(threw, 'loaded')).toBeUndefined();

    fake.state.topicsRead = 'hangs';
    const hung = 'e2e-2801-sam-hangs';
    seedLastCall(hung, { summary: 'Sam talked about the half marathon training' });
    seedProfile(hung, '');
    // past the shared read's wait (forget-topics-source READ_TIMEOUT_MS)
    expect(await nextCallOpens(hung, 'deferred', 600)).toBe('');
  });

  it('the call in progress is not "last time": the refill reads the last finished call', async () => {
    const uid = 'e2e-2801-sam-current';
    seedLastCall(uid, { summary: 'Sam talked about the half marathon training' });
    seedProfile(uid, '');
    // startConversation writes this call's document, newer than the finished one
    const after = await nextCallOpens(uid, 'deferred');
    const convs = [...fake.docs.keys()].filter((k) => /\/conversations\/conv_[^/]+$/.test(k));
    expect(convs).toHaveLength(2); // precondition: the call in progress exists and is newest
    expect(after).toBe('Sam talked about the half marathon training');
  });
});

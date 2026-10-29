/**
 * #2767: the real endSession, including the call-end summary pass that runs
 * after the save (summarizeConversationAsync), keeps a topic forgotten mid-call
 * out of both last summaries and the next call's system prompt.
 * Fakes: the Firestore client (a document map; a save is a merge), the global
 * store over the same map, the profile cache, and the summary model.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  type Data = Record<string, unknown>;
  const docs = new Map<string, Data>();
  const state = { points: [] as string[] };
  const merge = (path: string, d: Data) => docs.set(path, { ...(docs.get(path) ?? {}), ...d });
  const snap = (path: string): any => ({
    id: path.split('/').pop(),
    exists: docs.has(path),
    data: () => docs.get(path),
  });
  const coll = (path: string): any => {
    const q: any = {
      doc: (id?: string) => ref(`${path}/${id ?? Math.random().toString(36).slice(2)}`),
      add: async (d: Data) => (merge(`${path}/${Math.random().toString(36).slice(2)}`, d), {}),
      where: () => q,
      orderBy: () => q,
      limit: () => q,
      get: async () => {
        const docsUnder = [...docs.keys()]
          .filter((k) => k.startsWith(`${path}/`) && !k.slice(path.length + 1).includes('/'))
          .sort()
          .map(snap);
        return { docs: docsUnder, empty: docsUnder.length === 0, size: docsUnder.length };
      },
    };
    return q;
  };
  const ref = (path: string): any => ({
    path,
    get: async () => snap(path),
    set: async (d: Data, o?: { merge?: boolean }) =>
      void (o?.merge ? merge(path, d) : docs.set(path, { ...d })),
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
  saveProfile: async (p: unknown) =>
    void fake.merge(`bogle_users/${(p as { id: string }).id}`, JSON.parse(JSON.stringify(p))),
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
vi.mock('../../../memory/index.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  // The call-end pass (summarizeConversationAsync) is called with the conversation id: tagged [bg].
  summarizeWithLLM: async (id: string) => ({
    id: `sum-${id}`,
    sessionId: id,
    timestamp: new Date(),
    duration: 10,
    turnCount: 4,
    mainTopics: [],
    keyPoints: fake.state.points.map((p) => (id.startsWith('conv_') ? `${p} [bg]` : p)),
    emotionalArc: '',
    callerProvenance: 1,
  }),
}));

const { createUserProfile } = await import('../../../types/user-profile.js');
const { createSessionServices } = await import('../session-manager.js');
const { forgetForCaller } = await import('../../../memory/recall/forget.js');
const { resetForgetTopicsSource } = await import('../../../memory/recall/forget-topics-source.js');
const { injectUserAwareness } =
  await import('../../../agents/voice-agent-entry/user-awareness-injection.js');

const UID = 'e2e-2767-endsession';
const FORGOTTEN = 'USER said Kestrel is pushing the custody hearing to March';
const KEPT = 'USER repotted the fig tree on the balcony';
const stored = (): any => fake.docs.get(`bogle_users/${UID}`) ?? {};

beforeEach(() => {
  fake.docs.clear();
  resetForgetTopicsSource();
  store.getProfileForWrite = async (uid: string) => ({
    ...createUserProfile(uid, 'Sam'),
    ...stored(),
  });
  fake.merge(`bogle_users/${UID}`, { totalConversations: 3 });
});

describe('#2767 through the real endSession', () => {
  it('a topic forgotten mid-call is in neither last summary nor the next system prompt', async () => {
    const services = await createSessionServices(`e2e-2767-${Date.now()}`, UID);
    services.addTurn('user', 'Kestrel moved the custody hearing again, and I repotted the fig');
    services.addTurn('assistant', 'That sounds like a lot.');
    expect((await forgetForCaller(UID, 'the custody hearing with Kestrel')).kind).toBe('forgotten');

    fake.state.points = [FORGOTTEN, KEPT];
    await services.endSession();
    await vi.waitFor(() => expect(stored().lastConversationSummary).toContain('[bg]')); // the pass ran

    const after = stored();
    expect(after.lastCallerSummary).toBe(KEPT);
    expect(after.lastConversationSummary).toBe(`${KEPT} [bg]`);
    const prompt = injectUserAwareness({
      sessionId: 'next',
      userProfile: { ...createUserProfile(UID, 'Sam'), ...after },
      userData: {},
      isReturningUser: true,
      sessionStartTime: new Date(),
    }).facts.join(' ');
    expect(prompt).toContain('fig tree');
    expect(prompt).not.toMatch(/Kestrel|custody/);
  });

  it('an older summary about the topic, still on the profile at the save, is not saved back', async () => {
    vi.stubEnv('KEEP_LAST_SUMMARY', 'on'); // a call with no key points keeps the last summaries
    fake.merge(`bogle_users/${UID}`, {
      lastConversationSummary: FORGOTTEN,
      lastCallerSummary: FORGOTTEN,
    });
    const services = await createSessionServices(`e2e-2767-${Date.now()}`, UID);
    services.addTurn('user', 'Honestly forget all of that, I just want to talk about my week');
    services.addTurn('assistant', 'Of course.');
    expect((await forgetForCaller(UID, 'the custody hearing with Kestrel')).kind).toBe('forgotten');

    fake.state.points = [];
    await services.endSession();
    await new Promise((r) => {
      setTimeout(r, 50);
    }); // the call-end pass (it writes nothing here)

    const after = stored();
    expect(`${after.lastCallerSummary} ${after.lastConversationSummary}`).not.toMatch(
      /Kestrel|custody/
    );
    vi.unstubAllEnvs();
  });
});

/**
 * F1: endSession builds its final save from the profile loaded at call start, so a name
 * confirmed after any mid-call save (which swaps services.userProfile for a copy) was written
 * back to the old one. Fakes as last-summary-endsession.test.ts: a document map, a save is a merge.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
// The summary model, as in last-summary-endsession.test.ts: the end save's summary pass and the
// call-end pass (summarizeConversationAsync) both reach it, and tests build no real model client.
vi.mock('../../../memory/index.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  summarizeWithLLM: async (id: string) => ({
    id: `sum-${id}`,
    sessionId: id,
    timestamp: new Date(),
    duration: 10,
    turnCount: 4,
    mainTopics: [],
    keyPoints: [],
    emotionalArc: '',
    callerProvenance: 1,
  }),
}));

const { createUserProfile } = await import('../../../types/user-profile.js');
const { createSessionServices } = await import('../session-manager.js');

const UID = 'name-end-save-sam';
const stored = (): any => fake.docs.get(`bogle_users/${UID}`) ?? {};

/** What rememberName's save does (remember-name.ts save): set the name on the live profile, save. */
async function confirmName(services: any, name: string): Promise<void> {
  services.userProfile.name = name;
  services.userProfile.preferredName = name;
  await services.saveProfile();
}

beforeEach(() => {
  fake.docs.clear();
  store.getProfileForWrite = async (uid: string) => ({
    ...createUserProfile(uid, 'Sam'),
    ...stored(),
  });
  fake.merge(`bogle_users/${UID}`, { name: 'Sam', preferredName: 'Sam', totalConversations: 3 });
});

/** A call that confirms Jess; `midCallSave` first runs the periodic save (turn 3). */
async function callConfirmingJess(midCallSave: boolean): Promise<void> {
  const services = await createSessionServices(`name-end-${Math.random()}`, UID);
  services.addTurn('user', 'Morning, can you help me plan the week');
  services.addTurn('assistant', 'Sure, what is on it?');
  if (midCallSave) await services.saveProfile(); // services.userProfile becomes a copy
  await confirmName(services, 'Jess');
  expect(stored().preferredName).toBe('Jess'); // pre: the yes itself was saved
  await services.endSession();
}

describe('NAME_SURVIVES_END_SAVE: a name confirmed on the call survives the end-of-call save', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('on: confirmed after a mid-call save, the confirmed name is what stays stored', async () => {
    vi.stubEnv('NAME_SURVIVES_END_SAVE', 'on');
    await callConfirmingJess(true);
    expect(stored().preferredName).toBe('Jess');
    expect(stored().name).toBe('Jess');
  });

  it('on: the call is counted as on main (the end save keeps its call-start base)', async () => {
    vi.stubEnv('NAME_SURVIVES_END_SAVE', 'off');
    await callConfirmingJess(true);
    const offCount = stored().totalConversations;
    fake.docs.clear();
    fake.merge(`bogle_users/${UID}`, { name: 'Sam', preferredName: 'Sam', totalConversations: 3 });
    vi.stubEnv('NAME_SURVIVES_END_SAVE', 'on');
    await callConfirmingJess(true);
    expect(stored().totalConversations).toBe(offCount);
  });

  it('off == main: the end-of-call save writes the call-start name back', async () => {
    vi.stubEnv('NAME_SURVIVES_END_SAVE', 'off');
    await callConfirmingJess(true);
    expect(stored().preferredName).toBe('Sam');
  });

  it('either way: with no mid-call save the confirmed name stays stored', async () => {
    vi.stubEnv('NAME_SURVIVES_END_SAVE', 'off');
    await callConfirmingJess(false);
    expect(stored().preferredName).toBe('Jess');
  });
});

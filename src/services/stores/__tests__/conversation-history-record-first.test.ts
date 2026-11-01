/**
 * recordSession (the web app's hang-up) makes the caller's user record when there is none,
 * so a brand-new caller's first session lands (#2982). It may do that only for an account
 * Firebase says is live right now: a token keeps verifying for a while after its account
 * is erased, and the record would bring the erased user back (#2966, the #3224 verifier's
 * probe). These run the real engagement store on a fake Firestore whose docs also hold the
 * user records, so "nothing written" is read from one place.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeEngagementFirestore,
  type FakeEngagementFirestore,
} from '../../engagement/__tests__/fake-engagement-firestore.js';
import type { AccountNow } from '../../identity/account-live-now.js';

const fake = vi.hoisted(() => ({
  db: null as unknown,
  docs: null as Map<string, Record<string, unknown>> | null,
  account: vi.fn<(uid: string) => Promise<AccountNow>>(),
}));
vi.mock('@google-cloud/firestore', () => ({
  Firestore: class {
    constructor() {
      return fake.db as object;
    }
  },
}));
vi.mock('../../identity/account-live-now.js', () => ({ accountLiveNow: fake.account }));
/** The user store, over the same docs: bogle_users/{uid} */
vi.mock('../../../memory/store-factory.js', () => ({
  getStore: async () => ({
    getProfileForWrite: async (uid: string) => fake.docs?.get(`bogle_users/${uid}`) ?? null,
    getOrCreateProfile: async (uid: string) => {
      const path = `bogle_users/${uid}`;
      if (!fake.docs?.has(path)) fake.docs?.set(path, { userId: uid, totalConversations: 0 });
      return fake.docs?.get(path);
    },
  }),
}));

const UID = 'Qm4Vx8Kp2Rt6Ls0Nw3Hd9Fb5Gc1Z';
const SESSION = {
  personaId: 'ferni',
  personaName: 'Ferni',
  duration: 12,
  messageCount: 9,
  insights: ['a long walk by the water'],
  highlights: [],
  topicsDiscussed: ['walks'],
};
let firestore: FakeEngagementFirestore;

/** The service as a fresh process loads it: nothing cached about any account */
async function freshService() {
  vi.resetModules();
  const { getConversationHistoryService } = await import('../conversation-history.js');
  return getConversationHistoryService();
}

const written = () =>
  [...firestore.docs.keys()].filter(
    (path) => path === `bogle_users/${UID}` || path.startsWith(`engagement_profiles/${UID}`)
  );
const sessions = () =>
  [...firestore.docs.keys()].filter((path) =>
    path.startsWith(`engagement_profiles/${UID}/conversation_sessions/`)
  );

beforeEach(() => {
  firestore = createFakeEngagementFirestore(); // what a finished erasure leaves: nothing for UID
  fake.db = firestore.db;
  fake.docs = firestore.docs as Map<string, Record<string, unknown>>;
  fake.account.mockReset();
});

describe('recordSession with no user record', () => {
  it('after a finished erasure (Firebase has no such user) writes nothing', async () => {
    fake.account.mockResolvedValue('gone');
    const service = await freshService();

    await service.recordSession(UID, SESSION);

    expect(fake.account).toHaveBeenCalledWith(UID);
    expect(written()).toEqual([]);
  });

  it('for a disabled account writes nothing', async () => {
    fake.account.mockResolvedValue('disabled');
    const service = await freshService();

    await service.recordSession(UID, SESSION);

    expect(written()).toEqual([]);
  });

  it('when the account check is unavailable writes nothing and reports the save failed', async () => {
    fake.account.mockResolvedValue('unavailable');
    const service = await freshService();

    await expect(service.recordSession(UID, SESSION)).rejects.toThrow();

    expect(written()).toEqual([]);
  });

  it('for a brand-new live account makes the record, then the session lands', async () => {
    fake.account.mockResolvedValue('live');
    const service = await freshService();
    expect(written()).toEqual([]);

    await service.recordSession(UID, SESSION);

    expect(firestore.docs.has(`bogle_users/${UID}`)).toBe(true);
    expect(sessions()).toHaveLength(1);
    const [path] = sessions();
    expect(firestore.docs.get(path)).toMatchObject({ insights: SESSION.insights });
  });
});

describe('recordSession with a user record', () => {
  it("an existing caller's hang-up lands without asking Firebase", async () => {
    firestore.docs.set(`bogle_users/${UID}`, { userId: UID, totalConversations: 3 });
    const service = await freshService();

    await service.recordSession(UID, SESSION);

    expect(fake.account).not.toHaveBeenCalled();
    expect(sessions()).toHaveLength(1);
  });

  it('a record marked erasing gets no session (and no account check)', async () => {
    firestore.docs.set(`bogle_users/${UID}`, { userId: UID, erasing: true });
    const service = await freshService();

    await service.recordSession(UID, SESSION);

    expect(fake.account).not.toHaveBeenCalled();
    expect(sessions()).toEqual([]);
  });
});

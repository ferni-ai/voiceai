/**
 * A web hang-up during an account deletion. The deletion erases the data first and deletes
 * the Firebase user last, and that last step can fail (gdpr-routes treats it as best-effort).
 * A hang-up's record-first save asks Firebase whether the account is live
 * (account-live-now.ts), so the deletion switches the sign-in off before any data goes
 * (erasure-sign-in.ts): in the window, and after a failed delete, the account reads disabled
 * and the hang-up writes nothing. Runs the real sign-in switch, account check, history
 * service and engagement store over a fake Firebase user table and a fake Firestore.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeEngagementFirestore,
  type FakeEngagementFirestore,
} from '../../engagement/__tests__/fake-engagement-firestore.js';

const fake = vi.hoisted(() => ({
  db: null as unknown,
  docs: null as Map<string, Record<string, unknown>> | null,
  users: new Map<string, { uid: string; disabled: boolean }>(),
  deleteWorks: true,
}));
vi.mock('@google-cloud/firestore', () => ({
  Firestore: class {
    constructor() {
      return fake.db as object;
    }
  },
}));
/** Firebase Auth, as a table of users */
vi.mock('../../identity/firebase-auth.js', () => ({
  getFirebaseUserOrThrow: async (uid: string) => {
    const user = fake.users.get(uid);
    return user ? { ...user } : null;
  },
  setFirebaseUserDisabled: async (uid: string, disabled: boolean) => {
    const user = fake.users.get(uid);
    if (!user) return 'no_user';
    user.disabled = disabled;
    return 'done';
  },
  deleteFirebaseUser: async (uid: string) => fake.deleteWorks && fake.users.delete(uid),
}));
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

const UID = 'Tb6Nq1Vx8Lr3Kc5Wm9Hs2Pd7Gj4Y';
const SESSION = {
  personaId: 'ferni',
  personaName: 'Ferni',
  duration: 7,
  messageCount: 6,
  insights: ['a long walk by the water'],
  highlights: [],
  topicsDiscussed: ['walks'],
};
let firestore: FakeEngagementFirestore;

const forUser = () =>
  [...firestore.docs.keys()].filter(
    (path) => path === `bogle_users/${UID}` || path.startsWith(`engagement_profiles/${UID}`)
  );

/** What the data sweep does to Firestore: everything for UID goes */
const eraseData = async (): Promise<Record<string, boolean>> => {
  for (const path of forUser()) firestore.docs.delete(path);
  return { profile: true, engagement: true };
};

async function hangUp(): Promise<void> {
  vi.resetModules(); // another instance: nothing cached about the account
  const { getConversationHistoryService } = await import('../conversation-history.js');
  await getConversationHistoryService().recordSession(UID, SESSION);
}

beforeEach(() => {
  firestore = createFakeEngagementFirestore();
  fake.db = firestore.db;
  fake.docs = firestore.docs as Map<string, Record<string, unknown>>;
  fake.users = new Map([[UID, { uid: UID, disabled: false }]]);
  fake.deleteWorks = true;
  firestore.docs.set(`bogle_users/${UID}`, { userId: UID, totalConversations: 4 });
  firestore.docs.set(`engagement_profiles/${UID}`, { userId: UID });
});

describe('a hang-up during an account deletion', () => {
  it('in the window (data gone, Firebase user not yet deleted) writes nothing', async () => {
    const { eraseWithSignInOff } = await import('../../identity/erasure-sign-in.js');

    await eraseWithSignInOff(UID, async () => {
      const results = await eraseData();
      await hangUp(); // the record is gone, the Firebase user is still there
      expect(forUser()).toEqual([]);
      return results;
    });

    expect(fake.users.get(UID)?.disabled).toBe(true);
    expect(forUser()).toEqual([]);
  });

  it('after the final delete failed, still writes nothing', async () => {
    const { eraseWithSignInOff, deleteSignInAfterErasure } =
      await import('../../identity/erasure-sign-in.js');
    fake.deleteWorks = false;

    await eraseWithSignInOff(UID, eraseData);
    expect(await deleteSignInAfterErasure(UID)).toBe(false);
    await hangUp();

    expect(fake.users.has(UID)).toBe(true);
    expect(forUser()).toEqual([]);
  });

  it('once the deletion finished, writes nothing', async () => {
    const { eraseWithSignInOff, deleteSignInAfterErasure } =
      await import('../../identity/erasure-sign-in.js');

    await eraseWithSignInOff(UID, eraseData);
    expect(await deleteSignInAfterErasure(UID)).toBe(true);
    await hangUp();

    expect(forUser()).toEqual([]);
  });

  it('with no deletion, a live caller whose record went missing gets it back (the check can pass)', async () => {
    for (const path of forUser()) firestore.docs.delete(path);

    await hangUp();

    expect(firestore.docs.has(`bogle_users/${UID}`)).toBe(true);
  });
});

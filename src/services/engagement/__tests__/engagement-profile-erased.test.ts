/**
 * An erased person's engagement profile is never recreated.
 *
 * Before: getProfile created a default profile for any uid it couldn't find and
 * saveProfile wrote whatever the process had cached, so a menu route on the app's
 * still-valid ID token, a live call's cached profile or a background job brought
 * engagement_profiles/{uid} back after account deletion. The prod orphan audit found 13.
 * Each case runs the real store (getProfile / saveProfile) on an in-memory Firestore.
 * Only an explicit erasure blocks a write (the record's `erasing` mark, or this process
 * having erased the account, utils/erasing-mark.ts); a uid with no record is a new user.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { erasingMark, noteErasedHere } from '../../../utils/erasing-mark.js';
import {
  createFakeEngagementFirestore,
  type FakeEngagementFirestore,
} from './fake-engagement-firestore.js';

const fake = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('@google-cloud/firestore', () => ({
  Firestore: class {
    constructor() {
      return fake.db as object;
    }
  },
}));

import { getEngagementStore, resetEngagementStore } from '../engagement-store.js';

const USER = 'Zq7Kp2Lm9Xc4Vb8Nn1Rt5Yw3Hs6D';
const PROFILE = `engagement_profiles/${USER}`;
const RECORD = `bogle_users/${USER}`;

let firestore: FakeEngagementFirestore;

beforeEach(() => {
  firestore = createFakeEngagementFirestore();
  fake.db = firestore.db;
  resetEngagementStore();
});

describe('engagement profile after account erasure', () => {
  it('getProfile for an account this process erased (no record, no profile) writes nothing', async () => {
    const gone = 'Gq2Wd7Lp4Xn9Rb6Ts1Vk8Hm3Jc5F';
    noteErasedHere(gone); // what markErasing does in this process
    const store = await getEngagementStore();

    const profile = await store.getProfile(gone);
    await store.saveProfile({ ...profile, totalRitualDays: 3 });

    expect(firestore.docs.has(`engagement_profiles/${gone}`)).toBe(false);
  });

  it('a brand-new uid with no record and no profile gets its default profile', async () => {
    expect(firestore.docs.has(RECORD)).toBe(false);
    const store = await getEngagementStore();

    await store.getProfile(USER);

    expect(firestore.docs.get(PROFILE)).toMatchObject({ userId: USER, totalRitualDays: 0 });
  });

  it("a live call's cached profile is not written back once the account is erased", async () => {
    const leaving = 'Nm5Kc8Rt1Qw4Zp7Lx2Vb9Hd6Js3G';
    const [record, saved] = [`bogle_users/${leaving}`, `engagement_profiles/${leaving}`];
    firestore.docs.set(record, { name: 'live' });
    const store = await getEngagementStore();
    const profile = await store.getProfile(leaving); // created and cached while the user was live
    expect(firestore.docs.has(saved)).toBe(true);

    noteErasedHere(leaving); // account erasure: marked, the profile goes, then the record
    firestore.docs.delete(saved);
    firestore.docs.delete(record);
    profile.totalRitualDays = 9;
    await store.saveProfile(profile);
    expect(firestore.docs.has(saved)).toBe(false);

    // The cached copy went with the dropped write, so a later read doesn't bring it back
    expect((await store.getProfile(leaving)).totalRitualDays).toBe(0);
    expect(firestore.docs.has(saved)).toBe(false);
  });

  it('nothing is written while an erasure is running (the record is marked erasing)', async () => {
    firestore.docs.set(RECORD, { name: 'going', ...erasingMark() });
    const store = await getEngagementStore();

    await store.getProfile(USER);

    expect(firestore.docs.has(PROFILE)).toBe(false);
  });

  it('a live user without a profile still gets one', async () => {
    firestore.docs.set(RECORD, { name: 'live' });
    const store = await getEngagementStore();

    await store.getProfile(USER);

    expect(firestore.docs.get(PROFILE)).toMatchObject({ userId: USER, totalRitualDays: 0 });
  });

  it('a profile that exists is still updated when its key has no record', async () => {
    firestore.docs.set(PROFILE, { userId: USER, totalRitualDays: 4 });
    const store = await getEngagementStore();

    const profile = await store.getProfile(USER);
    profile.totalRitualDays = 5;
    await store.saveProfile(profile);

    expect(firestore.docs.get(PROFILE)).toMatchObject({ totalRitualDays: 5 });
  });
});

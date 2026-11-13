/**
 * Signing in after an anonymous or try-first call copies that call's crisis_signals doc into the
 * account (identity-linking.ts copyTree). Every crisis record is kept permanently (2026-11-11):
 * the copy keeps the signals and time exactly and carries no expireAt, not even one an older
 * record was written with, and the account's 14-day crisis quiet still holds, because the quiet
 * check reads the copied doc.
 * Movers: linkIdentity and linkVerifiedAnonymousIdentity copy a non-member's doc; migrateUserData
 * (step 7) only ever moves a stored device profile, which a try-first visitor never has
 * (profile-save-guard).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { docs, db } = await vi.hoisted(async () =>
  (await import('./fake-firestore-tree.js')).fakeFirestoreTree()
);
vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => db }));
const store = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../../../memory/firestore-store.js', () => ({ getFirestoreStore: () => store.current }));

const { linkIdentity, linkVerifiedAnonymousIdentity } = await import('../identity-linking.js');
const { migrateUserData } = await import('../../user-migration.js');
const { CRISIS_QUIET_DAYS, hadCrisisWithin } =
  await import('../../human-transfer/crisis-signals.js');
const { pathFirestore } =
  await import('../../outreach/proactive-channels/__tests__/path-firestore.js');

const UID = 'AbCdEfGhIjKlMnOpQrStUvWxYz12';
/** A Firebase anonymous account's uid: its doc id carries no prefix. */
const ANON_UID = 'ZyXwVuTsRqPoNmLkJiHgFeDcBa34';
const DAY = 86_400_000;
const CALLED = new Date('2026-11-02T17:00:00Z');
const SIGNALS = { suicidalIdeation: true, selfHarmIndicators: false, severity: 9 };
/** A non-member's record as the writer stores it now: tier, time and turn. */
const RECORD = { timestamp: CALLED.toISOString(), signals: SIGNALS, turn: 3 };
/** One written before the permanent rule: the same, with a 90-day expireAt. */
const OLDER_RECORD = { ...RECORD, expireAt: new Date(CALLED.getTime() + 90 * DAY) };

function seedCrisis(sourceId: string, record: Record<string, unknown>): void {
  docs.set(`bogle_users/${sourceId}`, { totalConversations: 1 });
  docs.set(`bogle_users/${sourceId}/crisis_signals/s1`, structuredClone(record));
}
const copied = () => docs.get(`bogle_users/${UID}/crisis_signals/s1`);

/** The account's copy: the record exactly, no expiry, and the next day is still quiet. */
async function expectKeptPermanently(sourceId: string): Promise<void> {
  expect(copied()).toEqual({
    ...RECORD,
    _migratedFrom: sourceId,
    _migratedAt: expect.any(String),
  });
  const nextDay = new Date(CALLED.getTime() + DAY);
  expect(await hadCrisisWithin(pathFirestore(docs) as never, UID, CRISIS_QUIET_DAYS, nextDay)).toBe(
    true
  );
}

beforeEach(async () => {
  docs.clear();
  const { InMemoryStore } = await import('../../../memory/storage/in-memory-store.js');
  if (!store.current) store.current = new InMemoryStore();
});

describe('a linked crisis record is kept permanently', () => {
  it.each([
    ['a record', RECORD],
    ['an older record written with an expireAt', OLDER_RECORD],
  ])('linkIdentity from an anon: id: %s', async (_name, record) => {
    seedCrisis('anon:call-7f3a', record);
    expect((await linkIdentity('anon:call-7f3a', UID)).success).toBe(true);
    await expectKeptPermanently('anon:call-7f3a');
  });

  it.each([
    ['a record', RECORD],
    ['an older record written with an expireAt', OLDER_RECORD],
  ])('linkVerifiedAnonymousIdentity from an anonymous account: %s', async (_name, record) => {
    seedCrisis(ANON_UID, record);
    const anonToken = { uid: ANON_UID, signInProvider: 'anonymous' };
    expect((await linkVerifiedAnonymousIdentity(anonToken, UID)).success).toBe(true);
    await expectKeptPermanently(ANON_UID);
  });

  it('migrateUserData never reaches step 7 for a try-first device: it has no profile to move', async () => {
    seedCrisis('device:demo_1730000000_cd34', RECORD);
    expect(
      await migrateUserData({ deviceId: 'device:demo_1730000000_cd34', firebaseUid: UID })
    ).toMatchObject({ success: true });
    expect(copied()).toBeUndefined(); // nothing copies it: the auto-link path that did was removed
  });

  it("migrateUserData (step 7) moves a member device's record, dropping older words", async () => {
    const { createUserProfile } = await import('../../../types/user-profile.js');
    await (store.current as { saveProfile: (p: unknown) => Promise<void> }).saveProfile(
      createUserProfile('device:d8', 'On my phone')
    );
    const member = { ...RECORD, sessionId: 'session-m-1' };
    // An older member record still holding words (fictional), written before 2026-11-12
    const older = { ...member, transcriptSnippet: 'a line written for this test' };
    docs.set('bogle_users/device:d8/crisis_signals/s1', structuredClone(older));
    expect(await migrateUserData({ deviceId: 'device:d8', firebaseUid: UID })).toMatchObject({
      success: true,
    });
    expect(copied()).toEqual({
      ...member,
      _migratedFrom: 'device:d8',
      _migratedAt: expect.any(String),
    });
  });

  it('only crisis records lose an expireAt: other stores keep their own TTL dates', async () => {
    const expireAt = new Date(CALLED.getTime() + 30 * DAY);
    docs.set('bogle_users/anon:call-7f3a', { totalConversations: 1 });
    docs.set('bogle_users/anon:call-7f3a/reminders/r1', { at: 'noon', expireAt });
    expect((await linkIdentity('anon:call-7f3a', UID)).success).toBe(true);
    expect(docs.get(`bogle_users/${UID}/reminders/r1`)?.expireAt).toEqual(expireAt);
  });
});

/**
 * The orphan audit against the Firestore and Auth emulators. Every id here is invented.
 *
 * A deleted person is a uid with records and no Firebase user and no bogle_users record.
 * The audit must count exactly those, never a live user or a phone-keyed profile, print
 * no id, and delete only what it counted, and only behind the matching CONFIRM count.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getAuth } from 'firebase-admin/auth';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { runAudit } from '../orphaned-erasure-audit.js';

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST && !!process.env.FIREBASE_AUTH_EMULATOR_HOST;
const PROJECT = 'demo-orphan-audit';

/** 28 characters of letters and digits, the shape a Firebase uid has */
const uid = (seed: string): string => seed.repeat(14);
const GONE = uid('d1');
const GONE_RECORD_ONLY = uid('d2');
const LIVE = uid('l2');
const PHONE = 'phone:+15555550100';
const PHONE_SHAPED = '+15555550123';

const AUDIT = { deleteRequested: false, confirm: undefined };

let db: Firestore;
let auth: ReturnType<typeof getAuth>;

async function clearEmulators(): Promise<void> {
  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  await fetch(
    `http://${firestoreHost}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`,
    {
      method: 'DELETE',
    }
  );
  await fetch(`http://${authHost}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
}

beforeAll(() => {
  if (!emulator) return;
  const app =
    getApps().find((a) => a.name === 'orphan-audit-test') ??
    initializeApp({ projectId: PROJECT }, 'orphan-audit-test');
  db = getFirestore(app);
  auth = getAuth(app);
});

beforeEach(async () => {
  if (!emulator) return;
  await clearEmulators();
});

/** A deleted person with a leftover in each of three stores, one of them answer_cards */
async function seedDeleted(who: string): Promise<void> {
  await db.doc(`user_seeds/${who}`).set({ balance: 3 });
  await db.doc(`user_seeds/${who}/history/h1`).set({ amount: 1 }); // a subcollection under the record
  await db.collection('contact_relationships').add({ userId: who, name: 'friend' });
  await db.collection('answer_cards').add({ userId: who, card: 'c1' });
}

describe.skipIf(!emulator)('orphaned erasure audit', () => {
  it('counts one deleted user with leftovers in three stores as three', async () => {
    await seedDeleted(GONE);
    const run = await runAudit({ db, auth, ...AUDIT });
    expect(run.total).toBe(3);
    const seeds = run.lines.find((line) => line.startsWith('user_seeds/{uid}'));
    expect(seeds).toMatch(/orphaned keys 1 {2}docs 1$/);
  });

  it("counts a uid entry in another person's map and deletes only that entry", async () => {
    await db
      .doc('consent/contact1')
      .set({ grants: { [GONE]: { ok: true }, [LIVE]: { ok: true } } });
    await auth.createUser({ uid: LIVE });
    const counted = await runAudit({ db, auth, ...AUDIT });
    expect(counted.total).toBe(1);

    const run = await runAudit({ db, auth, deleteRequested: true, confirm: '1' });
    expect(run.erased).toBe(1);
    const grants = (await db.doc('consent/contact1').get()).get('grants') as Record<
      string,
      unknown
    >;
    expect(Object.keys(grants)).toEqual([LIVE]);
  });

  it('counts a live Firebase user as zero', async () => {
    await auth.createUser({ uid: LIVE });
    await db.doc(`user_seeds/${LIVE}`).set({ balance: 5 });
    await db.collection('answer_cards').add({ userId: LIVE, card: 'c2' });
    const run = await runAudit({ db, auth, ...AUDIT });
    expect(run.total).toBe(0);
  });

  it('counts a phone-only user with a bogle_users record as zero', async () => {
    await db.doc(`bogle_users/${PHONE}`).set({ linkedIdentifiers: [PHONE] });
    await db.doc(`user_seeds/${PHONE}`).set({ balance: 1 });
    const run = await runAudit({ db, auth, ...AUDIT });
    expect(run.total).toBe(0);
  });

  it('counts a phone-shaped id with no bogle_users record as zero', async () => {
    await db.collection('answer_cards').add({ userId: PHONE_SHAPED, card: 'c3' });
    const run = await runAudit({ db, auth, ...AUDIT });
    expect(run.total).toBe(0);
  });

  it('counts a user whose bogle_users record survives as zero', async () => {
    await db.doc(`bogle_users/${GONE_RECORD_ONLY}`).set({ marker: 'kept' });
    await db.doc(`user_seeds/${GONE_RECORD_ONLY}`).set({ balance: 2 });
    const run = await runAudit({ db, auth, ...AUDIT });
    expect(run.total).toBe(0);
  });

  it('prints no id, uid, phone or document content', async () => {
    await seedDeleted(GONE);
    await auth.createUser({ uid: LIVE });
    await db.doc(`bogle_users/${PHONE}`).set({ linkedIdentifiers: [PHONE] });
    await db.collection('answer_cards').add({ userId: PHONE_SHAPED, card: 'c4' });
    const run = await runAudit({ db, auth, ...AUDIT });
    const output = run.lines.join('\n');
    for (const secret of [GONE, LIVE, PHONE, PHONE_SHAPED, 'phone:', 'c4']) {
      expect(output).not.toContain(secret);
    }
  });

  it('refuses --delete without the matching CONFIRM count and deletes nothing', async () => {
    await seedDeleted(GONE);
    const none = await runAudit({ db, auth, deleteRequested: true, confirm: undefined });
    const wrong = await runAudit({ db, auth, deleteRequested: true, confirm: '2' });
    expect(none.refused).toBe(true);
    expect(wrong.refused).toBe(true);
    expect((await db.doc(`user_seeds/${GONE}`).get()).exists).toBe(true);
  });

  it('deletes exactly the counted records and nothing else', async () => {
    await seedDeleted(GONE);
    await auth.createUser({ uid: LIVE });
    await db.doc(`user_seeds/${LIVE}`).set({ balance: 5 });
    await db.doc(`bogle_users/${PHONE}`).set({ linkedIdentifiers: [PHONE] });
    await db.doc(`user_seeds/${PHONE}`).set({ balance: 1 });
    await db.doc('unrelated/doc').set({ keep: true });

    const run = await runAudit({ db, auth, deleteRequested: true, confirm: '3' });
    expect(run.refused).toBe(false);
    expect(run.erased).toBe(3);

    expect((await db.doc(`user_seeds/${GONE}`).get()).exists).toBe(false);
    expect((await db.doc(`user_seeds/${GONE}/history/h1`).get()).exists).toBe(false);
    expect(
      (await db.collection('contact_relationships').where('userId', '==', GONE).get()).empty
    ).toBe(true);
    expect((await db.collection('answer_cards').where('userId', '==', GONE).get()).empty).toBe(
      true
    );

    expect((await db.doc(`user_seeds/${LIVE}`).get()).exists).toBe(true);
    expect((await db.doc(`user_seeds/${PHONE}`).get()).exists).toBe(true);
    expect((await db.doc(`bogle_users/${PHONE}`).get()).exists).toBe(true);
    expect((await db.doc('unrelated/doc').get()).exists).toBe(true);
  });
});

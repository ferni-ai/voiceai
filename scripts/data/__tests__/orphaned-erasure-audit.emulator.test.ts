/**
 * The orphan audit against the Firestore and Auth emulators. Every id here is invented.
 *
 * A deleted person is a uid with records and no Firebase user and no bogle_users record.
 * The audit must count exactly those, never a live user or a phone-keyed profile, print
 * no id, and change nothing.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// vitest.config.unit.ts's setup mocks firebase-admin (initializeApp is a no-op), so the
// app below was never made and getAuth fell back to a default app that doesn't exist.
// This test runs against the real emulators under either config.
vi.unmock('firebase-admin/app');
vi.unmock('firebase-admin/firestore');
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { openDatabase, runAudit } from '../orphaned-erasure-audit.js';

/** The database id a Firestore instance is bound to */
const databaseIdOf = (db: Firestore): string =>
  (db as unknown as { databaseId: string }).databaseId;

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST && !!process.env.FIREBASE_AUTH_EMULATOR_HOST;
const PROJECT = 'demo-orphan-audit';

/** 28 characters of letters and digits, the shape a Firebase uid has */
const uid = (seed: string): string => seed.repeat(14);
const GONE = uid('d1');
const GONE_RECORD_ONLY = uid('d2');
const LIVE = uid('l2');
const PHONE = 'phone:+15555550100';
const PHONE_SHAPED = '+15555550123';

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
    const run = await runAudit({ db, auth });
    expect(run.total).toBe(3);
    const seeds = run.lines.find((line) => line.startsWith('user_seeds/{uid}'));
    expect(seeds).toMatch(/orphaned keys 1 {2}docs 1$/);
  });

  it("counts a uid entry in another person's map", async () => {
    await db
      .doc('consent/contact1')
      .set({ grants: { [GONE]: { ok: true }, [LIVE]: { ok: true } } });
    await auth.createUser({ uid: LIVE });
    const counted = await runAudit({ db, auth });
    expect(counted.total).toBe(1);
    const grants = (await db.doc('consent/contact1').get()).get('grants') as Record<
      string,
      unknown
    >;
    expect(Object.keys(grants).sort()).toEqual([GONE, LIVE].sort());
  });

  it('counts a live Firebase user as zero', async () => {
    await auth.createUser({ uid: LIVE });
    await db.doc(`user_seeds/${LIVE}`).set({ balance: 5 });
    await db.collection('answer_cards').add({ userId: LIVE, card: 'c2' });
    const run = await runAudit({ db, auth });
    expect(run.total).toBe(0);
  });

  it('counts a phone-only user with a bogle_users record as zero', async () => {
    await db.doc(`bogle_users/${PHONE}`).set({ linkedIdentifiers: [PHONE] });
    await db.doc(`user_seeds/${PHONE}`).set({ balance: 1 });
    const run = await runAudit({ db, auth });
    expect(run.total).toBe(0);
  });

  it('counts a phone-shaped id with no bogle_users record as zero', async () => {
    await db.collection('answer_cards').add({ userId: PHONE_SHAPED, card: 'c3' });
    const run = await runAudit({ db, auth });
    expect(run.total).toBe(0);
  });

  it('counts a user whose bogle_users record survives as zero', async () => {
    await db.doc(`bogle_users/${GONE_RECORD_ONLY}`).set({ marker: 'kept' });
    await db.doc(`user_seeds/${GONE_RECORD_ONLY}`).set({ balance: 2 });
    const run = await runAudit({ db, auth });
    expect(run.total).toBe(0);
  });

  it('prints no id, uid, phone or document content', async () => {
    await seedDeleted(GONE);
    await auth.createUser({ uid: LIVE });
    await db.doc(`bogle_users/${PHONE}`).set({ linkedIdentifiers: [PHONE] });
    await db.collection('answer_cards').add({ userId: PHONE_SHAPED, card: 'c4' });
    const run = await runAudit({ db, auth });
    const output = run.lines.join('\n');
    for (const secret of [GONE, LIVE, PHONE, PHONE_SHAPED, 'phone:', 'c4']) {
      expect(output).not.toContain(secret);
    }
  });

  it('changes nothing: every seeded record is still there after a run that counted them', async () => {
    await seedDeleted(GONE);
    await auth.createUser({ uid: LIVE });
    await db.doc(`user_seeds/${LIVE}`).set({ balance: 5 });
    await db.doc('unrelated/doc').set({ keep: true });

    const run = await runAudit({ db, auth });
    expect(run.total).toBe(3);

    expect((await db.doc(`user_seeds/${GONE}`).get()).get('balance')).toBe(3);
    expect((await db.doc(`user_seeds/${GONE}/history/h1`).get()).exists).toBe(true);
    expect(
      (await db.collection('contact_relationships').where('userId', '==', GONE).get()).size
    ).toBe(1);
    expect((await db.collection('answer_cards').where('userId', '==', GONE).get()).size).toBe(1);
    expect((await db.doc(`user_seeds/${LIVE}`).get()).exists).toBe(true);
    expect((await db.doc('unrelated/doc').get()).exists).toBe(true);
  });

  it('counts across more than one Auth lookup batch', async () => {
    const many = Array.from(
      { length: 150 },
      (_, i) => `${String(i).padStart(6, '0')}${'a'.repeat(22)}`
    );
    const batch = db.batch();
    for (const who of many) batch.set(db.doc(`user_seeds/${who}`), { balance: 1 });
    await batch.commit();
    const run = await runAudit({ db, auth });
    expect(run.total).toBe(150);
  });

  it('aborts when Firebase Auth cannot be read, rather than counting users as missing', async () => {
    await seedDeleted(GONE);
    const unreadable = {
      getUsers: async () => {
        throw new Error('auth/internal-error');
      },
    } as unknown as Auth;
    await expect(runAudit({ db, auth: unreadable })).rejects.toThrow('auth/internal-error');
  });

  it('reads the database FIRESTORE_DATABASE names, and the default when it is unset', async () => {
    const app = getApps().find((a) => a.name === 'orphan-audit-test');
    expect(app).toBeDefined();
    vi.stubEnv('FIRESTORE_DATABASE', 'orphan-audit-named');
    expect(databaseIdOf(openDatabase(app!))).toBe('orphan-audit-named');
    vi.stubEnv('FIRESTORE_DATABASE', '');
    expect(databaseIdOf(openDatabase(app!))).toBe('(default)');
    vi.unstubAllEnvs();
  });
});

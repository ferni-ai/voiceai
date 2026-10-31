/**
 * The orphan clean-up against the Firestore and Auth emulators. Every id is invented.
 *
 * It must delete exactly what the audit counts as a deleted person's leftovers (including
 * the subcollections of a record that no longer exists), only when confirmed with the
 * count it just made, never when the orphans moved before the recount, and never at all
 * when a Firebase Auth lookup fails: a failed lookup read as "no user" would erase live
 * people.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// vitest.config.unit.ts's setup mocks firebase-admin; this test runs on the real emulators
vi.unmock('firebase-admin/app');
vi.unmock('firebase-admin/firestore');
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { runEraseOrphans } from '../erase-orphans.js';
import { runAudit } from '../orphaned-erasure-audit.js';
import {
  ENGAGEMENT_GONE,
  EXPECTED,
  GONE,
  LIVE,
  PHANTOM,
  PHONE,
  DEVICE,
  exportAll,
  seedManyLiveUsers,
  seedWorld,
} from './erase-orphans-fixture.js';

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST && !!process.env.FIREBASE_AUTH_EMULATOR_HOST;
const PROJECT = 'demo-erase-orphans';

let db: Firestore;
let auth: Auth;

beforeAll(() => {
  if (!emulator) return;
  const app =
    getApps().find((a) => a.name === 'erase-orphans-test') ??
    initializeApp({ projectId: PROJECT }, 'erase-orphans-test');
  db = getFirestore(app);
  auth = getAuth(app);
});

beforeEach(async () => {
  if (!emulator) return;
  const base = `projects/${PROJECT}`;
  await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/${base}/databases/(default)/documents`,
    { method: 'DELETE' }
  );
  await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/${base}/accounts`, {
    method: 'DELETE',
  });
});

/** Auth whose getUsers throws on the given call (1-based), counting every call */
function authFailingOn(call: number | null): { auth: Auth; calls: () => number } {
  let calls = 0;
  const failing: Auth = Object.create(auth);
  failing.getUsers = async (identifiers) => {
    calls += 1;
    if (calls === call)
      throw Object.assign(new Error('unavailable'), { code: 'auth/internal-error' });
    return auth.getUsers(identifiers);
  };
  return { auth: failing, calls: () => calls };
}

const run = (options: Partial<Parameters<typeof runEraseOrphans>[0]> = {}) =>
  runEraseOrphans({
    db,
    auth,
    database: '(default)',
    deleteRequested: false,
    confirm: undefined,
    ...options,
  });

/** The export with the orphans gone: their documents, and the deleted person's map entry */
function withoutOrphans(before: Record<string, unknown>, orphanPaths: string[]) {
  const expected = { ...before };
  for (const path of orphanPaths) delete expected[path];
  expected['consent/contact1'] = { grants: { [LIVE]: { ok: true } } };
  return expected;
}

describe.skipIf(!emulator)('erase orphans', () => {
  it('dry run: prints the database first, then the exact counts, and changes nothing', async () => {
    await seedWorld(db, auth);
    const before = await exportAll(db);

    const result = await run();

    expect(result.lines[0]).toBe('database: (default)');
    const line = (label: string) => result.lines.find((l) => l.startsWith(`${label} `));
    expect(line('engagement_profiles/{uid}')).toMatch(/orphaned keys 13 {2}docs 13$/);
    expect(line('bogle_users/{uid}')).toMatch(/orphaned keys 1 {2}docs 3$/);
    expect(line('user_seeds/{uid}')).toMatch(/orphaned keys 1 {2}docs 1$/);
    expect(line('contact_relationships[userId]')).toMatch(/orphaned keys 1 {2}docs 1$/);
    expect(line('consent[grants.{uid}]')).toMatch(/orphaned keys 1 {2}docs 1$/);
    expect(line('answer_cards[userId]')).toMatch(/orphaned keys 1 {2}docs 1$/);
    expect(line('total')).toMatch(
      new RegExp(`orphaned keys ${EXPECTED.keys} {2}docs ${EXPECTED.docs}$`)
    );
    expect(result.total).toBe(EXPECTED.keys);
    expect(result.lines.at(-1)).toContain(`CONFIRM_ORPHAN_DELETE=${EXPECTED.keys}`);
    expect(await exportAll(db)).toEqual(before);

    const output = result.lines.join('\n');
    for (const id of [GONE, PHANTOM, LIVE, PHONE, DEVICE, ...ENGAGEMENT_GONE]) {
      expect(output).not.toContain(id);
    }
  });

  it.each([
    ['no confirm', undefined],
    ['a wrong confirm', String(EXPECTED.keys - 1)],
  ])('--delete with %s refuses and deletes nothing', async (_, confirm) => {
    await seedWorld(db, auth);
    const before = await exportAll(db);

    const result = await run({ deleteRequested: true, confirm });

    expect(result.refused).toBe(true);
    expect(result.deleted).toBe(0);
    expect(await exportAll(db)).toEqual(before);
  });

  it('--delete with the right confirm deletes exactly the orphans, phantom subcollections included', async () => {
    const orphanPaths = await seedWorld(db, auth);
    const before = await exportAll(db);
    expect(orphanPaths.every((path) => path in before)).toBe(true);

    const result = await run({ deleteRequested: true, confirm: String(EXPECTED.keys) });

    expect(result.refused).toBe(false);
    expect(result.deleted).toBe(EXPECTED.keys);
    expect(result.left).toBe(0);
    expect(await exportAll(db)).toEqual(withoutOrphans(before, orphanPaths));
    expect((await runAudit({ db, auth })).total).toBe(0);
    expect((await run()).total).toBe(0);
  });

  it('refuses and deletes nothing when the orphans change between the count and the recount', async () => {
    await seedWorld(db, auth);
    const before = await exportAll(db);
    const [comesBack] = ENGAGEMENT_GONE;

    const result = await run({
      deleteRequested: true,
      confirm: String(EXPECTED.keys),
      // The person signs in again: their profile is a live user's now
      beforeRecount: async () => {
        await auth.createUser({ uid: comesBack! });
      },
    });

    expect(result.refused).toBe(true);
    expect(result.lines.at(-1)).toContain(`(${EXPECTED.keys - 1} now)`);
    expect(await exportAll(db)).toEqual(before);
  });

  describe('a failed Firebase Auth lookup aborts and deletes nothing', () => {
    it('the seeded world takes two lookup batches per count', async () => {
      await seedWorld(db, auth);
      await seedManyLiveUsers(db, auth, 110);
      const counting = authFailingOn(null);
      expect((await run({ auth: counting.auth })).total).toBe(EXPECTED.keys);
      expect(counting.calls()).toBe(2);
    });

    it.each([
      ['batch 1 of the count', 1],
      ['batch 2 of the count', 2],
      ['batch 1 of the recount', 3],
      ['batch 2 of the recount', 4],
    ])('a failure on %s', async (_, call) => {
      await seedWorld(db, auth);
      await seedManyLiveUsers(db, auth, 110);
      const before = await exportAll(db);
      const failing = authFailingOn(call);

      await expect(
        run({ auth: failing.auth, deleteRequested: true, confirm: String(EXPECTED.keys) })
      ).rejects.toMatchObject({ code: 'auth/internal-error' });

      expect(failing.calls()).toBe(call);
      expect(await exportAll(db)).toEqual(before);
    });

    it('a failure on a dry run stops it too', async () => {
      await seedWorld(db, auth);
      await seedManyLiveUsers(db, auth, 110);
      await expect(run({ auth: authFailingOn(2).auth })).rejects.toMatchObject({
        code: 'auth/internal-error',
      });
    });
  });
});

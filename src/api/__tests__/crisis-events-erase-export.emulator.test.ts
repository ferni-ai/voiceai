/**
 * CRISIS_EVENT_RECORD's crisis_events leave with the person and go with the account, on
 * the Firestore emulator: the real writer (recordCrisisEvent) records calls under the
 * account and under the phone profiles proven to be the same person (a phone call is
 * often recorded under phone:{e164}), then the real export and the real erasure run.
 * Another person's events, and a phone profile linked to someone else's sign-in, stay.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { eraseUserRecord } from '../../services/platform/erase-user-record.js';
import {
  countUserRecords,
  exportUserRecords,
} from '../../services/platform/user-records-export.js';
import { recordCrisisEvent } from '../../services/safety/index.js';

const firebaseUsers = vi.hoisted(
  () => new Map<string, { emailVerified: boolean; phoneNumber?: string }>()
);

// The shared setup fakes Firestore for every test; here the reads and writes reach the emulator
vi.mock('firebase-admin/app', async () => vi.importActual('firebase-admin/app'));
vi.mock('firebase-admin/firestore', async () => vi.importActual('firebase-admin/firestore'));
vi.mock('../../services/identity/firebase-auth.js', () => ({
  ensureFirebaseAdmin: () => true,
  deleteFirebaseUser: vi.fn(async () => true),
  getFirebaseUserOrThrow: vi.fn(async (uid: string) => {
    const user = firebaseUsers.get(uid);
    return user ? { providerData: [], ...user } : null;
  }),
}));

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
process.env.GCLOUD_PROJECT ??= 'demo-crisis-events';

let db: Firestore;
beforeAll(async () => {
  if (!emulator) return;
  const { getAdminFirestore } = await import('../../utils/firebase-admin-app.js');
  db = getAdminFirestore();
});

const record = async (userId: string): Promise<void> =>
  recordCrisisEvent(
    {
      userId,
      sessionId: `session-${userId}`,
      personaId: 'ferni',
      crisisType: 'suicidal_ideation',
      severity: 'high',
      reader: 'pattern',
      resourcesProvided: true,
    },
    db
  );

const eventsOf = async (...userIds: string[]): Promise<string[]> =>
  (await db.collection('crisis_events').where('userId', 'in', userIds).get()).docs.map(
    (d) => d.get('userId') as string
  );

describe.skipIf(!emulator)('crisis_events: export and account deletion', () => {
  it("exports the person's events, their proven phone profiles' too, and erases them all", async () => {
    const n = String(Date.now()).slice(-7);
    const uid = `crisis-u-${n}`;
    const someone = `crisis-other-${n}`;
    const verified = `phone:+1555${n}`; // the number Firebase verified for the account
    const linked = `phone:+1556${n}`; // linked to the record after a texted code
    const theirs = `phone:+1558${n}`; // someone else's, linked to their own sign-in
    firebaseUsers.set(uid, { emailVerified: false, phoneNumber: `+1555${n}` });
    await db.doc(`bogle_users/${uid}`).set({ linkedIdentifiers: [linked] });
    for (const p of [verified, linked]) await db.doc(`bogle_users/${p}`).set({ name: 'Caller' });
    await db.doc(`bogle_users/${theirs}`).set({ linkedIdentifiers: [`auth:default:${someone}`] });
    for (const id of [uid, verified, linked, theirs, someone]) await record(id);

    const out = await exportUserRecords(uid, undefined, db);
    const rows = out.crisis_events as Array<Record<string, unknown>>;
    expect(rows.map((r) => r.userId).sort()).toEqual([uid, verified, linked].sort());
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(
        [
          'createdAt',
          'crisisType',
          'expireAt',
          'id',
          'personaId',
          'reader',
          'resourcesProvided',
          'sessionId',
          'severity',
          'userId',
        ].sort()
      );
    }
    // The count matches: their record and three events; the other person's own event and
    // their phone profile's (linked to their sign-in)
    expect(await countUserRecords(uid, undefined, db)).toBe(4);
    expect(await countUserRecords(someone, undefined, db)).toBe(2);

    await eraseUserRecord(uid, db);

    expect(await eventsOf(uid, verified, linked)).toEqual([]);
    expect((await eventsOf(theirs, someone)).sort()).toEqual([theirs, someone].sort());
  }, 60_000);
});

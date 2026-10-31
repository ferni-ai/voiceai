/**
 * The activity ledger on the Firestore emulator: real transactions (a ledger write
 * inside a producer's transaction commits and rolls back with it, a lost race is
 * refused), the readers' real queries, and the record leaving with the person (the
 * "take your story" export) and going with the account (eraseUserRecord).
 */
import type { Firestore as AdminFirestore } from 'firebase-admin/firestore';
import type { Firestore } from '@google-cloud/firestore';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { ActivityChange, NewActivity } from '../../activity/activity.js';
import { eraseUserRecord } from '../../platform/erase-user-record.js';
import { countUserRecords, exportUserRecords } from '../../platform/user-records-export.js';
import { activityDoc, getActivity, listActivity, recordActivity } from '../activity-store.js';

// The shared setup fakes Firestore for every test; here the reads and writes reach the emulator
vi.mock('firebase-admin/app', async () => vi.importActual('firebase-admin/app'));
vi.mock('firebase-admin/firestore', async () => vi.importActual('firebase-admin/firestore'));
vi.mock('../../identity/firebase-auth.js', () => ({
  ensureFirebaseAdmin: () => true,
  deleteFirebaseUser: vi.fn(async () => true),
  getFirebaseUserOrThrow: vi.fn(async () => null),
}));

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
process.env.GCLOUD_PROJECT ??= 'demo-activity-ledger';
const ON = { ACTIVITY_LEDGER: 'on' };

let db: Firestore;
beforeAll(async () => {
  if (!emulator) return;
  const { getAdminFirestore } = await import('../../../utils/firebase-admin-app.js');
  db = getAdminFirestore() as AdminFirestore as unknown as Firestore;
});

const uidOf = (tag: string): string => `act-${tag}-${Date.now().toString(36)}`;
const at = (min: number): Date => new Date(Date.UTC(2026, 9, 27, 14, min));
const ask = (name: string, kind: NewActivity['kind'] = 'call'): NewActivity => ({
  kind,
  subject: { name, ...(name === 'Doug' ? { contactId: 'c-doug' } : {}) },
  asked: { at: at(0).toISOString(), sessionId: 's-1' },
});
const create = (id: string, rec: NewActivity, min = 0): ActivityChange => ({
  op: 'create',
  id,
  source: 'test',
  record: rec,
  at: at(min),
});
const step = (id: string, state: 'in_progress' | 'done', min: number): ActivityChange => ({
  op: 'update',
  id,
  source: 'test',
  patch: { state },
  at: at(min),
});
const eventIds = async (uid: string, id: string): Promise<string[]> =>
  (await activityDoc(db, uid, id).collection('events').get()).docs.map((d) => d.id).sort();

describe.skipIf(!emulator)('activity ledger (Firestore emulator)', () => {
  it("commits with the producer's own write, and rolls back with it", async () => {
    const uid = uidOf('tx');
    const call = db.doc(`bogle_users/${uid}/on_behalf_calls/ob-1`);
    await db.runTransaction(async (tx) => {
      await recordActivity({ db, tx }, uid, create('a1', ask('Doug')), 0, ON);
      tx.set(call, { status: 'placed' });
    });
    expect((await call.get()).exists).toBe(true);
    expect((await getActivity(db, uid, 'a1', ON))?.revision).toBe(1);

    await expect(
      db.runTransaction(async (tx) => {
        const r = await recordActivity({ db, tx }, uid, step('a1', 'in_progress', 1), 1, ON);
        expect(r.ok).toBe(true);
        tx.update(call, { status: 'dialing' });
        throw new Error('provider refused the dial');
      })
    ).rejects.toThrow('provider refused');
    expect((await call.get()).get('status')).toBe('placed');
    expect(await getActivity(db, uid, 'a1', ON)).toMatchObject({ revision: 1, state: 'asked' });
    expect(await eventIds(uid, 'a1')).toEqual(['000001']);
  }, 30_000);

  it('two writers that read the same revision: one wins, one is refused, one event', async () => {
    const uid = uidOf('race');
    await recordActivity(db, uid, create('a1', ask('Doug')), 0, ON);
    const results = await Promise.all([
      recordActivity(db, uid, step('a1', 'in_progress', 1), 1, ON),
      recordActivity(db, uid, step('a1', 'done', 2), 1, ON),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.reason === 'stale')).toHaveLength(1);
    expect((await getActivity(db, uid, 'a1', ON))?.revision).toBe(2);
    expect(await eventIds(uid, 'a1')).toEqual(['000001', '000002']);
  }, 30_000);

  it('lists by person, state, kind and time, newest first', async () => {
    const uid = uidOf('list');
    await recordActivity(db, uid, create('dad-call', ask('Doug'), 1), 0, ON);
    await recordActivity(db, uid, create('mom-call', ask('Mom'), 2), 0, ON);
    await recordActivity(db, uid, create('dad-text', ask('Doug', 'text'), 3), 0, ON);
    await recordActivity(db, uid, step('dad-call', 'done', 4), 1, ON);
    const ids = async (q: Parameters<typeof listActivity>[2]): Promise<string[]> =>
      (await listActivity(db, uid, q, ON)).map((a) => a.id);

    expect(await ids({ limit: 10 })).toEqual(['dad-call', 'dad-text', 'mom-call']);
    expect(await ids({ subject: { contactId: 'c-doug' }, limit: 10 })).toEqual([
      'dad-call',
      'dad-text',
    ]);
    expect(await ids({ subject: { name: 'mom' }, limit: 10 })).toEqual(['mom-call']);
    expect(await ids({ states: ['asked'], limit: 10 })).toEqual(['dad-text', 'mom-call']);
    expect(await ids({ subject: { name: 'Doug' }, kinds: ['call'], limit: 10 })).toEqual([
      'dad-call',
    ]);
    expect(await ids({ since: at(3), limit: 10 })).toEqual(['dad-call', 'dad-text']);
    expect(await ids({ limit: 1 })).toEqual(['dad-call']);
    expect(await listActivity(db, uid, { limit: 10 }, {})).toEqual([]); // flag off
  }, 30_000);

  it('the export carries every record and event; erasure removes them all', async () => {
    const uid = uidOf('erase');
    const other = uidOf('keep');
    for (const u of [uid, other]) {
      await recordActivity(db, u, create('a1', ask('Doug')), 0, ON);
      await recordActivity(db, u, step('a1', 'in_progress', 1), 1, ON);
      await recordActivity(db, u, create('a2', ask('Mom', 'reminder')), 0, ON);
    }
    const out = await exportUserRecords(uid, undefined, db as never);
    const records = out['bogle_users/{uid}/activity'] as Array<Record<string, unknown>>;
    const events = out['bogle_users/{uid}/activity/*/events'] as Array<Record<string, unknown>>;
    expect(records.map((r) => r.id).sort()).toEqual(['a1', 'a2']);
    expect(events.map((e) => `${String(e.activityId)}/${e.id as string}`).sort()).toEqual([
      'a1/000001',
      'a1/000002',
      'a2/000001',
    ]);
    // the profile doc is absent here: two records and three events
    expect(await countUserRecords(uid, undefined, db as never)).toBe(5);

    await eraseUserRecord(uid, db as never);

    expect((await activityDoc(db, uid, 'a1').get()).exists).toBe(false);
    expect(await eventIds(uid, 'a1')).toEqual([]);
    expect(await eventIds(uid, 'a2')).toEqual([]);
    expect(await eventIds(other, 'a1')).toEqual(['000001', '000002']);
  }, 60_000);
});

import type { DocumentReference, Firestore, Transaction } from '@google-cloud/firestore';
import { describe, expect, it } from 'vitest';
import type { ActivityChange, NewActivity } from '../../activity/activity.js';
import { activityEvents, getActivity, recordActivity } from '../activity-store.js';
import { fakeFirestore } from './fake-firestore.js';

const ON = { ACTIVITY_LEDGER: 'on' };
const AT = new Date('2026-10-27T14:00:00.000Z');
const LATER = new Date('2026-10-27T15:00:00.000Z');
const record: NewActivity = {
  kind: 'call',
  subject: { name: 'Doug', relationship: 'dad' },
  asked: { at: AT.toISOString(), sessionId: 's-1', words: 'call my dad' },
};
const create = (key?: string): ActivityChange => ({
  op: 'create',
  id: 'a1',
  source: 'callOnBehalf',
  record,
  at: AT,
  ...(key ? { key } : {}),
});
const move = (state: 'in_progress' | 'done' | 'asked', key?: string): ActivityChange => ({
  op: 'update',
  id: 'a1',
  source: 'call-lifecycle',
  patch: { state },
  at: LATER,
  ...(key ? { key } : {}),
});

const callDoc = (db: Firestore): DocumentReference =>
  db.collection('bogle_users').doc('u1').collection('on_behalf_calls').doc('ob-1');

function setup() {
  const fake = fakeFirestore();
  const paths = (): string[] => [...fake.docs.keys()].filter((p) => p.includes('/activity/'));
  const events = (): string[] => paths().filter((p) => p.includes('/events/'));
  return { ...fake, paths, events };
}

describe('recordActivity', () => {
  it('create then update: revision 1 then 2, exactly one event each, in order', async () => {
    const { db, docs, events } = setup();
    expect(events()).toEqual([]);
    const c = await recordActivity(db, 'u1', create(), 0, ON);
    expect(c).toMatchObject({ ok: true, duplicate: false, activity: { revision: 1 } });
    expect(events()).toEqual(['bogle_users/u1/activity/a1/events/000001']);

    const u = await recordActivity(db, 'u1', move('in_progress'), 1, ON);
    expect(u).toMatchObject({ ok: true, activity: { revision: 2, state: 'in_progress' } });
    expect(docs.get('bogle_users/u1/activity/a1')).toMatchObject({ revision: 2 });
    expect(events()).toHaveLength(2);
    const log = await activityEvents(db, 'u1', 'a1');
    expect(log.map((e) => [e.seq, e.from, e.to])).toEqual([
      [1, null, 'asked'],
      [2, 'asked', 'in_progress'],
    ]);
  });

  it('a stale expectedRevision is refused and writes nothing', async () => {
    const { db, docs, paths } = setup();
    await recordActivity(db, 'u1', create(), 0, ON);
    await recordActivity(db, 'u1', move('in_progress'), 1, ON);
    const before = structuredClone(Object.fromEntries(docs));
    const pathsBefore = paths();

    // A writer that read revision 1 lost the race to the one that wrote revision 2
    expect(await recordActivity(db, 'u1', move('done'), 1, ON)).toEqual({
      ok: false,
      reason: 'stale',
    });
    expect(paths()).toEqual(pathsBefore);
    expect(Object.fromEntries(docs)).toEqual(before);
    // and a create over an existing record expecting none is stale too
    expect(await recordActivity(db, 'u1', create(), 0, ON)).toMatchObject({ reason: 'stale' });
  });

  it('an illegal transition is refused and writes nothing', async () => {
    const { db, docs, events } = setup();
    await recordActivity(db, 'u1', create(), 0, ON);
    await recordActivity(db, 'u1', move('done'), 1, ON);
    expect(await recordActivity(db, 'u1', move('asked'), 2, ON)).toEqual({
      ok: false,
      reason: 'illegal_transition',
    });
    expect(docs.get('bogle_users/u1/activity/a1')).toMatchObject({ revision: 2, state: 'done' });
    expect(events()).toHaveLength(2);
  });

  it('the same idempotency key twice writes once (create and update)', async () => {
    const { db, events } = setup();
    // No id: the store derives it from the key, so a retried create finds its record
    const keyed = (key: string): ActivityChange => ({
      op: 'create',
      source: 'callOnBehalf',
      record,
      key,
    });
    const first = await recordActivity(db, 'u1', keyed('ob-1:asked'), undefined, ON);
    const again = await recordActivity(db, 'u1', keyed('ob-1:asked'), undefined, ON);
    expect(first).toMatchObject({ ok: true, duplicate: false });
    expect(again).toMatchObject({ ok: true, duplicate: true });
    if (!first.ok || !again.ok) throw new Error('unreachable');
    expect(again.activity.id).toBe(first.activity.id);
    expect(events()).toHaveLength(1);

    const id = first.activity.id;
    const step: ActivityChange = { ...move('in_progress', 'ob-1:dialing'), id };
    await recordActivity(db, 'u1', step, 1, ON);
    // The retry read revision 1 before the first try landed: still a no-op, not "stale"
    expect(await recordActivity(db, 'u1', step, 1, ON)).toMatchObject({ duplicate: true });
    expect(events()).toHaveLength(2);
    expect((await getActivity(db, 'u1', id, ON))?.revision).toBe(2);
  });

  it("inside a caller's transaction: commits with the caller's write, rolls back with it", async () => {
    const { db, docs, paths } = setup();
    await db.runTransaction(async (tx) => {
      const r = await recordActivity({ db, tx: tx as Transaction }, 'u1', create(), 0, ON);
      expect(r.ok).toBe(true);
      tx.set(callDoc(db), { status: 'placed' });
    });
    expect(docs.has('bogle_users/u1/on_behalf_calls/ob-1')).toBe(true);
    expect(paths()).toHaveLength(2); // the record and its event

    await expect(
      db.runTransaction(async (tx) => {
        await recordActivity({ db, tx: tx as Transaction }, 'u1', move('in_progress'), 1, ON);
        throw new Error('the dial failed');
      })
    ).rejects.toThrow('the dial failed');
    expect(docs.get('bogle_users/u1/activity/a1')).toMatchObject({ revision: 1, state: 'asked' });
    expect(paths()).toHaveLength(2);
  });

  it('quarantines a record this build did not write and refuses to build on it', async () => {
    const { db, docs } = setup();
    docs.set('bogle_users/u1/activity/a1', { kind: 'call', transcript: 'all of it' });
    expect(await recordActivity(db, 'u1', move('done'), undefined, ON)).toEqual({
      ok: false,
      reason: 'unreadable',
    });
    expect(docs.get('bogle_users/u1/activity/a1')).toMatchObject({
      transcript: 'all of it',
      quarantined: { source: 'call-lifecycle' },
    });
    expect(await getActivity(db, 'u1', 'a1', ON)).toBeNull();
  });

  it('writes nothing while ACTIVITY_LEDGER is off, or for a non-member id', async () => {
    const { db, paths } = setup();
    expect(await recordActivity(db, 'u1', create(), 0, {})).toEqual({
      ok: false,
      reason: 'disabled',
    });
    expect(await recordActivity(db, 'onbehalf:call-9', create(), 0, ON)).toEqual({
      ok: false,
      reason: 'not_member',
    });
    expect(await recordActivity(db, 'anonymous', create(), 0, ON)).toMatchObject({
      reason: 'not_member',
    });
    expect(paths()).toEqual([]);
    await expect(recordActivity(db, 'u1/x', create(), 0, ON)).rejects.toThrow('invalid user id');
  });
});

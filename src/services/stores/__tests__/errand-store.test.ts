import { describe, expect, it, vi } from 'vitest';
import {
  RETRY_POLICY,
  type Effect,
  type EffectKind,
  type Errand,
  type NewErrand,
  type OutboxEffect,
} from '../../errands/index.js';
import { createErrandStore, firestoreErrandStore, toErrand } from '../errand-store.js';
import { fakeFirestore } from './fake-firestore.js';

const shared = fakeFirestore();
vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => shared.db }));

const NOW = new Date('2026-10-20T14:00:00.000Z');
const MIN = 60_000;
const later = (ms: number): Date => new Date(NOW.getTime() + ms);
const newErrand = (over: Partial<NewErrand> = {}): NewErrand => ({
  userId: 'u1',
  kind: 'appointment',
  goal: 'dental cleaning',
  zone: 'America/New_York',
  constraints: { prefs: [] },
  env: 'test',
  ...over,
});
const call = (idemKey = 'e1:call:p1:1'): Effect => ({
  kind: 'call',
  placeId: 'p1',
  purpose: 'ask',
  approval: { verb: 'call', placeIds: ['p1'] },
  idemKey,
  retry: RETRY_POLICY.call,
});
const lookup = (idemKey = 'e1:lookup:p1:1'): Effect => ({
  kind: 'lookup_line_type',
  placeId: 'p1',
  idemKey,
  retry: RETRY_POLICY.lookup_line_type,
});

let ids = 0;
function setup() {
  const fake = fakeFirestore();
  const store = createErrandStore(fake.db, () => `id${String(++ids).padStart(4, '0')}`);
  return { ...fake, store };
}

/** A saved errand with `effects` queued, as the step after create would leave it. */
async function queued(effects: Effect[]) {
  const s = setup();
  const e = await s.store.create(newErrand(), NOW, 1);
  const next: Errand = {
    ...e,
    state: 'acting',
    step: 'call:p1',
    updatedAt: later(1).toISOString(),
  };
  expect(await s.store.save(next, e.updatedAt, [], effects)).toBe(true);
  return { ...s, e: next };
}

const outbox = (docs: Map<string, Record<string, unknown>>, e: Errand, key: string) =>
  docs.get(`bogle_users/u1/errands/${e.id}/effects/${key}`) as unknown as OutboxEffect;

describe('errand store', () => {
  it('creates a planning errand at bogle_users/{uid}/errands with its stepVersion and a created event', async () => {
    const { store, docs } = setup();
    const e = await store.create(newErrand(), NOW, 1);
    expect(e).toMatchObject({ state: 'planning', stepVersion: 1, approvals: [], pending: null });
    expect(docs.has(`bogle_users/u1/errands/${e.id}`)).toBe(true);
    expect(await store.events('u1', e.id)).toEqual([
      { type: 'decision', at: NOW.toISOString(), note: 'created' },
    ]);
  });

  it('save writes only when nobody changed it since it was read; a stale copy writes nothing', async () => {
    const { store, docs } = setup();
    const e = await store.create(newErrand(), NOW, 1);
    const first: Errand = { ...e, state: 'awaiting_owner', updatedAt: later(MIN).toISOString() };
    expect(await store.save(first, e.updatedAt)).toBe(true);
    const stale: Errand = { ...e, state: 'cancelled', updatedAt: later(2 * MIN).toISOString() };
    const ev = { type: 'decision', at: stale.updatedAt, note: 'stale' } as const;
    expect(await store.save(stale, e.updatedAt, [ev], [call()])).toBe(false);
    expect((await store.get('u1', e.id))?.state).toBe('awaiting_owner');
    expect(await store.events('u1', e.id)).toHaveLength(1);
    expect([...docs.keys()].some((k) => k.includes('/effects/'))).toBe(false);
  });

  it('save appends events in order and queues each effect as pending under its idemKey', async () => {
    const { store, docs } = setup();
    const e = await store.create(newErrand(), NOW, 1);
    const next: Errand = { ...e, state: 'acting', updatedAt: later(MIN).toISOString() };
    const at = next.updatedAt;
    const events = [
      { type: 'signal', at, signal: 'owner_confirmed' },
      { type: 'effect', at, kind: 'call', idemKey: 'e1:call:p1:1' },
    ] as const;
    expect(await store.save(next, e.updatedAt, events, [call()])).toBe(true);
    expect((await store.events('u1', e.id)).map((x) => x.type)).toEqual([
      'decision',
      'signal',
      'effect',
    ]);
    expect(outbox(docs, e, 'e1:call:p1:1')).toMatchObject({
      status: 'pending',
      attempts: 0,
      kind: 'call',
      notBefore: at,
      providerRef: null,
    });
  });

  it('events read back in the order one step wrote them, even past ten', async () => {
    const { store } = setup();
    const e = await store.create(newErrand(), NOW, 1);
    const next: Errand = { ...e, updatedAt: later(MIN).toISOString() };
    const notes = Array.from({ length: 12 }, (_, i) => `n${i}`);
    const events = notes.map((note) => ({ type: 'decision', at: next.updatedAt, note }) as const);
    await store.save(next, e.updatedAt, events);
    const back = (await store.events('u1', e.id)).slice(1);
    expect(back.map((x) => (x.type === 'decision' ? x.note : ''))).toEqual(notes);
  });

  it('queuing the same idemKey again never resets an effect already taken', async () => {
    const { store, docs, e } = await queued([call()]);
    const path = `bogle_users/u1/errands/${e.id}/effects/e1:call:p1:1`;
    docs.set(path, { ...docs.get(path), status: 'running', attempts: 1 });
    const again: Errand = { ...e, updatedAt: later(2 * MIN).toISOString() };
    expect(await store.save(again, e.updatedAt, [], [call()])).toBe(true);
    expect(outbox(docs, e, 'e1:call:p1:1')).toMatchObject({ status: 'running', attempts: 1 });
  });

  it('open lists one person’s errands that are not closed', async () => {
    const { store } = setup();
    const a = await store.create(newErrand(), NOW, 1);
    const b = await store.create(newErrand(), NOW, 1);
    await store.create(newErrand({ userId: 'u2' }), NOW, 1);
    const done: Errand = { ...b, state: 'done', updatedAt: later(MIN).toISOString() };
    await store.save(done, b.updatedAt);
    expect((await store.open('u1')).map((e) => e.id)).toEqual([a.id]);
  });

  it('due finds open errands across everyone whose wake time has come, soonest first, up to the limit', async () => {
    const { store } = setup();
    const wake = async (userId: string, at: string | null, state: Errand['state'] = 'waiting') => {
      const e = await store.create(newErrand({ userId }), NOW, 1);
      const next: Errand = { ...e, state, nextWakeAt: at, updatedAt: later(1).toISOString() };
      await store.save(next, e.updatedAt);
    };
    await wake('u1', later(30 * MIN).toISOString());
    await wake('u2', later(10 * MIN).toISOString());
    await wake('u3', later(90 * MIN).toISOString());
    await wake('u4', null);
    await wake('u5', later(5 * MIN).toISOString(), 'cancelled');
    const due = await store.due(later(60 * MIN), 10);
    expect(due.map((e) => e.userId)).toEqual(['u2', 'u1']);
    expect((await store.due(later(60 * MIN), 1)).map((e) => e.userId)).toEqual(['u2']);
  });
});

describe('toErrand and the flag', () => {
  const base = {
    userId: 'u1',
    kind: 'appointment',
    goal: 'g',
    zone: 'UTC',
    step: 'find',
    createdAt: 'a',
    updatedAt: 'a',
    env: 'test',
    state: 'planning',
    stepVersion: 1,
    constraints: { prefs: ['mornings', 7] },
  };

  it('drops a document that is not an errand', () => {
    expect(toErrand('x', { ...base, kind: 'mystery' })).toBeNull();
    expect(toErrand('x', { ...base, stepVersion: undefined })).toBeNull();
    expect(toErrand('x', null)).toBeNull();
  });

  it('keeps structured approvals and drops malformed ones', () => {
    const e = toErrand('x', {
      ...base,
      approvals: [{ verb: 'call', placeIds: ['p1'] }, 'call:p1+p2', { verb: 'pay', placeIds: [] }],
      pending: 'text:p1',
    });
    expect(e?.approvals).toEqual([{ verb: 'call', placeIds: ['p1'] }]);
    expect(e?.pending).toBeNull();
    expect(e?.constraints.prefs).toEqual(['mornings']);
  });

  it('there is no store while ERRANDS is off, and one when it is on', () => {
    expect(firestoreErrandStore({})).toBeNull();
    expect(firestoreErrandStore({ ERRANDS: 'on' })).not.toBeNull();
  });
});

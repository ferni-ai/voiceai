import { describe, expect, it, vi } from 'vitest';
import {
  RETRY_POLICY,
  type Effect,
  type EffectKind,
  type Errand,
  type NewErrand,
  type OutboxEffect,
} from '../../errands/index.js';
import {
  SAFE_TO_REPEAT,
  createEffectOutbox,
  firestoreEffectOutbox,
  toOutbox,
} from '../errand-outbox.js';
import { createErrandStore } from '../errand-store.js';
import { fakeFirestore } from './fake-firestore.js';

const shared = fakeFirestore();
vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => shared.db }));

const NOW = new Date('2026-10-20T14:00:00.000Z');
const MIN = 60_000;
const later = (ms: number): Date => new Date(NOW.getTime() + ms);
const newErrand: NewErrand = {
  userId: 'u1',
  kind: 'appointment',
  goal: 'dental cleaning',
  zone: 'America/New_York',
  constraints: { prefs: [] },
  env: 'test',
};
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
/** An errand saved with `effects` queued in its outbox, as the store leaves it. */
async function queued(effects: Effect[]) {
  const fake = fakeFirestore();
  const makeId = (): string => `id${String(++ids).padStart(4, '0')}`;
  const store = createErrandStore(fake.db, makeId);
  const outbox = createEffectOutbox(fake.db, makeId);
  const created = await store.create(newErrand, NOW, 1);
  const e: Errand = {
    ...created,
    state: 'acting',
    revision: 1,
    approvals: [{ verb: 'call', placeIds: ['p1'] }],
    updatedAt: later(1).toISOString(),
  };
  expect(await store.save(e, created.revision, [], effects)).toBe(true);
  /** Saves a change to the errand, as a later step would. */
  const change = async (patch: Partial<Errand>): Promise<void> => {
    const cur = await store.get('u1', e.id);
    if (!cur) throw new Error('errand missing');
    expect(await store.save({ ...cur, ...patch, revision: cur.revision + 1 }, cur.revision)).toBe(
      true
    );
  };
  return { ...fake, store, outbox, e, change };
}

const entry = (docs: Map<string, Record<string, unknown>>, e: Errand, key: string) =>
  docs.get(`bogle_users/u1/errands/${e.id}/effects/${key}`) as unknown as OutboxEffect;

describe('effect outbox and leases', () => {
  it('a claim leases a pending effect; while leased nobody else gets it', async () => {
    const { outbox } = await queued([call()]);
    const c = await outbox.claimEffect(later(MIN), 5 * MIN);
    expect(c.type).toBe('claimed');
    if (c.type !== 'claimed') return;
    expect(c.effect).toMatchObject({
      status: 'running',
      attempts: 1,
      leaseUntil: later(6 * MIN).toISOString(),
    });
    expect(c.recovered).toBe(false);
    expect((await outbox.claimEffect(later(2 * MIN), 5 * MIN)).type).toBe('none');
  });

  it('an effect pushed back after the scan but before the claim is not taken early', async () => {
    const { outbox, docs, e } = await queued([call()]);
    const path = `bogle_users/u1/errands/${e.id}/effects/e1:call:p1:1`;
    const claim = outbox.claimEffect(later(MIN), 5 * MIN); // its scan has already run
    docs.set(path, { ...docs.get(path), notBefore: later(10 * MIN).toISOString() });
    expect((await claim).type).toBe('none');
  });

  it('two claimers race for one effect and only one wins', async () => {
    const { outbox } = await queued([call()]);
    const both = await Promise.all([
      outbox.claimEffect(later(MIN), 5 * MIN),
      outbox.claimEffect(later(MIN), 5 * MIN),
    ]);
    expect(both.map((c) => c.type).sort()).toEqual(['claimed', 'none']);
  });

  it('an expired lease can be reclaimed, and the runner that lost it can no longer finish it', async () => {
    const { outbox } = await queued([lookup()]);
    const first = await outbox.claimEffect(later(MIN), 5 * MIN);
    if (first.type !== 'claimed') throw new Error('expected a claim');
    const again = await outbox.claimEffect(later(7 * MIN), 5 * MIN);
    expect(again).toMatchObject({ type: 'claimed', recovered: true, effect: { attempts: 2 } });
    expect(await outbox.completeEffect(first.lease, null, later(8 * MIN))).toBe(false);
    if (again.type === 'claimed') {
      expect(await outbox.completeEffect(again.lease, null, later(8 * MIN))).toBe(true);
    }
  });

  it('a running effect with a providerRef is never re-run blind: it comes back as needs_provider_check', async () => {
    const { outbox, docs, e } = await queued([call()]);
    const first = await outbox.claimEffect(later(MIN), 5 * MIN);
    if (first.type !== 'claimed') throw new Error('expected a claim');
    expect(await outbox.recordProviderRef(first.lease, 'CA123', later(2 * MIN), 5 * MIN)).toBe(
      true
    );
    const after = await outbox.claimEffect(later(8 * MIN), 5 * MIN);
    expect(after.type).toBe('needs_provider_check');
    expect(entry(docs, e, 'e1:call:p1:1')).toMatchObject({
      status: 'running',
      attempts: 1,
      providerRef: 'CA123',
    });
  });

  it('even an effect safe to repeat is checked, not re-run, once it has a providerRef', async () => {
    const { outbox } = await queued([lookup()]);
    const c = await outbox.claimEffect(later(MIN), 5 * MIN);
    if (c.type !== 'claimed') throw new Error('expected a claim');
    await outbox.recordProviderRef(c.lease, 'LK1', later(MIN), 5 * MIN);
    expect((await outbox.claimEffect(later(7 * MIN), 5 * MIN)).type).toBe('needs_provider_check');
  });

  it('a call whose runner died before it had a providerRef is not re-dialled either', async () => {
    const { outbox } = await queued([call()]);
    await outbox.claimEffect(later(MIN), 5 * MIN);
    expect((await outbox.claimEffect(later(7 * MIN), 5 * MIN)).type).toBe('needs_provider_check');
  });

  it('recording the providerRef renews the lease, so a long call keeps it', async () => {
    const { outbox } = await queued([call()]);
    const c = await outbox.claimEffect(later(MIN), 5 * MIN);
    if (c.type !== 'claimed') throw new Error('expected a claim');
    await outbox.recordProviderRef(c.lease, 'CA123', later(5 * MIN), 5 * MIN);
    expect((await outbox.claimEffect(later(7 * MIN), 5 * MIN)).type).toBe('none');
  });

  it('complete marks it done with the providerRef', async () => {
    const { outbox, docs, e } = await queued([call()]);
    const c = await outbox.claimEffect(later(MIN), 5 * MIN);
    if (c.type !== 'claimed') throw new Error('expected a claim');
    expect(await outbox.completeEffect(c.lease, 'CA9', later(2 * MIN))).toBe(true);
    expect(entry(docs, e, 'e1:call:p1:1')).toMatchObject({
      status: 'done',
      providerRef: 'CA9',
      leaseId: null,
    });
  });

  it('a retryable failure goes back to pending after its backoff; anything else fails it', async () => {
    const { outbox, docs, e } = await queued([call(), call('e1:call:p1:2')]);
    const first = await outbox.claimEffect(later(MIN), 5 * MIN);
    if (first.type !== 'claimed') throw new Error('expected a claim');
    const proof = { neverSent: true };
    expect(await outbox.failEffect(first.lease, 'rate_limited', later(2 * MIN), proof)).toBe(true);
    const key = first.effect.idemKey;
    expect(entry(docs, e, key)).toMatchObject({
      status: 'pending',
      notBefore: later(3 * MIN).toISOString(),
      error: 'rate_limited',
    });
    const second = await outbox.claimEffect(later(2 * MIN), 5 * MIN);
    if (second.type !== 'claimed') throw new Error('expected a claim');
    expect(second.effect.idemKey).not.toBe(key);
    expect(await outbox.failEffect(second.lease, 'timeout', later(3 * MIN), proof)).toBe(true);
    expect(entry(docs, e, second.effect.idemKey).status).toBe('failed');
  });

  it('a failure after the provider took it is never retried, even when the error is retryable', async () => {
    const { outbox, docs, e } = await queued([call()]);
    const c = await outbox.claimEffect(later(MIN), 5 * MIN);
    if (c.type !== 'claimed') throw new Error('expected a claim');
    await outbox.recordProviderRef(c.lease, 'CA1', later(MIN), 5 * MIN);
    await outbox.failEffect(c.lease, 'provider_unavailable', later(2 * MIN), { neverSent: true });
    expect(entry(docs, e, 'e1:call:p1:1').status).toBe('failed');
  });

  it('only a lookup may be re-run blind; every other kind comes back for a provider check', async () => {
    expect([...SAFE_TO_REPEAT]).toEqual(['lookup_line_type']);
    for (const kind of Object.keys(RETRY_POLICY) as EffectKind[]) {
      const f = { kind, placeId: 'p1', idemKey: `e1:${kind}:p1:1`, retry: RETRY_POLICY[kind] };
      const { outbox } = await queued([f as unknown as Effect]);
      await outbox.claimEffect(later(MIN), 5 * MIN);
      const again = await outbox.claimEffect(later(7 * MIN), 5 * MIN);
      expect([kind, again.type]).toEqual([
        kind,
        SAFE_TO_REPEAT.has(kind) ? 'claimed' : 'needs_provider_check',
      ]);
    }
  });

  it('a call is never queued again without proof the request never left', async () => {
    const { outbox, docs, e } = await queued([call()]);
    const c = await outbox.claimEffect(later(MIN), 5 * MIN);
    if (c.type !== 'claimed') throw new Error('expected a claim');
    await outbox.failEffect(c.lease, 'provider_unavailable', later(2 * MIN));
    expect(entry(docs, e, 'e1:call:p1:1').status).toBe('failed');
  });

  it('crash, then provider_unavailable after the provider check: failed, even with neverSent', async () => {
    const { outbox, docs, e } = await queued([call()]);
    await outbox.claimEffect(later(MIN), 5 * MIN);
    const check = await outbox.claimEffect(later(7 * MIN), 5 * MIN);
    if (check.type !== 'needs_provider_check') throw new Error('expected a provider check');
    const proof = { neverSent: true };
    expect(
      await outbox.failEffect(check.lease, 'provider_unavailable', later(8 * MIN), proof)
    ).toBe(true);
    expect(entry(docs, e, 'e1:call:p1:1')).toMatchObject({ status: 'failed', providerCheck: true });
  });
});

describe('the claim reads the errand back', () => {
  it('cancel after queue means no dial: the call is failed, not claimed', async () => {
    const { outbox, docs, e, change } = await queued([call()]);
    await change({ state: 'cancelled' });
    expect((await outbox.claimEffect(later(MIN), 5 * MIN)).type).toBe('none');
    expect(entry(docs, e, 'e1:call:p1:1')).toMatchObject({
      status: 'failed',
      error: 'errand cancelled',
    });
  });

  it('an approval the errand no longer holds fails the effect', async () => {
    const { outbox, docs, e, change } = await queued([call()]);
    await change({ approvals: [] });
    expect((await outbox.claimEffect(later(MIN), 5 * MIN)).type).toBe('none');
    expect(entry(docs, e, 'e1:call:p1:1').error).toBe('approval withdrawn');
  });

  it('a hang-up or a notice still goes after the errand closes', async () => {
    const hangUp = { ...call('e1:cancel:p1:1'), kind: 'cancel_call', call: 'e1:call:p1:1' };
    const notice = { kind: 'notify_owner', about: 'cancelled', idemKey: 'e1:notify:cancelled:1' };
    const { outbox, change } = await queued([
      hangUp as unknown as Effect,
      { ...notice, retry: RETRY_POLICY.notify_owner } as Effect,
    ]);
    await change({ state: 'cancelled' });
    const kinds = [
      await outbox.claimEffect(later(MIN), MIN),
      await outbox.claimEffect(later(MIN), MIN),
    ];
    expect(kinds.map((c) => (c.type === 'claimed' ? c.effect.kind : c.type)).sort()).toEqual([
      'cancel_call',
      'notify_owner',
    ]);
  });

  it('a retryable failure is not queued again once the errand has closed', async () => {
    const { outbox, docs, e, change } = await queued([lookup()]);
    const c = await outbox.claimEffect(later(MIN), 5 * MIN);
    if (c.type !== 'claimed') throw new Error('expected a claim');
    await change({ state: 'cancelled' });
    await outbox.failEffect(c.lease, 'timeout', later(2 * MIN));
    expect(entry(docs, e, 'e1:lookup:p1:1')).toMatchObject({
      status: 'failed',
      error: 'timeout (errand cancelled)',
    });
  });

  it('an entry that will not parse is quarantined and the scan moves on', async () => {
    const { outbox, docs, e } = await queued([call()]);
    const junk = `bogle_users/u1/errands/${e.id}/effects/junk`;
    docs.set(junk, { status: 'pending', notBefore: NOW.toISOString(), kind: 'mystery' });
    const c = await outbox.claimEffect(later(MIN), 5 * MIN);
    expect(c.type).toBe('claimed');
    expect(docs.get(junk)).toMatchObject({ status: 'failed', error: 'quarantined: unreadable' });
  });
});

describe('toOutbox and the flag', () => {
  it('drops a document that is not an outbox entry', () => {
    expect(toOutbox(null)).toBeNull();
    expect(toOutbox({ idemKey: 'k', status: 'pending', kind: 'mystery' })).toBeNull();
  });

  it('there is no outbox while ERRANDS is off, and one when it is on', () => {
    expect(firestoreEffectOutbox({})).toBeNull();
    expect(firestoreEffectOutbox({ ERRANDS: 'on' })).not.toBeNull();
  });
});

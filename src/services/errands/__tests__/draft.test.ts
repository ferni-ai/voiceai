import { describe, expect, it } from 'vitest';
import { answered, approval, ask, outward, wakeAt, withdraw, type Draft } from '../draft.js';
import type { Candidate, Errand } from '../errand.js';
import { DEFAULT_POLICY } from '../policy.js';

const NOW = new Date('2026-10-20T14:00:00.000Z');
const errand = (over: Partial<Errand> = {}): Errand => ({
  id: 'e1',
  userId: 'u1',
  kind: 'appointment',
  goal: 'g',
  zone: 'UTC',
  constraints: { prefs: [] },
  state: 'acting',
  step: 's',
  stepVersion: 1,
  revision: 1,
  nextWakeAt: null,
  candidates: [],
  pending: null,
  queue: [],
  asks: 0,
  approvals: [],
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
  env: 'test',
  ...over,
});
const draft = (e: Errand): Draft => ({
  e,
  effects: [],
  events: [],
  at: NOW.toISOString(),
  ctx: { now: NOW, policy: DEFAULT_POLICY },
});
const place = (placeId: string, over: Partial<Candidate> = {}): Candidate => ({
  placeId,
  name: placeId,
  phone: '+15550100000',
  why: '',
  status: 'new',
  attempts: 0,
  ...over,
});

describe('questions', () => {
  it('a question is asked with its idemKey as its id, numbered by the ask counter', () => {
    const d = draft(errand());
    ask(d, approval('call', 'p1'));
    expect(d.e.pending).toEqual({ id: 'e1:ask:call:p1:1', action: approval('call', 'p1') });
    expect(d.effects).toEqual([
      expect.objectContaining({ kind: 'ask_owner', idemKey: 'e1:ask:call:p1:1' }),
    ]);
    expect(d.e.state).toBe('awaiting_owner');
  });

  it('an open question is never overwritten: the next waits in the queue and is asked after the answer', () => {
    const d = draft(errand());
    ask(d, approval('book', 'p2'));
    ask(d, approval('next', 'p1'), 'card');
    expect(d.e.pending?.action).toEqual(approval('book', 'p2'));
    expect(d.e.queue.map((q) => q.id)).toEqual(['e1:ask:next:p1:2']);
    expect(d.effects).toHaveLength(1);
    const q = answered(d, 'e1:ask:book:p2:1', 'owner_confirmed');
    expect(q).toMatchObject({ action: approval('book', 'p2') });
    expect(d.e.pending?.id).toBe('e1:ask:next:p1:2');
    expect(d.e.queue).toEqual([]);
    expect(d.effects[1]).toMatchObject({
      kind: 'ask_owner',
      idemKey: 'e1:ask:next:p1:2',
      reason: 'card',
    });
  });

  it('asking the same thing again is a new question with a new id', () => {
    const d = draft(errand());
    ask(d, approval('call', 'p1'));
    answered(d, 'e1:ask:call:p1:1', 'owner_declined');
    ask(d, approval('call', 'p1'));
    expect(d.e.pending?.id).toBe('e1:ask:call:p1:2');
  });

  it('an answer must name the open question', () => {
    const d = draft(errand());
    ask(d, approval('call', 'p1'));
    expect(answered(d, 'e1:ask:call:p1:9', 'owner_confirmed')).toBe(
      'no open question e1:ask:call:p1:9'
    );
    expect(d.e.pending?.id).toBe('e1:ask:call:p1:1');
  });

  it('a text question is a text offer that says why', () => {
    const d = draft(errand());
    ask(d, approval('text', 'p1'), 'their number looks like a mobile');
    expect(d.effects[0]).toMatchObject({
      kind: 'offer_text_instead',
      placeId: 'p1',
      reason: 'their number looks like a mobile',
    });
  });

  it('asking keeps a scheduled or closed errand in its state', () => {
    const d = draft(errand({ state: 'cancelled' }));
    ask(d, approval('release', 'p1'));
    expect(d.e.state).toBe('cancelled');
  });
});

describe('withdraw', () => {
  const moot = (q: { action: { verb: string } }): boolean => q.action.verb === 'book';

  it('drops a moot open question and asks the next one that still applies', () => {
    const d = draft(errand());
    ask(d, approval('book', 'p2'));
    ask(d, approval('book', 'p3'));
    ask(d, approval('release', 'p4'));
    withdraw(d, moot);
    expect(d.e.pending).toMatchObject({ id: 'e1:ask:release:p4:3' });
    expect(d.e.queue).toEqual([]);
    expect(d.effects.at(-1)).toMatchObject({ kind: 'ask_owner', idemKey: 'e1:ask:release:p4:3' });
  });

  it('keeps an open question that still applies and only prunes the queue', () => {
    const d = draft(errand());
    ask(d, approval('release', 'p4'));
    ask(d, approval('book', 'p2'));
    withdraw(d, moot);
    expect(d.e.pending?.action.verb).toBe('release');
    expect(d.e.queue).toEqual([]);
    expect(d.effects).toHaveLength(1);
  });
});

describe('outward guard', () => {
  const body = {
    kind: 'call',
    placeId: 'p1',
    purpose: 'ask',
    approval: approval('call', 'p1'),
  } as const;

  it('emits only with the exact recorded yes', () => {
    const d = draft(errand({ approvals: [approval('call', 'p1')] }));
    expect(outward(d, body, 'call:p1')).toBe(true);
    expect(d.effects[0]).toMatchObject({ kind: 'call', idemKey: 'e1:call:p1:1' });
  });

  it('otherwise drops it and asks about that one place', () => {
    const d = draft(errand({ approvals: [approval('call', 'p1', 'p2')] }));
    expect(outward(d, body, 'call:p1')).toBe(false);
    expect(d.e.pending?.action).toEqual(approval('call', 'p1'));
    const verb = draft(errand({ approvals: [approval('text', 'p1')] }));
    expect(outward(verb, { ...body, approval: approval('text', 'p1') }, 'call:p1')).toBe(false);
    const place2 = draft(errand({ approvals: [approval('call', 'p1')] }));
    expect(outward(place2, { ...body, placeId: 'p2' }, 'call:p2')).toBe(false);
  });
});

describe('wakeAt', () => {
  it('is the soonest live timer, ignoring places whose status has no timer', () => {
    const e = errand({
      candidates: [
        place('p1', { status: 'retry', due: '2026-10-20T16:00:00.000Z' }),
        place('p2', { status: 'calling', due: '2026-10-20T14:30:00.000Z' }),
        place('p3', { status: 'declined', due: '2026-10-20T14:01:00.000Z' }),
      ],
    });
    expect(wakeAt(e)).toBe('2026-10-20T14:30:00.000Z');
  });

  it('a scheduled errand wakes a day after its slot; a closed one never', () => {
    const slot = '2026-10-27T13:00:00.000Z';
    const outcome = { status: 'booked', placeId: 'p1', when: slot } as const;
    expect(wakeAt(errand({ state: 'scheduled', outcome }))).toBe('2026-10-28T13:00:00.000Z');
    expect(wakeAt(errand({ state: 'done', outcome }))).toBeNull();
    const retrying = [place('p1', { status: 'retry', due: '2026-10-20T16:00:00.000Z' })];
    expect(wakeAt(errand({ state: 'cancelled', candidates: retrying }))).toBeNull();
  });
});

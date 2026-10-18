import { describe, expect, it } from 'vitest';
import {
  CURRENT_STEP_VERSION,
  DEFAULT_POLICY,
  OUTWARD_KINDS,
  RETRY_POLICY,
  step,
  type Effect,
  type Errand,
  type ErrandEvent,
  type NewCandidate,
  type Signal,
  type StepContext,
} from '../index.js';

const ZONE = 'America/New_York';
const NOW = new Date('2026-10-20T14:00:00.000Z'); // 10:00 in New York
const HOUR = 3_600_000;
const at = (ms: number): Date => new Date(NOW.getTime() + ms);

const place = (placeId: string, over: Partial<NewCandidate> = {}): NewCandidate => ({
  placeId,
  name: `Place ${placeId}`,
  phone: '+15550100000',
  why: 'close by',
  lineType: 'landline',
  ...over,
});

const errand = (over: Partial<Errand> = {}): Errand => ({
  id: 'e1',
  userId: 'u1',
  kind: 'appointment',
  goal: 'dental cleaning',
  zone: ZONE,
  constraints: { prefs: [] },
  state: 'planning',
  step: 'find',
  stepVersion: CURRENT_STEP_VERSION,
  nextWakeAt: null,
  candidates: [],
  pending: null,
  approvals: [],
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
  env: 'test',
  ...over,
});

type Step = Signal | [Signal, Date];
interface Run {
  next: Errand;
  effects: Effect[];
  last: Effect[];
  events: ErrandEvent[];
}

/** Runs signals in order (each at NOW unless paired with a time), collecting every effect. */
function drive(e: Errand, steps: Step[], policy: Partial<StepContext['policy']> = {}): Run {
  const run: Run = { next: e, effects: [], last: [], events: [] };
  for (const s of steps) {
    const [signal, now] = Array.isArray(s) ? s : [s, NOW];
    const r = step(run.next, signal, { now, policy: { ...DEFAULT_POLICY, ...policy } });
    run.next = r.next;
    run.last = [...r.effects];
    run.effects.push(...r.effects);
    run.events.push(...r.events);
  }
  return run;
}

const found = (...cs: NewCandidate[]): Signal => ({ type: 'candidates_found', candidates: cs });
const yes = (action: string): Signal => ({ type: 'owner_confirmed', action });
const no = (action: string): Signal => ({ type: 'owner_declined', action });
const outcome = (
  placeId: string,
  over: Partial<Extract<Signal, { type: 'call_outcome' }>>
): Signal => ({
  type: 'call_outcome',
  placeId,
  status: 'booked',
  ...over,
});
const kinds = (fx: Effect[]): string[] => fx.map((f) => f.kind);
const notes = (r: Run): string[] =>
  r.events.flatMap((e) => (e.type === 'decision' ? [e.note] : []));
const WHEN = '2026-10-27T13:00:00.000Z';

describe('errand step v1: asking before acting', () => {
  it('a shortlist asks the owner to confirm the first call, and calls nobody yet', () => {
    const r = drive(errand(), [found(place('p1'), place('p2'))]);
    expect(r.next).toMatchObject({ state: 'awaiting_owner', pending: 'call:p1' });
    expect(r.effects).toEqual([
      expect.objectContaining({
        kind: 'ask_owner',
        action: 'call:p1',
        idemKey: 'e1:ask:call:p1:1',
      }),
    ]);
  });

  it('a yes to a different action is ignored: no call, and the log says why', () => {
    const r = drive(errand(), [found(place('p1'), place('p2')), yes('call:p2')]);
    expect(r.last).toEqual([]);
    expect(r.next.approvals).toEqual([]);
    expect(notes(r)).toContain('ignored: no pending action call:p2');
  });

  it('the yes is recorded and the call carries errandId:step:attempt and the call retry policy', () => {
    const r = drive(errand(), [found(place('p1')), yes('call:p1')]);
    expect(r.next).toMatchObject({ state: 'acting', approvals: ['call:p1'], pending: null });
    expect(r.last).toEqual([
      {
        kind: 'call',
        placeId: 'p1',
        purpose: 'ask',
        approval: 'call:p1',
        idemKey: 'e1:call:p1:1',
        retry: RETRY_POLICY.call,
      },
    ]);
    expect(r.events).toContainEqual({
      type: 'owner_confirmed',
      at: NOW.toISOString(),
      action: 'call:p1',
    });
  });

  it('an outward effect whose action has no recorded yes is dropped and the owner is asked', () => {
    const waiting = errand({
      state: 'waiting',
      nextWakeAt: NOW.toISOString(),
      approvals: [],
      candidates: [{ ...place('p1'), status: 'retry', attempts: 1, approval: 'call:p1' }],
    });
    const r = drive(waiting, [{ type: 'wake' }]);
    expect(kinds(r.effects)).toEqual(['ask_owner']);
    expect(r.next).toMatchObject({ state: 'awaiting_owner', pending: 'call:p1' });
    expect(notes(r)).toContain('blocked call to p1: no owner yes for call:p1');
  });
});

describe('errand step v1: line types', () => {
  it('a line nobody has checked is looked up before anything is offered', () => {
    const r = drive(errand(), [found(place('p1', { lineType: undefined }))]);
    expect(kinds(r.effects)).toEqual(['lookup_line_type']);
    expect(r.next).toMatchObject({ state: 'planning', pending: null });
    const after = drive(r.next, [{ type: 'line_type_found', placeId: 'p1', lineType: 'landline' }]);
    expect(after.next.pending).toBe('call:p1');
  });

  it('a mobile line gets a text offered instead of a call; a yes sends the text, not a call', () => {
    const r = drive(errand(), [found(place('p1', { lineType: 'mobile' }))]);
    expect(r.effects).toEqual([
      expect.objectContaining({ kind: 'offer_text_instead', placeId: 'p1', action: 'text:p1' }),
    ]);
    const sent = drive(r.next, [yes('text:p1')]);
    expect(kinds(sent.effects)).toEqual(['text']);
    expect(sent.next).toMatchObject({ state: 'waiting', nextWakeAt: at(24 * HOUR).toISOString() });
  });

  it('a lookup that still cannot tell is never called', () => {
    const r = drive(errand(), [
      found(place('p1', { lineType: undefined })),
      { type: 'line_type_found', placeId: 'p1', lineType: 'unknown' },
    ]);
    expect(kinds(r.last)).toEqual(['offer_text_instead']);
  });

  it('no reply to a text by the wake moves on to the next place', () => {
    const r = drive(errand(), [
      found(place('p1', { lineType: 'mobile' }), place('p2')),
      yes('text:p1'),
      [{ type: 'wake' }, at(24 * HOUR)],
    ]);
    expect(r.next.pending).toBe('call:p2');
  });
});

describe('errand step v1: verifying a booking', () => {
  const calling = drive(errand(), [found(place('p1'), place('p2')), yes('call:p1')]).next;

  it('booked with a confirmation number is scheduled and asks to add it to the calendar', () => {
    const r = drive(calling, [outcome('p1', { confirmation: '4821', when: WHEN, callId: 'c1' })]);
    expect(r.next).toMatchObject({ state: 'scheduled', pending: 'schedule:p1' });
    expect(r.next.outcome).toMatchObject({
      status: 'booked',
      confirmation: '4821',
      evidence: 'c1',
    });
  });

  it('booked with an explicit read-back is scheduled', () => {
    const r = drive(calling, [outcome('p1', { readBack: true, when: WHEN })]);
    expect(r.next.state).toBe('scheduled');
  });

  it('booked with neither is only an offer and goes back to the owner', () => {
    const r = drive(calling, [outcome('p1', { confirmation: '  ', readBack: false, when: WHEN })]);
    expect(r.next).toMatchObject({ state: 'awaiting_owner', pending: 'book:p1' });
    expect(r.next.outcome?.status).toBe('offered');
    expect(notes(r)).toContain('booked without a confirmation or read-back: treated as offered');
  });

  it('a yes to an offer calls back to accept it; a no moves to the next place', () => {
    const offered = drive(calling, [outcome('p1', { status: 'offered', when: WHEN })]).next;
    expect(drive(offered, [yes('book:p1')]).last).toEqual([
      expect.objectContaining({ kind: 'call', purpose: 'accept', idemKey: 'e1:call:p1:2' }),
    ]);
    expect(drive(offered, [no('book:p1')]).next.pending).toBe('call:p2');
  });

  it('a place that wants a card goes back to the owner, even when it said booked', () => {
    const r = drive(calling, [outcome('p1', { confirmation: '9', requiresPayment: true })]);
    expect(r.next.outcome).toMatchObject({
      status: 'needs_owner',
      reason: 'the place wants a card or a deposit',
    });
    expect(r.next).toMatchObject({ state: 'awaiting_owner', pending: 'next:p1' });
    expect(r.effects.some((f) => (OUTWARD_KINDS as readonly string[]).includes(f.kind))).toBe(
      false
    );
  });

  it('a second outcome for the same call is ignored', () => {
    const r = drive(calling, [
      outcome('p1', { status: 'declined' }),
      outcome('p1', { readBack: true }),
    ]);
    expect(r.next.state).toBe('awaiting_owner');
    expect(notes(r)).toContain('ignored: no call in flight to p1');
  });
});

describe('errand step v1: voicemail and retries', () => {
  const vm = (id: string): Signal => outcome(id, { status: 'voicemail' });

  it('voicemail sleeps 2 hours when that is inside the default 09:00-17:00', () => {
    const r = drive(errand(), [found(place('p1')), yes('call:p1'), vm('p1')]);
    expect(r.next).toMatchObject({ state: 'waiting', nextWakeAt: at(2 * HOUR).toISOString() });
  });

  it('2 hours past closing waits for the next opening, using the place hours when known', () => {
    const late = at(6 * HOUR); // 16:00 in New York
    const base = [found(place('p1')), yes('call:p1')];
    const r = drive(errand(), [...base, [vm('p1'), late]]);
    expect(r.next.nextWakeAt).toBe('2026-10-21T13:00:00.000Z'); // 09:00 the next day
    const open = drive(errand(), [
      found(place('p1', { hours: { open: '08:00', close: '20:00' } })),
      yes('call:p1'),
      [vm('p1'), late],
    ]);
    expect(open.next.nextWakeAt).toBe(at(8 * HOUR).toISOString());
  });

  it('retries twice on wake, then the next place, then fails with the reason', () => {
    const t = (h: number): Date => at(h * HOUR);
    const r = drive(errand(), [
      found(place('p1'), place('p2')),
      yes('call:p1'),
      vm('p1'),
      [{ type: 'wake' }, t(1)],
      [{ type: 'wake' }, t(2)],
      [vm('p1'), t(2)],
      [{ type: 'wake' }, t(4)],
      [vm('p1'), t(4)],
    ]);
    const calls = r.effects.filter((f) => f.kind === 'call').map((f) => f.idemKey);
    expect(calls).toEqual(['e1:call:p1:1', 'e1:call:p1:2', 'e1:call:p1:3']);
    expect(notes(r)).toContain('ignored: not due yet');
    expect(r.next.pending).toBe('call:p2');
    const end = drive(r.next, [
      yes('call:p2'),
      outcome('p2', { status: 'no_answer' }),
      [{ type: 'wake' }, t(2)],
      [outcome('p2', { status: 'no_answer' }), t(2)],
      [{ type: 'wake' }, t(4)],
      [outcome('p2', { status: 'no_answer' }), t(4)],
    ]);
    expect(end.next).toMatchObject({ state: 'failed', failedReason: 'no place could book it' });
    expect(end.next.closedAt).toBeDefined();
    expect(end.last).toEqual([expect.objectContaining({ kind: 'notify_owner', about: 'failed' })]);
  });
});

describe('errand step v1: parallel calls', () => {
  const urgent = errand({ constraints: { prefs: [], urgency: 'any-slot' } });
  const four = found(place('p1'), place('p2'), place('p3'), place('p4'));

  it('calls one place at a time unless the errand is any-slot, even with parallel allowed', () => {
    expect(drive(errand(), [four], { parallel: true }).next.pending).toBe('call:p1');
    expect(drive(urgent, [four]).next.pending).toBe('call:p1');
  });

  it('any-slot with parallel calls up to 3, and the first booking cancels the others', () => {
    const r = drive(urgent, [four, yes('call:p1+p2+p3')], { parallel: true });
    expect(r.last.map((f) => f.kind === 'call' && f.placeId)).toEqual(['p1', 'p2', 'p3']);
    const won = drive(r.next, [outcome('p2', { readBack: true, when: WHEN })], { parallel: true });
    expect(won.next.state).toBe('scheduled');
    expect(won.last.filter((f) => f.kind === 'cancel_call')).toEqual([
      expect.objectContaining({ placeId: 'p1', approval: 'call:p1+p2+p3' }),
      expect.objectContaining({ placeId: 'p3', approval: 'call:p1+p2+p3' }),
    ]);
  });

  it('in parallel a voicemail drops that place instead of sleeping 2 hours', () => {
    const r = drive(urgent, [four, yes('call:p1+p2+p3'), outcome('p1', { status: 'voicemail' })], {
      parallel: true,
    });
    expect(r.next.state).toBe('acting');
    expect(r.next.candidates[0].status).toBe('exhausted');
  });
});

describe('errand step v1: calendar, follow-up and closing', () => {
  const booked = drive(errand(), [
    found(place('p1')),
    yes('call:p1'),
    outcome('p1', { confirmation: '4821', when: WHEN }),
  ]).next;

  it('a yes to scheduling writes the calendar event and a reminder the day before', () => {
    const r = drive(booked, [yes('schedule:p1')]);
    expect(r.last).toEqual([
      expect.objectContaining({ kind: 'calendar', at: WHEN, idemKey: 'e1:calendar:p1:1' }),
      expect.objectContaining({ kind: 'reminder', at: '2026-10-26T13:00:00.000Z' }),
    ]);
    expect(drive(booked, [no('schedule:p1')]).last).toEqual([]);
  });

  it('the day after the appointment it closes as done and asks how it went', () => {
    const r = drive(booked, [[{ type: 'wake' }, new Date(Date.parse(WHEN) + 24 * HOUR)]]);
    expect(r.next).toMatchObject({ state: 'done', nextWakeAt: null });
    expect(r.last).toEqual([expect.objectContaining({ kind: 'notify_owner', about: 'follow_up' })]);
    expect(drive(booked, [{ type: 'event_passed' }]).next.state).toBe('done');
  });

  it('the owner can cancel at any point, and a closed errand takes no more signals', () => {
    const r = drive(booked, [{ type: 'owner_cancelled' }, yes('schedule:p1')]);
    expect(r.next).toMatchObject({ state: 'cancelled', closedAt: NOW.toISOString() });
    expect(r.last).toEqual([]);
    expect(notes(r)).toContain('ignored: errand is cancelled');
  });
});

describe('step versions', () => {
  it('an errand saved under a version this build does not know fails closed', () => {
    const e = errand({ stepVersion: 99, state: 'acting' });
    const r = step(e, outcome('p1', { readBack: true }), { now: NOW, policy: DEFAULT_POLICY });
    expect(r.next).toBe(e);
    expect(r.effects).toEqual([]);
    expect(r.events).toContainEqual({
      type: 'decision',
      at: NOW.toISOString(),
      note: 'no rules for stepVersion 99: held, nothing done',
    });
  });
});

describe('invariants over random signal sequences', () => {
  /** Deterministic pseudo-random numbers, so a failure reproduces. */
  function rng(seed: number): () => number {
    let s = seed;
    return () => (s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  }
  const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
  const IDS = ['p1', 'p2', 'p3', 'p4'];

  function randomSignal(r: () => number, e: Errand): Signal {
    const id = pick(r, IDS);
    switch (Math.floor(r() * 8)) {
      case 0:
        return found(
          ...IDS.map((p) =>
            place(p, { lineType: pick(r, [undefined, 'landline', 'mobile', 'unknown'] as const) })
          )
        );
      case 1:
        return {
          type: 'line_type_found',
          placeId: id,
          lineType: pick(r, ['landline', 'mobile', 'unknown'] as const),
        };
      case 2:
        return yes(e.pending && r() < 0.8 ? e.pending : `call:${id}`);
      case 3:
        return no(e.pending ?? `call:${id}`);
      case 4:
      case 5:
        return outcome(e.candidates.find((c) => c.status === 'calling')?.placeId ?? id, {
          status: pick(r, ['booked', 'offered', 'declined', 'no_answer', 'voicemail'] as const),
          ...(r() < 0.3 ? { confirmation: pick(r, ['', ' ', '4821']) } : {}),
          ...(r() < 0.3 ? { readBack: r() < 0.5 } : {}),
          ...(r() < 0.1 ? { requiresPayment: true } : {}),
          when: WHEN,
        });
      case 6:
        return { type: 'wake' };
      default:
        return r() < 0.1 ? { type: 'owner_cancelled' } : { type: 'event_passed' };
    }
  }

  it('never booked without proof, and never an outward effect without the owner yes', () => {
    let checked = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const r = rng(seed);
      const urgency = r() < 0.5 ? 'any-slot' : 'normal';
      let e = errand({ constraints: { prefs: [], urgency } });
      let now = NOW;
      for (let i = 0; i < 40; i++) {
        now = new Date(now.getTime() + Math.floor(r() * 6) * HOUR);
        const res = step(e, randomSignal(r, e), {
          now,
          policy: { ...DEFAULT_POLICY, parallel: r() < 0.5 },
        });
        e = res.next;
        for (const f of res.effects) {
          if ('approval' in f) expect(e.approvals).toContain(f.approval);
        }
        if ((e.state === 'scheduled' || e.state === 'done') && e.outcome?.status === 'booked') {
          checked++;
          expect(Boolean(e.outcome.confirmation) || e.outcome.readBack === true).toBe(true);
        }
      }
    }
    expect(checked).toBeGreaterThan(20);
  });
});

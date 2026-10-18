import { describe, expect, it } from 'vitest';
import {
  CURRENT_STEP_VERSION,
  DEFAULT_POLICY,
  OUTWARD_KINDS,
  RETRY_POLICY,
  STEP_VERSIONS,
  inWindow,
  sameApproval,
  step,
  type Approval,
  type ApprovalVerb,
  type Candidate,
  type Effect,
  type Errand,
  type ErrandEvent,
  type LineType,
  type NewCandidate,
  type Signal,
  type StepContext,
} from '../index.js';

const ZONE = 'America/New_York';
const NOW = new Date('2026-10-20T14:00:00.000Z'); // Tuesday 10:00 in New York
const MIN = 60_000;
const HOUR = 60 * MIN;
const WHEN = '2026-10-27T13:00:00.000Z';
const at = (ms: number): Date => new Date(NOW.getTime() + ms);
const outwardKind = (f: Effect): boolean => (OUTWARD_KINDS as readonly string[]).includes(f.kind);

const place = (placeId: string, over: Partial<NewCandidate> = {}): NewCandidate => ({
  placeId,
  name: `Place ${placeId}`,
  phone: `+1555010${placeId.replace(/\D/g, '').padStart(4, '0')}`,
  why: 'close by',
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
  revision: 0,
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

/** A signal, a signal at a time, or a signal built from the errand as it stands (answers). */
type Step = Signal | [Signal, Date] | ((e: Errand) => Signal);
interface Run {
  next: Errand;
  effects: Effect[];
  last: Effect[];
  events: ErrandEvent[];
}
interface Opts {
  policy?: Partial<StepContext['policy']>;
  /** What the lookup service answers per place (default landline); null: answer by hand. */
  lines?: Record<string, LineType> | null;
}

/**
 * Runs steps in order, collecting every effect. Unless `lines` is null it
 * plays the lookup service: every pending lookup is answered right away.
 */
function drive(e: Errand, steps: Step[], opts: Opts = {}): Run {
  const run: Run = { next: e, effects: [], last: [], events: [] };
  const policy = { ...DEFAULT_POLICY, ...opts.policy };
  const apply = (signal: Signal, now: Date): void => {
    const r = step(run.next, signal, { now, policy });
    run.next = r.next;
    run.last = [...r.effects];
    run.effects.push(...r.effects);
    run.events.push(...r.events);
  };
  for (const s of steps) {
    const [signal, now] =
      typeof s === 'function' ? [s(run.next), NOW] : Array.isArray(s) ? s : [s, NOW];
    apply(signal, now);
    if (opts.lines === null) continue;
    for (let c = lookingUp(run.next); c; c = lookingUp(run.next)) {
      const lineType = opts.lines?.[c.placeId] ?? 'landline';
      apply({ type: 'line_type_found', placeId: c.placeId, lineType }, now);
    }
  }
  return run;
}
const lookingUp = (e: Errand): Candidate | undefined =>
  e.candidates.find((c) => c.status === 'lookup');

const found = (...cs: NewCandidate[]): Signal => ({ type: 'candidates_found', candidates: cs });
const ap = (verb: ApprovalVerb, ...placeIds: string[]): Approval => ({ verb, placeIds });
/** Answers the open question, which must be `verb` on these places. */
const answer =
  (type: 'owner_confirmed' | 'owner_declined', verb: ApprovalVerb, ids: string[]) =>
  (e: Errand): Signal => {
    expect(e.pending?.action).toEqual(ap(verb, ...ids));
    return { type, questionId: e.pending?.id ?? 'none' };
  };
const yes = (verb: ApprovalVerb, ...ids: string[]) => answer('owner_confirmed', verb, ids);
const no = (verb: ApprovalVerb, ...ids: string[]) => answer('owner_declined', verb, ids);
const outcome = (
  placeId: string,
  over: Partial<Extract<Signal, { type: 'call_outcome' }>>
): Signal => ({ type: 'call_outcome', placeId, status: 'booked', when: WHEN, ...over });
const wake = (time: Date): [Signal, Date] => [{ type: 'wake' }, time];
const kinds = (fx: Effect[]): string[] => fx.map((f) => f.kind);
const notes = (r: Run): string[] =>
  r.events.flatMap((e) => (e.type === 'decision' ? [e.note] : []));
const status = (e: Errand, id: string): string | undefined =>
  e.candidates.find((c) => c.placeId === id)?.status;

describe('asking before acting', () => {
  it('a shortlist is looked up, then the owner is asked to confirm the first call; nobody is called', () => {
    const r = drive(errand(), [found(place('p1'), place('p2'))]);
    expect(kinds(r.effects)).toEqual(['lookup_line_type', 'ask_owner']);
    expect(r.next).toMatchObject({
      state: 'awaiting_owner',
      pending: { id: 'e1:ask:call:p1:1', action: ap('call', 'p1') },
    });
    expect(r.effects.some(outwardKind)).toBe(false);
  });

  it('an answer must carry the id of the open question', () => {
    const r = drive(errand(), [
      found(place('p1')),
      { type: 'owner_confirmed', questionId: 'e1:ask:call:p1:7' },
    ]);
    expect(r.last).toEqual([]);
    expect(r.next.approvals).toEqual([]);
    expect(notes(r)).toContain('ignored: no open question e1:ask:call:p1:7');
  });

  it('a yes is recorded and dials with errandId:step:attempt, a call key and a 30 minute deadline', () => {
    const r = drive(errand(), [found(place('p1')), yes('call', 'p1')]);
    expect(r.next).toMatchObject({ state: 'acting', approvals: [ap('call', 'p1')], pending: null });
    expect(r.last).toEqual([
      {
        kind: 'call',
        placeId: 'p1',
        purpose: 'ask',
        approval: ap('call', 'p1'),
        idemKey: 'e1:call:p1:1',
        retry: RETRY_POLICY.call,
      },
    ]);
    expect(r.next.candidates[0]).toMatchObject({
      callKey: 'e1:call:p1:1',
      dials: [NOW.toISOString()],
    });
    expect(r.next.nextWakeAt).toBe(at(30 * MIN).toISOString());
    expect(r.events).toContainEqual({
      type: 'owner_confirmed',
      at: NOW.toISOString(),
      action: ap('call', 'p1'),
    });
  });

  it('an outward effect without a recorded yes is dropped and the owner is asked', () => {
    const waiting = errand({
      state: 'waiting',
      candidates: [
        {
          ...place('p1'),
          lineType: 'landline',
          lineChecked: true,
          status: 'retry',
          attempts: 1,
          approval: ap('call', 'p1'),
          due: NOW.toISOString(),
        },
      ],
    });
    const r = drive(waiting, [wake(NOW)]);
    expect(kinds(r.effects)).toEqual(['ask_owner']);
    expect(r.next).toMatchObject({
      state: 'awaiting_owner',
      pending: { action: ap('call', 'p1') },
    });
    expect(notes(r)).toContain('blocked call to p1: no owner yes covers it');
    expect(r.next.nextWakeAt).toBeNull();
    expect(drive(r.next, [wake(at(HOUR))]).effects).toEqual([]);
  });
});

describe('approvals cannot be widened', () => {
  it('a place id that could read as a separator never becomes a candidate', () => {
    const r = drive(errand(), [found(place('p1+p2'), place('call:p9'), place('p3'))]);
    expect(r.next.candidates.map((c) => c.placeId)).toEqual(['p3']);
    expect(notes(r)).toContain('dropped 2 candidate(s) whose place id is not safe');
  });

  const retrying = (id: string, yesTo: Approval): Errand =>
    errand({
      state: 'waiting',
      approvals: [yesTo],
      candidates: [
        {
          ...place(id),
          lineType: 'landline',
          lineChecked: true,
          status: 'retry',
          attempts: 1,
          approval: yesTo,
          due: NOW.toISOString(),
        },
      ],
    });

  it('a yes to one place does not cover dialling another, even if it is stored on it', () => {
    expect(kinds(drive(retrying('p2', ap('call', 'p1')), [wake(NOW)]).effects)).toEqual([
      'ask_owner',
    ]);
  });

  it('a yes to text a place does not cover calling it', () => {
    expect(kinds(drive(retrying('p1', ap('text', 'p1')), [wake(NOW)]).effects)).toEqual([
      'ask_owner',
    ]);
  });
});

describe('line types come only from a lookup', () => {
  it('a place the search labels landline is still looked up first', () => {
    const r = drive(errand(), [found(place('p1', { lineType: 'landline' }))], { lines: null });
    expect(kinds(r.effects)).toEqual(['lookup_line_type']);
    expect(r.next.candidates[0]).toMatchObject({ status: 'lookup', lineChecked: false });
    expect(r.next.candidates[0]).not.toHaveProperty('lineType');
  });

  it('a lookup answer is taken only while a lookup is pending', () => {
    const r = drive(errand(), [
      found(place('p1'), place('p2')),
      { type: 'line_type_found', placeId: 'p2', lineType: 'landline' },
    ]);
    expect(notes(r)).toContain('ignored: no lookup pending for p2');
    expect(r.next.candidates[1]).toMatchObject({ status: 'new', lineChecked: false });
  });

  it('a mobile line is offered a text, saying why; a yes sends the text, never a call', () => {
    const r = drive(errand(), [found(place('p1'))], { lines: { p1: 'mobile' } });
    expect(r.last).toEqual([
      expect.objectContaining({
        kind: 'offer_text_instead',
        placeId: 'p1',
        reason: "their number looks like a mobile, so I'll text instead of calling",
      }),
    ]);
    const sent = drive(r.next, [yes('text', 'p1')]);
    expect(kinds(sent.effects)).toEqual(['text']);
    expect(sent.next).toMatchObject({ state: 'waiting', nextWakeAt: at(24 * HOUR).toISOString() });
  });

  it('an any-slot errand waits 2 hours for a text reply, not a day', () => {
    const urgent = errand({ constraints: { prefs: [], urgency: 'any-slot' } });
    const r = drive(urgent, [found(place('p1')), yes('text', 'p1')], { lines: { p1: 'mobile' } });
    expect(r.next.nextWakeAt).toBe(at(2 * HOUR).toISOString());
  });

  it('a lookup that cannot tell, or never answers by its deadline, is offered a text', () => {
    const unsure = drive(errand(), [found(place('p1'))], { lines: { p1: 'unknown' } });
    expect(unsure.last[0]).toMatchObject({ kind: 'offer_text_instead' });
    const silent = drive(errand(), [found(place('p1')), wake(at(31 * MIN))], { lines: null });
    expect(silent.last).toEqual([
      expect.objectContaining({
        kind: 'offer_text_instead',
        reason: expect.stringContaining("couldn't tell"),
      }),
    ]);
  });

  it('dialling re-checks the line: one that is no longer callable is offered a text', () => {
    const e = errand({
      state: 'waiting',
      approvals: [ap('call', 'p1')],
      candidates: [
        {
          ...place('p1'),
          lineType: 'mobile',
          lineChecked: true,
          status: 'retry',
          attempts: 1,
          approval: ap('call', 'p1'),
          due: NOW.toISOString(),
        },
      ],
    });
    expect(kinds(drive(e, [wake(NOW)]).effects)).toEqual(['offer_text_instead']);
  });

  it('a text with no reply moves on; a reply tells the owner and asks about the next place', () => {
    const lines = { p1: 'mobile' } as const;
    const quiet = drive(
      errand(),
      [found(place('p1'), place('p2')), yes('text', 'p1'), wake(at(24 * HOUR))],
      {
        lines,
      }
    );
    expect(quiet.next.pending?.action).toEqual(ap('call', 'p2'));
    const replied = drive(
      errand(),
      [
        found(place('p1'), place('p2')),
        yes('text', 'p1'),
        { type: 'text_reply', placeId: 'p1', body: 'hi' },
      ],
      { lines }
    );
    expect(kinds(replied.last)).toEqual(['notify_owner', 'ask_owner']);
    expect(replied.next.pending?.action).toEqual(ap('next', 'p1'));
    expect(JSON.stringify(replied.next)).not.toContain('"hi"');
    const calling = drive(errand(), [found(place('p1')), yes('call', 'p1')]).next;
    const stray = drive(calling, [{ type: 'text_reply', placeId: 'p1', body: 'hi' }]);
    expect(notes(stray)).toContain('ignored: no text waiting on p1');
  });
});

describe('verifying a booking', () => {
  const calling = drive(errand(), [found(place('p1'), place('p2')), yes('call', 'p1')]).next;

  it('booked with a confirmation at a real time is scheduled and asks about the calendar', () => {
    const r = drive(calling, [outcome('p1', { confirmation: '4821', callId: 'c1' })]);
    expect(r.next).toMatchObject({ state: 'scheduled', pending: { action: ap('schedule', 'p1') } });
    expect(r.next.outcome).toMatchObject({
      status: 'booked',
      confirmation: '4821',
      evidence: 'c1',
    });
  });

  it('the same booking reported twice is not a late booking', () => {
    const once = drive(calling, [outcome('p1', { readBack: true })]).next;
    const twice = drive(once, [outcome('p1', { readBack: true })]);
    expect(twice.effects).toEqual([]);
    expect(once.queue).toEqual(twice.next.queue);
  });

  it('booked with an explicit read-back is scheduled', () => {
    expect(drive(calling, [outcome('p1', { readBack: true })]).next.state).toBe('scheduled');
  });

  it('booked with neither, with no time, or outside the window is only an offer', () => {
    const offered = (e: Errand, s: Signal): Errand => drive(e, [s]).next;
    expect(
      offered(calling, outcome('p1', { confirmation: ' ', readBack: false })).outcome?.status
    ).toBe('offered');
    expect(
      offered(calling, outcome('p1', { readBack: true, when: undefined })).outcome?.status
    ).toBe('offered');
    const windowed = {
      ...calling,
      constraints: { prefs: [], window: { to: '2026-10-25T00:00:00.000Z' } },
    };
    const late = offered(windowed, outcome('p1', { readBack: true }));
    expect(late).toMatchObject({ state: 'awaiting_owner', pending: { action: ap('book', 'p1') } });
  });

  it('a yes to an offer calls back to accept it; a no moves to the next place', () => {
    const offered = drive(calling, [outcome('p1', { status: 'offered' })]).next;
    expect(drive(offered, [yes('book', 'p1')]).last).toEqual([
      expect.objectContaining({ kind: 'call', purpose: 'accept', idemKey: 'e1:call:p1:2' }),
    ]);
    expect(drive(offered, [no('book', 'p1')]).next.pending?.action).toEqual(ap('call', 'p2'));
  });

  it('a place that wants a card goes back to the owner; a no hands them place, phone and slot', () => {
    const card = drive(calling, [outcome('p1', { confirmation: '9', requiresPayment: true })]);
    expect(card.next).toMatchObject({ pending: { action: ap('next', 'p1') } });
    expect(card.effects.some(outwardKind)).toBe(false);
    const handed = drive(card.next, [no('next', 'p1')]);
    expect(handed.next).toMatchObject({
      state: 'done',
      outcome: { status: 'needs_owner', when: WHEN },
    });
    expect(handed.last).toEqual([
      expect.objectContaining({
        kind: 'notify_owner',
        about: 'needs_owner',
        placeId: 'p1',
        phone: '+15550100001',
        when: WHEN,
      }),
    ]);
  });

  it('handing over hangs up any call still going', () => {
    const both = ap('call', 'p1', 'p2');
    const line = { lineType: 'landline', lineChecked: true, attempts: 1, approval: both } as const;
    const asking = errand({
      state: 'awaiting_owner',
      pending: { id: 'q1', action: ap('next', 'p1') },
      approvals: [both],
      candidates: [
        { ...place('p1'), ...line, status: 'needs_owner' },
        { ...place('p2'), ...line, status: 'calling', callKey: 'e1:call:p2:1' },
      ],
    });
    const r = drive(asking, [{ type: 'owner_declined', questionId: 'q1' }]);
    expect(r.next.state).toBe('done');
    expect(r.last).toContainEqual(
      expect.objectContaining({ kind: 'cancel_call', placeId: 'p2', call: 'e1:call:p2:1' })
    );
  });

  it('a second outcome for the same call is ignored', () => {
    const r = drive(calling, [
      outcome('p1', { status: 'declined' }),
      outcome('p1', { readBack: true, when: 'x' }),
    ]);
    expect(notes(r)).toContain('ignored: no call in flight to p1');
  });
});

describe('business hours, the daily cap and retries', () => {
  const vm = (id: string): Signal => outcome(id, { status: 'voicemail' });

  it('a first call after hours sleeps until the place opens', () => {
    const evening = at(8 * HOUR); // Tue 18:00
    const asked = drive(errand(), [found(place('p1'))]).next;
    const q = { type: 'owner_confirmed', questionId: asked.pending?.id ?? '' } as const;
    const slept = drive(asked, [[q, evening]]);
    expect(kinds(slept.last)).toEqual([]);
    expect(slept.next).toMatchObject({ state: 'waiting', nextWakeAt: '2026-10-21T13:00:00.000Z' });
    expect(kinds(drive(slept.next, [wake(new Date('2026-10-21T13:00:00.000Z'))]).last)).toEqual([
      'call',
    ]);
  });

  it('skips the weekend: a yes on Friday evening calls on Monday morning', () => {
    const asked = drive(errand(), [found(place('p1'))]).next;
    const q = { type: 'owner_confirmed', questionId: asked.pending?.id ?? '' } as const;
    const slept = drive(asked, [[q, new Date('2026-10-23T22:00:00.000Z')]]);
    expect(slept.next.nextWakeAt).toBe('2026-10-26T13:00:00.000Z');
  });

  it('voicemail retries 2 hours on, but never a third call to a number within a day', () => {
    const r = drive(errand(), [found(place('p1'), place('p2')), yes('call', 'p1'), vm('p1')]);
    expect(r.next).toMatchObject({ state: 'waiting', nextWakeAt: at(2 * HOUR).toISOString() });
    const second = drive(r.next, [wake(at(2 * HOUR)), [vm('p1'), at(2 * HOUR)]]);
    expect(second.effects.filter((f) => f.kind === 'call').map((f) => f.idemKey)).toEqual([
      'e1:call:p1:2',
    ]);
    expect(second.next.nextWakeAt).toBe(new Date(NOW.getTime() + 24 * HOUR + 1).toISOString());
    const third = drive(second.next, [wake(at(4 * HOUR))]);
    expect(notes(third)).toContain('ignored: not due yet');
    const nextDay = drive(second.next, [wake(at(25 * HOUR)), [vm('p1'), at(25 * HOUR)]]);
    expect(nextDay.effects.filter((f) => f.kind === 'call').map((f) => f.idemKey)).toEqual([
      'e1:call:p1:3',
    ]);
    expect(nextDay.next.pending?.action).toEqual(ap('call', 'p2'));
  });

  it('when every place is spent it fails with the reason', () => {
    const r = drive(errand(), [
      found(place('p1')),
      yes('call', 'p1'),
      outcome('p1', { status: 'declined' }),
    ]);
    expect(r.next).toMatchObject({ state: 'failed', failedReason: 'no place could book it' });
    expect(r.last).toEqual([expect.objectContaining({ kind: 'notify_owner', about: 'failed' })]);
  });

  it('a call with no outcome by its deadline is given up on and never re-dialled', () => {
    const r = drive(errand(), [
      found(place('p1'), place('p2')),
      yes('call', 'p1'),
      wake(at(31 * MIN)),
    ]);
    expect(r.effects).toContainEqual(
      expect.objectContaining({ about: 'no_outcome', placeId: 'p1' })
    );
    expect(r.next.pending?.action).toEqual(ap('call', 'p2'));
    expect(status(r.next, 'p1')).toBe('exhausted');
    expect(r.effects.filter((f) => f.kind === 'call')).toHaveLength(1);
  });

  it('a failed effect lets go of what it was for', () => {
    const calling = drive(errand(), [found(place('p1'), place('p2')), yes('call', 'p1')]).next;
    const failed = drive(calling, [
      { type: 'effect_failed', idemKey: 'e1:call:p1:1', reason: 'invalid_number' },
    ]);
    expect(status(failed.next, 'p1')).toBe('exhausted');
    expect(failed.next.pending?.action).toEqual(ap('call', 'p2'));
    const other = drive(calling, [{ type: 'effect_failed', idemKey: 'e9:call:p1:1', reason: 'x' }]);
    expect(notes(other)).toContain("ignored: not this errand's effect");
    const looking = drive(errand(), [found(place('p1'))], { lines: null }).next;
    const lookupFailed = drive(
      looking,
      [{ type: 'effect_failed', idemKey: 'e1:lookup:p1:1', reason: 'x' }],
      {
        lines: null,
      }
    );
    expect(kinds(lookupFailed.last)).toEqual(['offer_text_instead']);
  });
});

describe('parallel calls and questions', () => {
  const urgent = errand({ constraints: { prefs: [], urgency: 'any-slot' } });
  const four = found(place('p1'), place('p2'), place('p3'), place('p4'));
  const par = { policy: { parallel: true } };

  it('calls one place at a time unless the errand is any-slot AND parallel is allowed', () => {
    expect(drive(errand(), [four], par).next.pending?.action).toEqual(ap('call', 'p1'));
    expect(drive(urgent, [four]).next.pending?.action).toEqual(ap('call', 'p1'));
  });

  const live = drive(urgent, [four, yes('call', 'p1', 'p2', 'p3')], par).next;

  it('dials up to 3; the first booking hangs up the others by their call keys', () => {
    expect(live.candidates.filter((c) => c.status === 'calling').map((c) => c.placeId)).toEqual([
      'p1',
      'p2',
      'p3',
    ]);
    const won = drive(live, [outcome('p2', { readBack: true })], par);
    expect(won.next.state).toBe('scheduled');
    expect(won.last.filter((f) => f.kind === 'cancel_call')).toEqual([
      expect.objectContaining({
        placeId: 'p1',
        call: 'e1:call:p1:1',
        approval: ap('call', 'p1', 'p2', 'p3'),
      }),
      expect.objectContaining({ placeId: 'p3', call: 'e1:call:p3:1' }),
    ]);
  });

  it('a voicemail drops that place instead of sleeping', () => {
    const r = drive(live, [outcome('p1', { status: 'voicemail' })], par);
    expect(r.next.state).toBe('acting');
    expect(status(r.next, 'p1')).toBe('exhausted');
  });

  it('a second question while one is open waits its turn, then is asked', () => {
    const r = drive(
      live,
      [outcome('p2', { status: 'offered' }), outcome('p3', { status: 'offered' })],
      par
    );
    expect(r.next.pending?.action).toEqual(ap('book', 'p2'));
    expect(r.next.queue.map((q) => q.action)).toEqual([ap('book', 'p3')]);
    const after = drive(r.next, [no('book', 'p2')], par);
    expect(after.next.pending?.action).toEqual(ap('book', 'p3'));
  });

  it('a booking withdraws questions it made moot, so a stale yes cannot double-book', () => {
    const offered = drive(live, [outcome('p2', { status: 'offered' })], par).next;
    const staleId = offered.pending?.id ?? '';
    const won = drive(offered, [outcome('p1', { readBack: true })], par);
    expect(won.next.pending?.action).toEqual(ap('schedule', 'p1'));
    const stale = drive(won.next, [{ type: 'owner_confirmed', questionId: staleId }], par);
    expect(stale.last).toEqual([]);
  });

  it('a second place booking after the first is never dropped: the owner is told and asked', () => {
    const won = drive(live, [outcome('p1', { readBack: true })], par).next;
    const r = drive(won, [outcome('p3', { confirmation: '77' })], par);
    expect(r.last[0]).toMatchObject({
      kind: 'notify_owner',
      about: 'late_booking',
      placeId: 'p3',
      confirmation: '77',
      when: WHEN,
    });
    expect(r.next.queue.map((q) => q.action)).toEqual([ap('release', 'p3')]);
  });
});

describe('cancelling', () => {
  const urgent = errand({ constraints: { prefs: [], urgency: 'any-slot' } });
  const par = { policy: { parallel: true } };
  const live = drive(
    urgent,
    [
      found(place('p1'), place('p2'), place('p3')),
      yes('call', 'p1', 'p2', 'p3'),
      outcome('p2', { status: 'offered' }),
    ],
    par
  ).next;

  it('hangs up live calls only, by call key; an offer gets no effect', () => {
    const r = drive(live, [{ type: 'owner_cancelled' }], par);
    expect(r.next.state).toBe('cancelled');
    expect(r.last.filter((f) => f.kind === 'cancel_call').map((f) => f.placeId)).toEqual([
      'p1',
      'p3',
    ]);
    expect(r.next.candidates.every((c) => c.status === 'cancelled')).toBe(true);
  });

  it('a place waiting to be retried has no live call to hang up', () => {
    const waiting = drive(errand(), [
      found(place('p1')),
      yes('call', 'p1'),
      outcome('p1', { status: 'voicemail' }),
    ]).next;
    expect(kinds(drive(waiting, [{ type: 'owner_cancelled' }]).last)).toEqual(['notify_owner']);
  });

  it('a booking that lands after the cancel is reported, and releasing it needs its own yes', () => {
    const cancelled = drive(live, [{ type: 'owner_cancelled' }], par).next;
    const late = drive(cancelled, [outcome('p1', { readBack: true })], par);
    expect(kinds(late.last)).toEqual(['notify_owner', 'ask_owner']);
    expect(late.next).toMatchObject({
      state: 'cancelled',
      pending: { action: ap('release', 'p1') },
    });
    const released = drive(late.next, [yes('release', 'p1')], par);
    expect(released.last).toEqual([
      expect.objectContaining({
        kind: 'release_hold',
        placeId: 'p1',
        approval: ap('release', 'p1'),
      }),
    ]);
    expect(drive(late.next, [no('release', 'p1')], par).last).toEqual([]);
  });
});

describe('a question about something else never stalls the search', () => {
  it('an open release question does not stop the next place being planned', () => {
    const calling = drive(errand(), [
      found(place('p1'), place('p2'), place('p3')),
      yes('call', 'p1'),
    ]).next;
    const late = drive(calling, [outcome('p1', { status: 'declined' })]).next;
    const r = drive(late, [outcome('p1', { readBack: true }), no('call', 'p2')]);
    expect(r.next.pending?.action).toEqual(ap('release', 'p1'));
    expect(r.next.queue.map((q) => q.action)).toEqual([ap('call', 'p3')]);
  });
});

describe('calendar, follow-up and closing', () => {
  const booked = drive(errand(), [
    found(place('p1')),
    yes('call', 'p1'),
    outcome('p1', { confirmation: '4821' }),
  ]).next;

  it('a yes to scheduling writes the calendar event and a reminder the day before', () => {
    const r = drive(booked, [yes('schedule', 'p1')]);
    expect(r.last).toEqual([
      expect.objectContaining({ kind: 'calendar', at: WHEN, idemKey: 'e1:calendar:p1:1' }),
      expect.objectContaining({ kind: 'reminder', at: '2026-10-26T13:00:00.000Z' }),
    ]);
    expect(drive(booked, [no('schedule', 'p1')]).last).toEqual([]);
  });

  it('the day after the appointment it closes as done and asks how it went', () => {
    const r = drive(booked, [wake(new Date(Date.parse(WHEN) + 24 * HOUR))]);
    expect(r.next).toMatchObject({ state: 'done', nextWakeAt: null });
    expect(r.last).toEqual([expect.objectContaining({ kind: 'notify_owner', about: 'follow_up' })]);
    expect(drive(booked, [{ type: 'event_passed' }]).next.state).toBe('done');
  });

  it('a closed errand takes no more signals but a late booking or its open answer', () => {
    const r = drive(booked, [{ type: 'owner_cancelled' }, { type: 'wake' }]);
    expect(r.next).toMatchObject({ state: 'cancelled', closedAt: NOW.toISOString() });
    expect(notes(r)).toContain('ignored: errand is cancelled');
  });
});

describe('signals, revisions and versions', () => {
  it('an unknown signal is a no-op: same errand, no events, no revision bump', () => {
    const e = errand();
    const r = step(e, { type: 'mystery' } as unknown as Signal, {
      now: NOW,
      policy: DEFAULT_POLICY,
    });
    expect(r).toEqual({ next: e, effects: [], events: [] });
  });

  it('a step that changes the errand bumps its revision; an ignored one does not', () => {
    const r = drive(errand(), [found(place('p1'))]);
    expect(r.next.revision).toBe(2);
    expect(drive(r.next, [{ type: 'wake' }]).next.revision).toBe(2);
  });

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

  it('every listed rules version runs', () => {
    for (const v of STEP_VERSIONS) {
      const r = step(errand({ stepVersion: v }), found(place('p1')), {
        now: NOW,
        policy: DEFAULT_POLICY,
      });
      expect(r.effects.length).toBeGreaterThan(0);
    }
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
  const LINES = ['landline', 'landline', 'voip', 'mobile', 'unknown'] as const;

  it('no unproven booking, no unapproved or non-landline call, nothing outward after close', () => {
    let booked = 0;
    let dialled = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed);
      const lineOf = Object.fromEntries(IDS.map((p) => [p, pick(r, LINES)])) as Record<
        string,
        LineType
      >;
      const window = r() < 0.5 ? { to: '2026-11-01T00:00:00.000Z' } : undefined;
      let e = errand({
        constraints: { prefs: [], urgency: r() < 0.5 ? 'any-slot' : 'normal', window },
      });
      const yeses: Approval[] = [];
      let now = NOW;
      for (let i = 0; i < 60; i++) {
        now = new Date(now.getTime() + Math.floor(r() * 4) * 15 * MIN);
        const id = pick(r, IDS);
        const looking = e.candidates.find((c) => c.status === 'lookup')?.placeId;
        const roll = looking && r() < 0.7 ? 1 : Math.floor(r() * 9);
        let signal: Signal;
        if (roll === 0) signal = found(...IDS.map((p) => place(p)));
        else if (roll === 1) {
          const target = looking ?? id;
          signal = { type: 'line_type_found', placeId: target, lineType: lineOf[target] };
        } else if (roll <= 3 && e.pending && r() < 0.8) {
          if (r() < 0.7) yeses.push(e.pending.action);
          signal = {
            type: yeses.at(-1) === e.pending.action ? 'owner_confirmed' : 'owner_declined',
            questionId: e.pending.id,
          };
        } else if (roll <= 5) {
          const live = e.candidates.find((c) => c.status === 'calling')?.placeId;
          signal = outcome(live ?? (r() < 0.1 ? id : 'none'), {
            status: pick(r, ['booked', 'offered', 'declined', 'no_answer', 'voicemail'] as const),
            ...(r() < 0.4 ? { confirmation: pick(r, ['', ' ', '4821']) } : {}),
            ...(r() < 0.4 ? { readBack: r() < 0.5 } : {}),
            ...(r() < 0.1 ? { requiresPayment: true } : {}),
            when: pick(r, [WHEN, WHEN, WHEN, '2026-12-01T13:00:00.000Z', 'soon']),
          });
        } else if (roll === 6) signal = { type: 'wake' };
        else if (roll === 7 && r() < 0.04) signal = { type: 'owner_cancelled' };
        else signal = { type: 'event_passed' };
        const wasClosed = ['done', 'cancelled', 'failed'].includes(e.state);
        const res = step(e, signal, { now, policy: { ...DEFAULT_POLICY, parallel: r() < 0.5 } });
        for (const f of res.effects) {
          if (!('approval' in f)) continue;
          expect(yeses.some((a) => sameApproval(a, f.approval))).toBe(true);
          expect(f.approval.placeIds).toContain(f.placeId);
          if (wasClosed) expect(f.kind).toBe('release_hold');
          if (f.kind === 'call') {
            dialled++;
            expect(['landline', 'voip']).toContain(lineOf[f.placeId]);
          }
        }
        e = res.next;
        if ((e.state === 'scheduled' || e.state === 'done') && e.outcome?.status === 'booked') {
          booked++;
          expect(Boolean(e.outcome.confirmation) || e.outcome.readBack === true).toBe(true);
          expect(inWindow(e.outcome.when, e.constraints.window)).toBe(true);
        }
      }
    }
    expect(booked).toBeGreaterThan(10);
    expect(dialled).toBeGreaterThan(50);
  });
});

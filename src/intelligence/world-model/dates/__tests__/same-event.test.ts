/**
 * An answer stored under a nearby date doesn't restart its follow-up, and a
 * different event of the same person is still asked (memory audit 2026-10-25,
 * after #2856; same-event.ts). Made-up people only.
 */
import { describe, expect, it, vi } from 'vitest';
import { planResolution, type SupersedeJudge } from '../../temporal/resolve.js';
import {
  createFirestoreWorldFactStore,
  markFactRaised,
  type WorldFactStore,
} from '../../temporal/store.js';
import type { TemporalFact, WorldObservation } from '../../temporal/types.js';
import { createDatesRecall, dueDate, QUIET_DAYS, type RaisableDate } from '../recall.js';
import { SAME_EVENT_DAYS } from '../same-event.js';

const U = 'u1';
const TODAY = '2026-10-25';

/** The day n days before TODAY (after, when n is negative). */
const ago = (n: number): string =>
  new Date(Date.parse(`${TODAY}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

function fact(over: Partial<RaisableDate>): RaisableDate {
  return {
    id: 'wf_x',
    subject: 'Sam',
    subjectKind: 'person',
    relation: 'friend',
    subjectKey: 'person:sam',
    attribute: 'event',
    value: 'dinner',
    eventDate: ago(2),
    observedAt: `${ago(6)}T18:00:00Z`,
    validFrom: `${ago(6)}T18:00:00Z`,
    validTo: null,
    confidence: 0.7,
    source: { kind: 'summary', sessionId: 'call-0' },
    ...over,
  };
}

/** Asked about yesterday in call-1 ("how did it go?"), and closed. */
const asked = (over: Partial<RaisableDate>): RaisableDate =>
  fact({
    id: 'a',
    validTo: 'closed',
    raisedOn: ago(1),
    raisedAs: 'passed',
    raisedIn: 'call-1',
    ...over,
  });

/** Told in a call other than the one that asked. */
const later = (over: Partial<RaisableDate>): RaisableDate =>
  fact({ id: 'b', source: { kind: 'summary', sessionId: 'call-2' }, ...over });

/** A world store with the Firestore contract: open facts, and raised ones open or closed. */
function worldStore() {
  const docs = new Map<string, TemporalFact>();
  const store: WorldFactStore = {
    listOpen: async () =>
      [...docs.values()].filter((f) => f.validTo === null).map((f) => ({ ...f })),
    listRaisedSince: async (_u, since) =>
      [...docs.values()].filter((f) => (f.raisedOn ?? '') >= since).map((f) => ({ ...f })),
    async apply(_u, plan) {
      for (const f of plan.create) docs.set(f.id, { ...f });
      for (const c of plan.close) Object.assign(docs.get(c.id)!, c);
      for (const r of plan.refresh) Object.assign(docs.get(r.id)!, r);
    },
  };
  return { docs, store };
}

let n = 0;
const newId = () => `wf_${++n}`;

describe('the same event, stored again under a nearby date, is asked once', () => {
  it('the audit chain: answers re-dated to D+1 and to the call day, one closing nothing', async () => {
    const w = worldStore();
    const obs = (value: string, eventDate: string, at: string, sessionId: string) =>
      ({
        subject: 'Sam',
        subjectKind: 'person',
        relation: 'friend',
        attribute: 'event',
        value,
        eventDate,
        observedAt: at,
        confidence: 0.6,
        source: { kind: 'summary', sessionId },
      }) satisfies WorldObservation;
    const told = async (o: WorldObservation, judge: SupersedeJudge) =>
      w.store.apply(U, await planResolution(await w.store.listOpen(U), [o], { newId, judge }));
    /** One call: the fact id it raises (marked raised, as when the note is given), or null. */
    const call = async (at: string, sessionId: string): Promise<string | null> => {
      const dates = createDatesRecall({
        userId: U,
        sessionId,
        store: w.store,
        mark: (u, id, day, moment, session) =>
          markFactRaised(u, id, day, moment, session, () => fakeDb(w.docs)),
        forgotten: async () => [],
        now: () => new Date(at),
      });
      await dates.ready;
      const note = dates.note();
      if (note) dates.raised();
      await new Promise<void>((r) => {
        setTimeout(r, 0);
      });
      return note ? [...w.docs.values()].find((f) => f.raisedOn === at.slice(0, 10))!.id : null;
    };

    // Told on the 20th: dinner with Sam on the 23rd (fact A, D).
    await told(obs('dinner', '2026-10-23', '2026-10-20T18:00:00Z', 'call-0'), async () => []);
    const a = [...w.docs.values()][0];
    // Call 1, the 25th (D+2): "how did dinner with Sam go?"
    expect(await call('2026-10-25T14:40:00Z', 'call-1')).toBe(a.id);
    expect(w.docs.get(a.id)).toMatchObject({ raisedAs: 'passed', raisedIn: 'call-1' });
    // In that call: "it went great" re-dated to D+1, closing A ...
    const closeAll: SupersedeJudge = async (_o, open) => open.map((f) => f.id);
    await told(obs('went great', '2026-10-24', '2026-10-25T14:41:00Z', 'call-1'), closeAll);
    // ... and "pretty well", dated the call day, closing nothing.
    await told(obs('pretty well', '2026-10-25', '2026-10-25T14:42:00Z', 'call-1'), async () => []);
    const open = (await w.store.listOpen(U)).filter((f) => f.subjectKey === 'person:sam');
    expect(open.map((f) => f.eventDate).sort()).toEqual(['2026-10-24', '2026-10-25']);
    expect(open.every((f) => f.raisedOn === undefined)).toBe(true); // new subject+day pairs

    // Calls 2 and 3, the next days: nothing more about Sam's dinner.
    expect(await call('2026-10-26T13:01:00Z', 'call-2')).toBeNull();
    expect(await call('2026-10-27T13:01:00Z', 'call-3')).toBeNull();
  });

  it('(a) chain: an answer told in a later call that closes the asked fact', () => {
    const answer = later({ value: 'evening was lovely', eventDate: ago(1), supersedes: ['a'] });
    expect(dueDate([answer], TODAY)?.id).toBe('b'); // on its own it would be raised
    const onSameEvent = vi.fn();
    expect(dueDate([asked({}), answer], TODAY, { onSameEvent })).toBeNull();
    expect(onSameEvent).toHaveBeenCalledWith('b');
  });

  it('(b) told in the asking call, by its session; or, for an older raise, by its day', () => {
    const answer = (over: Partial<RaisableDate>) =>
      fact({ id: 'b', value: 'pretty well', eventDate: ago(1), ...over });
    const inCall = answer({ source: { kind: 'summary', sessionId: 'call-1' } });
    expect(dueDate([asked({}), inCall], TODAY)).toBeNull();
    expect(
      dueDate([asked({}), later({ value: 'pretty well', eventDate: ago(1) })], TODAY)?.id
    ).toBe('b');
    // No raisedIn: told on the raise day, in the caller's zone (9 pm in New York is UTC tomorrow).
    const old = asked({ raisedIn: undefined, raisedOn: ago(1) });
    const evening = answer({ observedAt: `${ago(0)}T01:00:00Z` });
    expect(dueDate([old, evening], TODAY)?.id).toBe('b');
    expect(dueDate([old, evening], TODAY, { timeZone: 'America/New_York' })).toBeNull();
  });

  it(`(c) same kind and words within ${SAME_EVENT_DAYS} days, from any call`, () => {
    const job = asked({ value: 'job interview', kind: 'event' });
    const at = (gap: number) => later({ value: 'interview went great', eventDate: ago(2 + gap) });
    expect(dueDate([job, at(1)], TODAY)).toBeNull();
    expect(dueDate([job, at(SAME_EVENT_DAYS)], TODAY)).toBeNull();
    expect(dueDate([job, at(SAME_EVENT_DAYS + 1)], TODAY)?.id).toBe('b');
    // The same words under another kind are another thing.
    const medical = later({ value: 'interview', kind: 'medical', eventDate: ago(1) });
    expect(dueDate([job, medical], TODAY)?.id).toBe('b');
  });

  it('only counts asks within the quiet window', () => {
    const answer = later({ eventDate: ago(1) }); // "dinner" again
    expect(dueDate([asked({ raisedOn: ago(QUIET_DAYS - 1) }), answer], TODAY)).toBeNull();
    expect(dueDate([asked({ raisedOn: ago(QUIET_DAYS) }), answer], TODAY)?.id).toBe('b');
  });
});

describe('a different event of the same person is still asked', () => {
  const mom = { subject: 'Mom', relation: 'mom', subjectKey: 'person:mom' };
  const self = {
    subject: 'self',
    subjectKind: 'self' as const,
    relation: undefined,
    subjectKey: 'self',
  };
  const kim = { subject: 'Kim', relation: 'sister', subjectKey: 'person:kim' };
  const cases: Array<[string, RaisableDate, RaisableDate]> = [
    [
      "mom's surgery, then her follow-up appointment (told in the asking call)",
      asked({ ...mom, value: 'knee surgery', kind: 'medical' }),
      fact({
        ...mom,
        id: 'b',
        value: 'follow-up appointment',
        kind: 'medical',
        eventDate: ago(-1),
        source: { kind: 'summary', sessionId: 'call-1' },
      }),
    ],
    [
      "Sam's birthday, then his interview the next day",
      asked({
        value: 'birthday',
        kind: 'birthday',
        recurrence: 'yearly',
        monthDay: ago(1).slice(5),
        eventDate: ago(1),
        raisedAs: 'today',
      }),
      later({ value: 'job interview', kind: 'event', eventDate: ago(0) }),
    ],
    [
      "sister's wedding, then her honeymoon",
      asked({ ...kim, value: 'wedding', kind: 'event', eventDate: ago(3) }),
      later({ ...kim, value: 'honeymoon', kind: 'event', eventDate: ago(1) }),
    ],
    [
      "the caller's dentist visit, then their interview",
      asked({ ...self, value: 'dentist appointment', kind: 'medical' }),
      later({ ...self, value: 'job interview', kind: 'event', eventDate: ago(1) }),
    ],
    [
      "Kim's move, then her housewarming",
      asked({ ...kim, value: 'moving into the new apartment', kind: 'event' }),
      later({ ...kim, value: 'housewarming party', kind: 'event', eventDate: ago(1) }),
    ],
    [
      'dinner with Sam, then his concert',
      asked({ value: 'dinner', kind: 'event' }),
      later({ value: 'concert', kind: 'event', eventDate: ago(0) }),
    ],
  ];

  it.each(cases)('%s', (_label, prior, next) => {
    expect(dueDate([prior, next], TODAY)?.id).toBe('b');
  });

  it('an event 10 days after the asked one', () => {
    const prior = asked({ eventDate: ago(12), raisedOn: ago(11) });
    expect(dueDate([prior, later({ eventDate: ago(2) })], TODAY)?.id).toBe('b');
  });

  it('a birthday is never matched to an ask, only by its own asked state', () => {
    // Same words, no kind to tell them apart, within SAME_EVENT_DAYS: only the exemption keeps it.
    const party = asked({ ...mom, value: 'birthday dinner', eventDate: ago(0) });
    const birthday = fact({
      ...mom,
      id: 'bd',
      value: 'birthday',
      kind: 'birthday',
      recurrence: 'yearly',
      monthDay: ago(-1).slice(5),
      eventDate: ago(-1),
      source: { kind: 'summary', sessionId: 'call-1' },
    });
    expect(dueDate([party, birthday], TODAY)?.id).toBe('bd');
    const askedSoon = { ...birthday, raisedOn: ago(1), raisedAs: 'soon' as const };
    expect(dueDate([askedSoon], TODAY)).toBeNull();
  });

  it('someone else asked about yesterday does not block Sam', () => {
    const kimAsked = asked({ ...kim, value: 'dinner' });
    expect(dueDate([kimAsked, later({ eventDate: ago(1) })], TODAY)?.id).toBe('b');
  });

  it('treats case and spacing in the subject key as one person', () => {
    const spaced = later({ subjectKey: 'person:Sam ', eventDate: ago(1) });
    expect(dueDate([spaced], TODAY)?.id).toBe('b');
    expect(dueDate([asked({}), spaced], TODAY)).toBeNull();
  });

  it('"soon" still leaves "how did it go?", for the fact and for one that replaced it', () => {
    const soon = { raisedOn: ago(3), raisedAs: 'soon' as const, validTo: null };
    expect(dueDate([asked({ ...soon })], TODAY)).toMatchObject({ id: 'a', moment: 'passed' });
    const replaced = asked({ ...soon, validTo: 'closed', supersededBy: 'b' });
    const answer = fact({ id: 'b', value: 'nervous about dinner', supersedes: ['a'] });
    expect(dueDate([replaced, answer], TODAY)).toMatchObject({ id: 'b', moment: 'passed' });
  });
});

/** Enough Firestore for markFactRaised: update() lands on the in-memory doc. */
function fakeDb(docs: Map<string, TemporalFact>) {
  const doc = (id: string) => ({
    update: async (data: Partial<TemporalFact>) => void Object.assign(docs.get(id)!, data),
  });
  return {
    collection: () => ({ doc: () => ({ collection: () => ({ doc }) }) }),
  } as never;
}

describe('loading and marking what was asked', () => {
  it('reads raised facts from the window start, newest first, bounded', async () => {
    const calls: unknown[][] = [];
    const chain = {
      where: (...a: unknown[]) => (calls.push(['where', ...a]), chain),
      orderBy: (...a: unknown[]) => (calls.push(['orderBy', ...a]), chain),
      limit: (...a: unknown[]) => (calls.push(['limit', ...a]), chain),
      get: async () => ({ docs: [{ id: 'a', data: () => ({ raisedOn: ago(1), validTo: 'x' }) }] }),
    };
    const db = { collection: () => ({ doc: () => ({ collection: () => chain }) }) };
    const store = createFirestoreWorldFactStore(() => db as never);
    expect(await store.listRaisedSince!(U, ago(QUIET_DAYS - 1))).toEqual([
      { id: 'a', raisedOn: ago(1), validTo: 'x' },
    ]);
    expect(calls).toEqual([
      ['where', 'raisedOn', '>=', ago(QUIET_DAYS - 1)],
      ['orderBy', 'raisedOn', 'desc'],
      ['limit', 50],
    ]);

    // The recall asks for exactly the window: a raise 19 days ago counts, 20 does not.
    const since = vi.fn(async () => []);
    const recall = createDatesRecall({
      userId: U,
      store: { listOpen: async () => [], listRaisedSince: since, apply: async () => undefined },
      forgotten: async () => [],
      now: () => new Date(`${TODAY}T15:00:00Z`),
    });
    await recall.ready;
    expect(since).toHaveBeenCalledWith(U, ago(QUIET_DAYS - 1));
  });

  it('a raise records its session only when the call has one', async () => {
    const docs = new Map([['a', fact({ id: 'a' })]]);
    await markFactRaised(U, 'a', TODAY, 'passed', 'call-9', () => fakeDb(docs));
    expect(docs.get('a')).toMatchObject({
      raisedOn: TODAY,
      raisedAs: 'passed',
      raisedIn: 'call-9',
    });
    docs.set('c', fact({ id: 'c' }));
    await markFactRaised(U, 'c', TODAY, 'passed', undefined, () => fakeDb(docs));
    expect(docs.get('c')).not.toHaveProperty('raisedIn');
  });
});

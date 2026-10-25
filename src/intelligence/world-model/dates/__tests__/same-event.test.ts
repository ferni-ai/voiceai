/**
 * An answer stored under a nearby date doesn't restart its follow-up (memory
 * audit 2026-10-25, after #2856). The asked state was keyed on the event's
 * day, so an answer stored under ANOTHER day (re-dated to the call day, "the
 * other day" read another way, another zone's day) was a new subject+day pair
 * and was asked about again. A one-time date of the same person within
 * SAME_EVENT_DAYS of one asked about lately now counts as already asked;
 * other events, and yearly dates, are their own thing. Made-up people only.
 */
import { describe, expect, it, vi } from 'vitest';
import { planResolution, type SupersedeJudge } from '../../temporal/resolve.js';
import { createFirestoreWorldFactStore, type WorldFactStore } from '../../temporal/store.js';
import type { TemporalFact, WorldObservation } from '../../temporal/types.js';
import {
  createDatesRecall,
  dueDate,
  QUIET_DAYS,
  SAME_EVENT_DAYS,
  type RaisableDate,
} from '../recall.js';

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
    source: { kind: 'summary', sessionId: 's1' },
    ...over,
  };
}

/** Dinner with Sam on D = ago(2), asked about yesterday and closed by its answer. */
const ASKED = fact({ id: 'a', validTo: 'closed', raisedOn: ago(1), raisedAs: 'passed' });

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
  const mark = async (_u: string, id: string, day: string, moment: string) => {
    Object.assign(docs.get(id)!, { raisedOn: day, raisedAs: moment });
  };
  return { docs, store, mark };
}

function obs(value: string, eventDate: string, at: string): WorldObservation {
  return {
    subject: 'Sam',
    subjectKind: 'person',
    relation: 'friend',
    attribute: 'event',
    value,
    eventDate,
    observedAt: at,
    confidence: 0.6,
    source: { kind: 'summary', sessionId: `s-${at}` },
  };
}

let n = 0;
const newId = () => `wf_${++n}`;

describe('an answer stored under a nearby date', () => {
  it('is not asked again (the audit chain, through the store)', async () => {
    const w = worldStore();
    const told = async (o: WorldObservation, judge?: SupersedeJudge) =>
      w.store.apply(U, await planResolution(await w.store.listOpen(U), [o], { newId, judge }));
    /** One call: the fact id it raises (marked raised, as when the note is given), or null. */
    const call = async (at: string): Promise<string | null> => {
      const ids: string[] = [];
      const dates = createDatesRecall({
        userId: U,
        store: w.store,
        mark: async (u, id, day, moment) => (ids.push(id), w.mark(u, id, day, moment)),
        forgotten: async () => [],
        now: () => new Date(at),
      });
      await dates.ready;
      if (dates.note()) dates.raised();
      await Promise.resolve();
      return ids[0] ?? null;
    };

    // Told on the 21st: dinner with Sam on the 23rd (fact A).
    await told(obs('dinner', '2026-10-23', '2026-10-21T18:00:00Z'));
    const a = [...w.docs.values()][0];
    // Call 1, the 24th: "how did dinner with Sam go?"
    expect(await call('2026-10-24T14:40:00Z')).toBe(a.id);
    // The answer is stored as fact B under the call's day, closing A.
    const closeAll: SupersedeJudge = async (_o, open) => open.map((f) => f.id);
    await told(obs('dinner went well', '2026-10-24', '2026-10-24T14:41:00Z'), closeAll);
    const b = [...w.docs.values()].find((f) => f.id !== a.id)!;
    expect(w.docs.get(a.id)).toMatchObject({ raisedOn: '2026-10-24', raisedAs: 'passed' });
    expect(w.docs.get(a.id)!.validTo).not.toBeNull();
    expect(b).toMatchObject({ eventDate: '2026-10-24', validTo: null });
    expect(b.raisedOn).toBeUndefined(); // a new subject+day pair: never asked, on its own

    // Call 2, the next day: B is a passed date that was never raised. Nothing is asked.
    expect(await call('2026-10-25T13:01:00Z')).toBeNull();
    expect(b.raisedOn).toBeUndefined();
  });

  it.each([
    ['the next day (D+1)', 1],
    ['the call day (D+2)', 0],
  ])('re-dated to %s: not asked, and its id is reported', (_label, daysAgo) => {
    const answer = fact({ id: 'b', value: 'dinner went well', eventDate: ago(daysAgo) });
    expect(dueDate([answer], TODAY)?.id).toBe('b'); // without the asked fact it would be raised
    const onSameEvent = vi.fn();
    expect(dueDate([ASKED, answer], TODAY, { onSameEvent })).toBeNull();
    expect(onSameEvent).toHaveBeenCalledWith('b');
  });

  it(`matches up to ${SAME_EVENT_DAYS} days either side, and not past that`, () => {
    const at = (gap: number) => fact({ id: 'b', eventDate: ago(2 + gap) });
    expect(dueDate([ASKED, at(SAME_EVENT_DAYS)], TODAY)).toBeNull();
    expect(dueDate([ASKED, at(SAME_EVENT_DAYS + 1)], TODAY)?.id).toBe('b');
  });

  it('only counts asks within the quiet window', () => {
    const asked = (days: number) => ({ ...ASKED, raisedOn: ago(days) });
    const answer = fact({ id: 'b', eventDate: ago(1) });
    expect(dueDate([asked(QUIET_DAYS - 1), answer], TODAY)).toBeNull();
    expect(dueDate([asked(QUIET_DAYS), answer], TODAY)?.id).toBe('b');
  });
});

describe('other events of the same person are their own thing', () => {
  it('an event 10 days after the asked one is asked', () => {
    const asked = { ...ASKED, eventDate: ago(12), raisedOn: ago(11) };
    const later = fact({ id: 'c', value: 'job interview', eventDate: ago(2) });
    expect(dueDate([asked, later], TODAY)?.id).toBe('c');
  });

  it('a birthday is never matched to a nearby ask, only its own asked state', () => {
    const mom = { subject: 'Mom', relation: 'mom', subjectKey: 'person:mom' };
    const call = (eventDate: string, raisedOn: string) =>
      fact({ ...mom, id: 'p', value: 'phone call', eventDate, validTo: 'closed', raisedOn });
    const birthday = (daysAhead: number) =>
      fact({
        ...mom,
        id: 'bd',
        value: 'birthday',
        kind: 'birthday',
        recurrence: 'yearly',
        monthDay: ago(-daysAhead).slice(5),
        eventDate: ago(-daysAhead),
      });
    // Five days after the ask about her phone call.
    expect(dueDate([call(ago(4), ago(3)), birthday(2)], TODAY)?.id).toBe('bd');
    // Two days after the call itself: within SAME_EVENT_DAYS, still its own thing.
    expect(dueDate([call(ago(1), TODAY), birthday(1)], TODAY)?.id).toBe('bd');
    // Its own asked state still applies: asked "soon" already, not again as "soon".
    const askedSoon = { ...birthday(1), raisedOn: ago(1), raisedAs: 'soon' as const };
    expect(dueDate([askedSoon], TODAY)).toBeNull();
  });

  it('someone else asked about yesterday does not block Sam', () => {
    const kim = { ...ASKED, id: 'k', subject: 'Kim', subjectKey: 'person:kim' };
    expect(dueDate([kim, fact({ id: 's', eventDate: ago(1) })], TODAY)?.id).toBe('s');
  });

  it('treats case and spacing in the subject key as one person', () => {
    const spaced = fact({ id: 's', subjectKey: 'person:Sam ', eventDate: ago(1) });
    expect(dueDate([spaced], TODAY)?.id).toBe('s');
    expect(dueDate([ASKED, spaced], TODAY)).toBeNull();
  });

  it("still allows the same fact's other moment: soon, then how it went", () => {
    const asked = fact({ id: 'a', eventDate: ago(2), raisedOn: ago(3), raisedAs: 'soon' });
    expect(dueDate([asked], TODAY)).toMatchObject({ id: 'a', moment: 'passed' });
  });
});

describe('loading what was asked lately', () => {
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
});

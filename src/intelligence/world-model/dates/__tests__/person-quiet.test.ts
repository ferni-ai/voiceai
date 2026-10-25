/**
 * One dated follow-up per person per quiet window (memory audit 2026-10-25,
 * after #2856). The asked state was keyed on the event's day, so an answer
 * stored under ANOTHER day (re-dated to the call day, "the other day" read
 * another way, another zone's day, a second event minted from the answer) was
 * a new subject+day pair and was asked about again. Made-up people only.
 */
import { describe, expect, it, vi } from 'vitest';
import { planResolution, type SupersedeJudge } from '../../temporal/resolve.js';
import { createFirestoreWorldFactStore, type WorldFactStore } from '../../temporal/store.js';
import type { TemporalFact, WorldObservation } from '../../temporal/types.js';
import { createDatesRecall, dueDate, QUIET_DAYS, type RaisableDate } from '../recall.js';

const U = 'u1';
const TODAY = '2026-10-25';

function fact(over: Partial<RaisableDate>): RaisableDate {
  return {
    id: 'wf_x',
    subject: 'Sam',
    subjectKind: 'person',
    relation: 'friend',
    subjectKey: 'person:sam',
    attribute: 'event',
    value: 'dinner',
    eventDate: '2026-10-23',
    observedAt: '2026-10-21T18:00:00Z',
    validFrom: '2026-10-21T18:00:00Z',
    validTo: null,
    confidence: 0.7,
    source: { kind: 'summary', sessionId: 's1' },
    ...over,
  };
}

/** The day n days before TODAY. */
const ago = (n: number): string =>
  new Date(Date.parse(`${TODAY}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

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

describe('one dated follow-up per person per quiet window', () => {
  it('does not ask again about an answer stored under another day (the audit chain)', async () => {
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

  it('screens the unasked answer by person, reporting its id', () => {
    const a = fact({
      id: 'a',
      validTo: '2026-10-24T14:41:00Z',
      raisedOn: ago(1),
      raisedAs: 'passed',
    });
    const b = fact({ id: 'b', value: 'dinner went well', eventDate: ago(1) });
    expect(dueDate([b], TODAY)?.id).toBe('b'); // without the asked fact, it would be raised
    const onQuiet = vi.fn();
    expect(dueDate([a, b], TODAY, { onQuiet })).toBeNull();
    expect(onQuiet).toHaveBeenCalledWith('b');
  });

  it(`lets a new event about them be raised once the ${QUIET_DAYS}-day window ends`, () => {
    const asked = (days: number) =>
      fact({ id: 'a', eventDate: ago(days + 1), validTo: 'closed', raisedOn: ago(days) });
    const next = fact({ id: 'c', value: 'job interview', eventDate: ago(2) });
    expect(dueDate([asked(QUIET_DAYS + 1), next], TODAY)?.id).toBe('c');
    expect(dueDate([asked(QUIET_DAYS), next], TODAY)?.id).toBe('c');
    expect(dueDate([asked(QUIET_DAYS - 1), next], TODAY)).toBeNull();
  });

  it('is per person: someone else asked about yesterday does not block Sam', () => {
    const kim = fact({ id: 'k', subject: 'Kim', subjectKey: 'person:kim', raisedOn: ago(1) });
    const sam = fact({ id: 's', eventDate: ago(2) });
    expect(dueDate([kim, sam], TODAY)?.id).toBe('s');
  });

  it('treats case and spacing in the subject key as one person', () => {
    const asked = fact({ id: 'a', subjectKey: 'person:sam', validTo: 'closed', raisedOn: ago(1) });
    const spaced = fact({ id: 's', subjectKey: 'person:Sam ', eventDate: ago(3) });
    expect(dueDate([spaced], TODAY)?.id).toBe('s');
    expect(dueDate([asked, spaced], TODAY)).toBeNull();
  });

  it("still allows the same day's other moment: soon, then how it went", () => {
    const asked = fact({ id: 'a', eventDate: ago(2), raisedOn: ago(3), raisedAs: 'soon' });
    expect(dueDate([asked], TODAY)).toMatchObject({ id: 'a', moment: 'passed' });
  });

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

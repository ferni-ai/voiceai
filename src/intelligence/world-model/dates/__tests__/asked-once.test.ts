/**
 * A dated follow-up is asked once (memory audit 2026-10-25). The shape of the
 * real loop, with made-up people: a plan told on its own day, "how did it go?"
 * the next day, the answer stored as a NEW fact for the same day (closing the
 * asked one, then not), so the next call, 16 minutes later, asked again, and
 * the one after that. Also the reader's guards: no guesses below the in-call
 * floor, nothing avoided or forgotten, and no "today" wish for a day told on
 * the day itself.
 */
import { describe, expect, it } from 'vitest';
import { disputeDenied, type DisputeStore } from '../../../../memory/recall/dispute.js';
import { forgetTopic, type ForgetStore } from '../../../../memory/recall/forget.js';
import { planResolution, type SupersedeJudge } from '../../temporal/resolve.js';
import type { WorldFactStore } from '../../temporal/store.js';
import type { TemporalFact, WorldObservation } from '../../temporal/types.js';
import { createDatesRecall, dueDate, type RaisableDate } from '../recall.js';

const U = 'u1';

/** A world store that also keeps what the recall marks raised, like markFactRaised. */
function worldStore() {
  const docs = new Map<string, TemporalFact>();
  const store: WorldFactStore = {
    listOpen: async () =>
      [...docs.values()].filter((f) => f.validTo === null).map((f) => ({ ...f })),
    async apply(_u, plan) {
      for (const f of plan.create) docs.set(f.id, { ...f });
      for (const c of plan.close) Object.assign(docs.get(c.id)!, c);
      for (const r of plan.refresh) Object.assign(docs.get(r.id)!, r);
    },
  };
  const mark = async (_u: string, id: string, day: string, moment: string) => {
    Object.assign(docs.get(id)!, { raisedOn: day, raisedAs: moment });
  };
  const close = async (_u: string, ids: string[], at: string, wrong?: boolean) => {
    for (const id of ids) Object.assign(docs.get(id)!, { validTo: at, forgottenAt: at, wrong });
  };
  return { docs, store, mark, close };
}

function obs(value: string, at: string, over: Partial<WorldObservation> = {}): WorldObservation {
  return {
    subject: 'Rowan',
    subjectKind: 'person',
    relation: 'friend',
    attribute: 'event',
    value,
    eventDate: '2026-10-23',
    observedAt: at,
    confidence: 0.6,
    source: { kind: 'summary', sessionId: `s-${at}` },
    ...over,
  };
}

let n = 0;
const newId = () => `wf_${++n}`;

/** One call: the date it would raise (marked raised, as when the note is given), or null. */
async function call(w: ReturnType<typeof worldStore>, at: string): Promise<string | null> {
  const dates = createDatesRecall({
    userId: U,
    store: w.store,
    mark: w.mark,
    forgotten: async () => [],
    now: () => new Date(at),
  });
  await dates.ready;
  const note = dates.note();
  if (note) dates.raised();
  await Promise.resolve();
  return note;
}

async function told(w: ReturnType<typeof worldStore>, o: WorldObservation, judge?: SupersedeJudge) {
  await w.store.apply(U, await planResolution(await w.store.listOpen(U), [o], { newId, judge }));
}

describe('a dated follow-up over a chain of answers', () => {
  it('is asked once, not once per stored answer', async () => {
    const w = worldStore();
    await told(w, obs('hanging out', '2026-10-23T15:48:00Z'));
    // Told on its own day: no "today" wish four hours later.
    expect(await call(w, '2026-10-23T19:39:00Z')).toBeNull();

    const asks: string[] = [];
    const ask = async (at: string) => ((await call(w, at)) ? asks.push(at) : 0);
    await ask('2026-10-24T14:40:00Z');
    expect(asks).toEqual(['2026-10-24T14:40:00Z']); // the first ask is real
    // The answer closes the asked fact and is stored as a new one for the same day.
    const closeAll: SupersedeJudge = async (_o, open) => open.map((f) => f.id);
    await told(w, obs('hung out, went well', '2026-10-24T14:41:00Z'), closeAll);
    await ask('2026-10-24T14:57:00Z');
    // Answered again; this time nothing is closed, so two facts for the day are open.
    await told(w, obs('meeting went pretty well', '2026-10-24T14:58:00Z'), async () => []);
    await ask('2026-10-25T13:01:00Z');

    expect(asks).toEqual(['2026-10-24T14:40:00Z']);
    const open = (await w.store.listOpen(U)).filter((f) => f.subjectKey === 'person:rowan');
    expect(open).toHaveLength(2);
    expect(open.every((f) => f.raisedAs === 'passed' && f.raisedOn === '2026-10-24')).toBe(true);
  });

  it('counts an ask on any open fact for the same person and day', () => {
    const base = fact({ id: 'a', eventDate: '2026-10-23' });
    expect(dueDate([base, fact({ id: 'b', eventDate: '2026-10-23' })], TODAY)?.id).toBe('a');
    const asked = fact({ id: 'b', eventDate: '2026-10-23', raisedOn: TODAY, raisedAs: 'passed' });
    expect(dueDate([base, asked], TODAY)).toBeNull();
    // Another day of the same person is its own thing.
    expect(dueDate([fact({ id: 'c', eventDate: '2026-10-19' }), asked], TODAY)?.id).toBe('c');
  });
});

const TODAY = '2026-10-24';
function fact(over: Partial<RaisableDate>): RaisableDate {
  return {
    id: 'wf_x',
    subject: 'Rowan',
    subjectKind: 'person',
    relation: 'friend',
    subjectKey: 'person:rowan',
    attribute: 'event',
    value: 'dinner',
    eventDate: '2026-10-23',
    observedAt: '2026-10-21T18:00:00Z',
    validFrom: '2026-10-21T18:00:00Z',
    validTo: null,
    confidence: 0.6,
    source: { kind: 'summary', sessionId: 's1' },
    ...over,
  };
}

describe('dueDate guards', () => {
  it('asks at the in-call floor (0.6), never below it', () => {
    expect(dueDate([fact({ confidence: 0.6 })], TODAY)?.id).toBe('wf_x');
    expect(dueDate([fact({ confidence: 0.5 })], TODAY)).toBeNull();
  });

  it('never raises a person they asked not to bring things up about', () => {
    const avoid = (subject: string) =>
      fact({
        id: `t_${subject}`,
        subject,
        subjectKey: `person:${subject.toLowerCase()}`,
        attribute: 'thread',
        value: 'avoid: the AI project',
        eventDate: undefined,
      });
    expect(dueDate([fact({}), avoid('Kim')], TODAY)?.id).toBe('wf_x');
    expect(dueDate([fact({}), avoid('Rowan')], TODAY)).toBeNull();
    // An avoided topic hides it whoever it is about.
    const topic = fact({ ...avoid('self'), subjectKey: 'self', value: 'avoid: dinner' });
    expect(dueDate([fact({}), topic], TODAY)).toBeNull();
  });

  it('never raises a forgotten topic, even on a fact the forget did not close', () => {
    expect(dueDate([fact({})], TODAY, { forgotten: ['Kim'] })?.id).toBe('wf_x');
    expect(dueDate([fact({})], TODAY, { forgotten: ['Rowan'] })).toBeNull();
  });

  it("wishes them well today only for a day told before it, in the caller's zone", () => {
    const day = { eventDate: TODAY };
    expect(dueDate([fact({ ...day, observedAt: '2026-10-23T20:00:00Z' })], TODAY)?.moment).toBe(
      'today'
    );
    expect(dueDate([fact({ ...day, observedAt: '2026-10-24T09:00:00Z' })], TODAY)).toBeNull();
    // 9 pm on the 23rd in New York is the 24th in UTC: told the day before, there.
    const evening = fact({ ...day, observedAt: '2026-10-24T01:00:00Z' });
    expect(dueDate([evening], TODAY)).toBeNull();
    expect(dueDate([evening], TODAY, { timeZone: 'America/New_York' })?.moment).toBe('today');
  });

  it('raises nothing when the forgotten topics cannot be read', async () => {
    const w = worldStore();
    await told(w, obs('dinner', '2026-10-21T18:00:00Z'));
    const recall = (forgotten: () => Promise<string[] | null>) =>
      createDatesRecall({
        userId: U,
        store: w.store,
        forgotten,
        now: () => new Date(`${TODAY}T15:00:00Z`),
      });
    const ok = recall(async () => []);
    await ok.ready;
    expect(ok.note()).toContain('dinner');
    const unreadable = recall(async () => null);
    await unreadable.ready;
    expect(unreadable.note()).toBeNull();
  });
});

describe('forget and dispute reach the world facts', () => {
  async function seeded() {
    const w = worldStore();
    await told(w, obs('dinner with Rowan', '2026-10-21T18:00:00Z'));
    await told(w, obs('job interview', '2026-10-21T18:00:00Z', { subject: 'Kim' }));
    return w;
  }
  const due = async (w: ReturnType<typeof worldStore>) => {
    const facts = (await w.store.listOpen(U)) as RaisableDate[];
    return facts.filter((f) => dueDate([f], TODAY)).map((f) => f.subject);
  };

  it('a forgotten topic is closed in world_facts and no longer raised', async () => {
    const w = await seeded();
    expect(await due(w)).toEqual(['Rowan', 'Kim']);
    const store: ForgetStore = {
      facts: async () => [],
      markForgotten: async () => undefined,
      addTopic: async () => undefined,
      topics: async () => [],
      worldFacts: (u) => w.store.listOpen(u),
      markWorldFacts: w.close,
    };
    const result = await forgetTopic(U, 'Rowan', store, new Date('2026-10-24T12:00:00Z'));
    expect(result.kind).toBe('forgotten');
    expect(await due(w)).toEqual(['Kim']);
    const closed = [...w.docs.values()].find((f) => f.subject === 'Rowan')!;
    expect(closed).toMatchObject({
      forgottenAt: '2026-10-24T12:00:00.000Z',
      validTo: '2026-10-24T12:00:00.000Z',
    });
    expect(closed.wrong).toBeUndefined();
  });

  it('a disputed memory marks the world fact wrong and closes it', async () => {
    const w = await seeded();
    const store: DisputeStore = {
      facts: async () => [],
      summaries: async () => [],
      markFacts: async () => undefined,
      markSummaryItems: async () => undefined,
      worldFacts: (u) => w.store.listOpen(u),
      markWorldFacts: w.close,
    };
    const result = await disputeDenied(U, { kind: 'echo', topic: 'job interview' }, store);
    expect(result).toEqual({ kind: 'disputed', facts: 1, items: 0 });
    const kim = [...w.docs.values()].find((f) => f.subject === 'Kim')!;
    expect(kim).toMatchObject({ wrong: true });
    expect(kim.validTo).not.toBeNull();
    expect(await due(w)).toEqual(['Rowan']);
  });
});

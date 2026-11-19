/**
 * forgetMemory's `alsoAbout` (forget-related.ts, FORGET_RELATED_WORDS): the
 * words the model names as part of a forgotten topic are forgotten too,
 * through the same forgetTopic as the topic.
 *
 * Live leak, dev 2026-11-19: "forget everything about the Denver job" stored
 * "Denver job", and the next call still raised the recruiter call, which
 * shares no word with it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  forgetForCaller,
  type ForgetStore,
  type StoredFactRef,
  type WorldFactRef,
} from '../forget.js';

const fact = (id: string, key: string, value: string): StoredFactRef => ({
  collection: 'dynamic_facts',
  id,
  data: { entityName: 'User', key, value, syncedToSpanner: false },
});

function memoryStore(facts: StoredFactRef[], world: WorldFactRef[] = []) {
  const state = {
    facts: facts.map((f) => ({ ...f, data: { ...f.data } })),
    world: world.map((w) => ({ ...w })),
    topics: [] as string[],
  };
  const store: ForgetStore = {
    facts: async () => state.facts,
    markForgotten: async (_u, refs, at) => {
      for (const r of refs) {
        const f = state.facts.find((x) => x.collection === r.collection && x.id === r.id);
        if (f) f.data.forgottenAt = at;
      }
    },
    deleteFacts: async (_u, refs) => {
      state.facts = state.facts.filter((f) => !refs.some((r) => r.id === f.id));
      return [];
    },
    addTopic: async (_u, t) => {
      if (!state.topics.includes(t)) state.topics.push(t);
    },
    topics: async () => state.topics,
    worldFacts: async () => state.world.filter((w) => w.validTo === null),
    markWorldFacts: async (_u, ids, at) => {
      for (const w of state.world) if (ids.includes(w.id)) w.validTo = at;
    },
  };
  return { store, state };
}

const UID = 'u-sam';
const MAX_RELATED = 5; // forget-related.ts
const offer = fact('d1', 'job offer', 'job offer from the Denver office');
const recruiter = fact('d2', 'plan', 'call the recruiter back Friday to give them an answer');
const tomatoes = fact('d3', 'garden', 'growing tomatoes on the balcony');
const callBack: WorldFactRef = {
  id: 'w1',
  subject: 'Sam',
  attribute: 'plans',
  value: 'call the recruiter back on Friday',
  validTo: null,
};
const marked = (state: { facts: StoredFactRef[] }) =>
  state.facts.filter((f) => typeof f.data.forgottenAt === 'string').map((f) => f.id);

afterEach(() => {
  vi.useRealTimers();
  delete process.env.FORGET_RELATED_WORDS;
  delete process.env.FORGET_DELETES;
});

describe('forgetForCaller with related words (FORGET_RELATED_WORDS on)', () => {
  it('forgets each related phrase as a topic: facts, world facts and the topic itself', async () => {
    process.env.FORGET_RELATED_WORDS = 'on';
    const { store, state } = memoryStore([offer, recruiter, tomatoes], [callBack]);
    const result = await forgetForCaller(UID, 'the Denver job', store, [
      'the recruiter',
      'job offer',
    ]);
    expect(result).toEqual({ kind: 'forgotten', marked: 1 }); // the main topic's result
    expect(marked(state)).toEqual(['d1', 'd2']);
    expect(state.facts.find((f) => f.id === 'd3')?.data.forgottenAt).toBeUndefined();
    expect(state.world[0]?.validTo).toEqual(expect.any(String));
    expect(state.topics).toEqual(['Denver job', 'recruiter', 'job offer']);
  });

  it('skips a related phrase that is too broad, and the main topic still goes through', async () => {
    process.env.FORGET_RELATED_WORDS = 'on';
    const theo = Array.from({ length: 6 }, (_, i) => fact(`t${i}`, `theo ${i}`, 'Theo said so'));
    const { store, state } = memoryStore([offer, recruiter, tomatoes, ...theo]);
    const result = await forgetForCaller(UID, 'the Denver job', store, ['Theo', 'the recruiter']);
    expect(result).toEqual({ kind: 'forgotten', marked: 1 });
    expect(marked(state)).toEqual(['d1', 'd2']); // no Theo fact
    expect(state.topics).toEqual(['Denver job', 'recruiter']);
  });

  it(`applies at most ${MAX_RELATED} related phrases`, async () => {
    process.env.FORGET_RELATED_WORDS = 'on';
    const towns = ['Aspen', 'Boulder', 'Cheyenne', 'Durango', 'Estes', 'Fruita', 'Golden'];
    const facts = towns.map((t, i) => fact(`c${i}`, 'trip', `drive to ${t} next month`));
    const { store, state } = memoryStore([offer, tomatoes, ...facts]);
    await forgetForCaller(UID, 'the Denver job', store, towns);
    expect(state.topics).toEqual(['Denver job', ...towns.slice(0, MAX_RELATED)]);
    expect(marked(state)).toEqual(['d1', 'c0', 'c1', 'c2', 'c3', 'c4']);
  });

  it('applies none when the main topic is not forgotten (too broad)', async () => {
    process.env.FORGET_RELATED_WORDS = 'on';
    const family = Array.from({ length: 8 }, (_, i) => fact(`f${i}`, `family ${i}`, 'family'));
    const { store, state } = memoryStore([recruiter, ...family]);
    const result = await forgetForCaller(UID, 'my family', store, ['the recruiter']);
    expect(result).toEqual({ kind: 'too-broad', matched: 8 });
    expect(marked(state)).toEqual([]);
    expect(state.topics).toEqual([]);
  });

  it('deletes the related facts too with FORGET_DELETES on', async () => {
    process.env.FORGET_RELATED_WORDS = 'on';
    process.env.FORGET_DELETES = 'on';
    const { store, state } = memoryStore([offer, recruiter, tomatoes]);
    await forgetForCaller(UID, 'the Denver job', store, ['the recruiter']);
    expect(state.facts.map((f) => f.id)).toEqual(['d3']);
  });
});

describe('forgetForCaller with related words, flag off', () => {
  it('is what main does: the related phrases are accepted, never stored or applied', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-19T15:00:00Z'));
    const withWords = memoryStore([offer, recruiter, tomatoes], [callBack]);
    const without = memoryStore([offer, recruiter, tomatoes], [callBack]);
    const r1 = await forgetForCaller(UID, 'the Denver job', withWords.store, ['the recruiter']);
    const r2 = await forgetForCaller(UID, 'the Denver job', without.store);
    expect(r1).toEqual(r2);
    expect(withWords.state).toEqual(without.state);
    expect(withWords.state.topics).toEqual(['Denver job']);
    expect(marked(withWords.state)).toEqual(['d1']); // the leak this flag fixes
  });
});

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

// Every log line any module writes, to check none carries what was forgotten.
const logged = vi.hoisted(() => [] as unknown[][]);
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  const logger: Record<string, unknown> = new Proxy(
    {},
    { get: (_t, key) => (key === 'child' ? () => logger : (...a: unknown[]) => logged.push(a)) }
  );
  return { ...real, createLogger: () => logger };
});
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

  it('logs a too-broad related phrase without its words', async () => {
    process.env.FORGET_RELATED_WORDS = 'on';
    const theo = Array.from({ length: 6 }, (_, i) => fact(`t${i}`, `theo ${i}`, 'Theo said so'));
    const { store, state } = memoryStore([offer, recruiter, tomatoes, ...theo]);
    logged.length = 0;
    await forgetForCaller(UID, 'the Denver job', store, ['Theo', 'the recruiter']);
    expect(state.topics).toEqual(['Denver job', 'recruiter']); // Theo was too broad
    const lines = JSON.stringify(logged);
    expect(lines).toMatch(/too broad/); // the skip is logged
    expect(lines).not.toMatch(/theo|recruiter|denver/i);
  });

  it("fails the forget when a related phrase can't be stored, never claiming it went through", async () => {
    process.env.FORGET_RELATED_WORDS = 'on';
    const { store, state } = memoryStore([offer, recruiter, tomatoes]);
    const addTopic = store.addTopic;
    store.addTopic = async (u, t, asked) => {
      if (t === 'recruiter') throw new Error('firestore unavailable');
      return addTopic(u, t, asked);
    };
    const result = await forgetForCaller(UID, 'the Denver job', store, ['the recruiter']);
    expect(result).toEqual({ kind: 'failed' });
    expect(state.topics).toEqual(['Denver job']);
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

/**
 * Live leak, dev 2026-11-19 (fgR1): the model forgot "Theo's new cell phone
 * number" and passed no related words, and the next call read the number back.
 * The facts held it as "435-555-0142 (new/current)" and "Sam's brother is Theo
 * and his new number is 435-555-0142": neither says "cell" or "phone", so the
 * all-words match hid neither.
 */
describe('forgetForCaller: the phone number a topic names (FORGET_RELATED_WORDS)', () => {
  const about = (id: string, entityName: string, value: string): StoredFactRef => ({
    collection: 'dynamic_facts',
    id,
    data: { entityName, key: 'phone', value, syncedToSpanner: false },
  });
  const theoNumber = about('n1', 'Theo', '435-555-0142');
  const theoSentence = fact(
    'n2',
    'brother',
    "Sam's brother is Theo and his new number is 435-555-0142"
  );
  const brother = fact('n3', 'brother', 'brother: Theo');
  const maya = about('n4', 'Maya', '212-555-0199');
  const counted = (store: ForgetStore): { n: number } => {
    const reads = { n: 0 };
    const { facts } = store;
    store.facts = async (u) => {
      reads.n++;
      return facts(u);
    };
    return reads;
  };

  it("forgets the number itself, so a fact that never says 'cell phone' goes too", async () => {
    process.env.FORGET_RELATED_WORDS = 'on';
    const { store, state } = memoryStore([theoNumber, theoSentence, brother, maya, tomatoes]);
    const result = await forgetForCaller(UID, "Theo's new cell phone number", store, []);
    expect(result.kind).toBe('forgotten');
    expect(marked(state)).toEqual(['n1', 'n2']); // not "brother: Theo", not Maya's number
    expect(state.topics).toEqual(["Theo's new cell phone number", '4355550142']);
  });

  it('finds the number through a related phrase too', async () => {
    process.env.FORGET_RELATED_WORDS = 'on';
    const { store, state } = memoryStore([offer, theoNumber, maya]);
    await forgetForCaller(UID, 'the Denver job', store, ["Theo's cell"]);
    expect(state.topics).toEqual(['Denver job', "Theo's cell", '4355550142']);
    expect(marked(state)).toEqual(['d1', 'n1']);
  });

  it("needs no 'new' in the fact: it dates the number, it isn't whose it is", async () => {
    process.env.FORGET_RELATED_WORDS = 'on';
    const { store, state } = memoryStore([theoNumber, brother, maya]);
    await forgetForCaller(UID, "Theo's new number", store, []);
    expect(state.topics).toEqual(["Theo's new number", '4355550142']);
    expect(marked(state)).toEqual(['n1']);
  });

  it('forgets no number for a topic that names nobody it belongs to', async () => {
    process.env.FORGET_RELATED_WORDS = 'on';
    const { store, state } = memoryStore([theoNumber, maya, tomatoes]);
    await forgetForCaller(UID, 'the new phone number', store, []);
    expect(state.topics).toEqual(['new phone number']);
    expect(marked(state)).toEqual([]);
  });

  it('reads the facts no second time for a topic that names no number', async () => {
    process.env.FORGET_RELATED_WORDS = 'on';
    const { store, state } = memoryStore([theoNumber, theoSentence, brother]);
    const reads = counted(store);
    await forgetForCaller(UID, "Theo's birthday", store, []);
    expect(reads.n).toBe(1);
    expect(state.topics).toEqual(["Theo's birthday"]);
  });

  it('with the flag off, forgets only the topic, as main does', async () => {
    const { store, state } = memoryStore([theoNumber, theoSentence, brother, maya]);
    const reads = counted(store);
    await forgetForCaller(UID, "Theo's new cell phone number", store, []);
    expect(reads.n).toBe(1);
    expect(state.topics).toEqual(["Theo's new cell phone number"]);
    expect(marked(state)).toEqual([]); // the leak
  });
});

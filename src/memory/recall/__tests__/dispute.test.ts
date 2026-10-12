/**
 * Seth's prod call, 2026-10-12. Peter: "How did those contracts end up looking
 * by the time you finally wrapped up last night?" Seth: "What contracts?" The
 * contracts came from a mishearing on a dev call; these are his stored facts.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { denialOf, disputeDenied, disputeForCaller } from '../dispute.js';
import type { ForgetStore, StoredFactRef } from '../forget.js';
import { loadRecallSnapshot } from '../session-recall.js';

const PETER =
  'A quick bowl is hard to beat on a Monday. How did those contracts end up looking by the time you finally wrapped up last night?';

const fact = (id: string, data: Record<string, unknown>): StoredFactRef => ({
  collection: 'dynamic_facts',
  id,
  data,
});

const SETH_FACTS = [
  fact('f_f6d35aee', { entityName: 'Night Owl', key: 'business assets', value: 'contracts' }),
  fact('f_6a72af2b', {
    entityName: 'User',
    key: 'conversational pattern',
    value: "Repeatedly fixates on 'Night Owl's contracts' while abruptly shifting topics",
  }),
  fact('d3', { entityName: 'Biscuit', key: 'breed', value: 'golden retriever' }),
  fact('d4', { entityName: 'User', key: 'move', value: 'moving to Austin in October' }),
  fact('d5', { entityName: 'User', key: 'birthday', value: 'birthday is in October' }),
];

function memoryStore(facts: StoredFactRef[]) {
  const state = {
    facts: facts.map((f) => ({ ...f, data: { ...f.data } })),
    topics: [] as string[],
  };
  const store: ForgetStore = {
    facts: async () => state.facts,
    markForgotten: async (_u, refs, at) => {
      for (const r of refs) {
        const f = state.facts.find((x) => x.id === r.id);
        if (f) f.data.forgottenAt = at;
      }
    },
    addTopic: async (_u, t) => {
      if (!state.topics.includes(t)) state.topics.push(t);
    },
    topics: async () => state.topics,
  };
  const marked = () => state.facts.filter((f) => f.data.forgottenAt).map((f) => f.id);
  return { store, state, marked };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('denialOf', () => {
  it('"What contracts?" after Peter brought them up is a denial of contracts', () => {
    expect(denialOf('What contracts?', PETER)).toEqual({ kind: 'echo', topic: 'contracts' });
    expect(denialOf('what contracts are you talking about', PETER)).toEqual({
      kind: 'echo',
      topic: 'contracts',
    });
  });

  it('is not a denial when the reply never named it, or was not about the caller', () => {
    expect(denialOf('What contracts?', 'Seth, of course I know your name.')).toBeNull();
    expect(denialOf('What contracts?', 'I spent the morning reading about contracts.')).toBeNull();
    expect(denialOf('What is today?', 'You asked me earlier what today is.')).toBeNull();
    expect(denialOf('What are you up to today, Fern?', PETER)).toBeNull();
  });

  it('"I never said that" disputes what the reply asserted', () => {
    const d = denialOf('I never said that.', "So you're moving to Austin in October?");
    expect(d?.kind).toBe('denial');
  });
});

describe('disputeDenied', () => {
  it('marks the contract facts, records the topic, keeps the rest', async () => {
    const { store, state, marked } = memoryStore(SETH_FACTS);
    const result = await disputeDenied('seth', { kind: 'echo', topic: 'contracts' }, store);
    expect(result).toEqual({ kind: 'disputed', marked: 2 });
    expect(marked()).toEqual(['f_f6d35aee', 'f_6a72af2b']);
    expect(state.topics).toEqual(['contracts']);
  });

  it('recall then serves neither the facts nor the contract follow-up', async () => {
    const { store, state } = memoryStore(SETH_FACTS);
    const before = await loadRecallSnapshot(
      {
        facts: async () => state.facts.map((f) => f.data),
        summaries: async () => [{ followUpItems: ['How did the contract wrangling turn out?'] }],
        forgotten: async () => [...state.topics],
      },
      'seth'
    );
    expect(before.followUps).toEqual(['How did the contract wrangling turn out?']);

    await disputeDenied('seth', { kind: 'echo', topic: 'contracts' }, store);
    const after = await loadRecallSnapshot(
      {
        facts: async () => state.facts.map((f) => f.data),
        summaries: async () => [{ followUpItems: ['How did the contract wrangling turn out?'] }],
        forgotten: async () => [...state.topics],
      },
      'seth'
    );
    expect(after.followUps).toEqual([]);
    expect(after.facts.map((f) => f.value).join(' ')).not.toMatch(/contract/i);
    expect(after.facts.map((f) => f.value)).toContain('golden retriever');
  });

  it('a plain denial marks only facts sharing two words with the reply, and records no topic', async () => {
    const { store, state, marked } = memoryStore(SETH_FACTS);
    const denial = denialOf("No, that's wrong.", "So you're moving to Austin in October?");
    expect(denial).not.toBeNull();
    await disputeDenied('seth', denial!, store);
    expect(marked()).toEqual(['d4']); // the October birthday shares one word and stays
    expect(state.topics).toEqual([]);
  });

  it('refuses a denial that would cover many facts', async () => {
    // 8 of 38 facts: under forgetTopic's own 30% share, still too many for one denial.
    const many = [
      ...Array.from({ length: 8 }, (_, i) =>
        fact(`c${i}`, { entityName: 'User', key: 'work', value: `contract number ${i}` })
      ),
      ...Array.from({ length: 30 }, (_, i) =>
        fact(`o${i}`, { entityName: 'User', key: 'other', value: `unrelated note ${i}` })
      ),
    ];
    const { store, state, marked } = memoryStore(many);
    const result = await disputeDenied('seth', { kind: 'echo', topic: 'contracts' }, store);
    expect(result).toEqual({ kind: 'too-broad', matched: 8 });
    expect(marked()).toEqual([]);
    expect(state.topics).toEqual([]);
  });
});

describe('disputeForCaller', () => {
  it('anonymous callers are never disputed', async () => {
    const { store, marked } = memoryStore(SETH_FACTS);
    expect(await disputeForCaller('anonymous', 'What contracts?', PETER, store)).toEqual({
      kind: 'nothing',
    });
    expect(marked()).toEqual([]);
  });

  it('reads the line against the reply and disputes it', async () => {
    const { store, marked } = memoryStore(SETH_FACTS);
    expect(await disputeForCaller('seth', 'What contracts?', PETER, store)).toEqual({
      kind: 'disputed',
      marked: 2,
    });
    expect(marked()).toEqual(['f_f6d35aee', 'f_6a72af2b']);
  });
});

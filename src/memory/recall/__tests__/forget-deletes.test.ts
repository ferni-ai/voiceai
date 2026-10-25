/**
 * FORGET_DELETES (forget.ts): off, "forget that" hides the
 * facts and Ferni says only that he won't bring it up; on, the facts are
 * deleted and he says so, and a fact that can't be deleted yet is hidden.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  forgetDone,
  forgetDoneNote,
  forgetTopic,
  mayHaveGraphCopy,
  type ForgetStore,
  type StoredFactRef,
} from '../forget.js';

const fact = (collection: string, id: string, data: Record<string, unknown>): StoredFactRef => ({
  collection,
  id,
  data,
});

function memoryStore(facts: StoredFactRef[], cannotDelete: string[] = []) {
  const state = {
    facts: facts.map((f) => ({ ...f, data: { ...f.data } })),
    topics: [] as string[],
  };
  const deleteFacts = vi.fn(async (_u: string, refs: StoredFactRef[]) => {
    const kept = refs.filter((r) => cannotDelete.includes(r.id));
    state.facts = state.facts.filter(
      (f) => !refs.some((r) => r.id === f.id && !cannotDelete.includes(r.id))
    );
    return kept;
  });
  const store: ForgetStore = {
    facts: async () => state.facts,
    markForgotten: async (_u, refs, at) => {
      for (const r of refs) {
        const f = state.facts.find((x) => x.collection === r.collection && x.id === r.id);
        if (f) f.data.forgottenAt = at;
      }
    },
    deleteFacts,
    addTopic: async (_u, t) => {
      if (!state.topics.includes(t)) state.topics.push(t);
    },
    topics: async () => state.topics,
  };
  return { store, state, deleteFacts };
}

const divorce = () => [
  fact('dynamic_facts', 'd1', { entityName: 'User', key: 'divorce', value: 'Finalised in March' }),
  fact('extracted_facts', 'e1', { fact: 'Going through a divorce' }),
  fact('dynamic_facts', 'd3', { entityName: 'Biscuit', key: 'breed', value: 'golden retriever' }),
];
const ids = (facts: StoredFactRef[]) => facts.map((f) => f.id);
const at = new Date('2026-10-18T12:00:00Z');

describe('forget that, FORGET_DELETES off (the default)', () => {
  it('hides the facts, keeps them stored, and never says they were forgotten or deleted', async () => {
    const { store, state, deleteFacts } = memoryStore(divorce());
    const result = await forgetTopic('u', 'my divorce', store, at, {});
    expect(result).toEqual({ kind: 'forgotten', marked: 2 });
    expect(deleteFacts).not.toHaveBeenCalled();
    expect(ids(state.facts)).toEqual(['d1', 'e1', 'd3']);
    expect(state.facts.filter((f) => f.data.forgottenAt).map((f) => f.id)).toEqual(['d1', 'e1']);
    if (result.kind !== 'forgotten') throw new Error('not forgotten');
    expect(forgetDone(result)).toBe("I won't bring that up again.");
    expect(forgetDone(result)).not.toMatch(/forgot|delet|eras|remov/i);
    expect(forgetDoneNote(result)).toMatch(/not erased/);
    expect(forgetDoneNote(result)).toMatch(/Don't say you've forgotten, deleted or erased it/);
  });
});

describe('forget that, FORGET_DELETES on', () => {
  const on = { FORGET_DELETES: 'on' };

  it('deletes the facts about the topic, and only those, and says it deleted them', async () => {
    const { store, state } = memoryStore(divorce());
    expect(ids(state.facts)).toEqual(['d1', 'e1', 'd3']);
    const result = await forgetTopic('u', 'my divorce', store, at, on);
    expect(result).toEqual({ kind: 'forgotten', marked: 2, deleted: 2, hidden: 0 });
    expect(ids(state.facts)).toEqual(['d3']);
    expect(state.topics).toEqual(['divorce']); // summaries and transcripts stay out of recall
    if (result.kind !== 'forgotten') throw new Error('not forgotten');
    expect(forgetDone(result)).toBe(
      "I've deleted the facts I'd saved about that, and I won't bring it up again."
    );
  });

  it('hides a fact it could not delete yet, and then says only that it will not bring it up', async () => {
    const { store, state } = memoryStore(divorce(), ['d1']);
    const result = await forgetTopic('u', 'my divorce', store, at, on);
    expect(result).toEqual({ kind: 'forgotten', marked: 2, deleted: 1, hidden: 1 });
    expect(ids(state.facts)).toEqual(['d1', 'd3']);
    expect(state.facts.find((f) => f.id === 'd1')?.data.forgottenAt).toBe(at.toISOString());
    if (result.kind !== 'forgotten') throw new Error('not forgotten');
    expect(forgetDone(result)).toBe("I won't bring that up again.");
  });

  it('never claims deletion when nothing about the topic was stored', async () => {
    const { store, deleteFacts } = memoryStore(divorce());
    const result = await forgetTopic('u', 'my sailing trip', store, at, on);
    expect(deleteFacts).not.toHaveBeenCalled();
    if (result.kind !== 'forgotten') throw new Error('not forgotten');
    expect(forgetDone(result)).toBe("I won't bring that up again.");
  });

  it('still refuses a topic that covers much of what is known, deleting nothing', async () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      fact('dynamic_facts', `f${i}`, { entityName: 'User', key: `family ${i}`, value: 'family' })
    );
    const { store, state, deleteFacts } = memoryStore([...many, ...divorce()]);
    expect(await forgetTopic('u', 'my family', store, at, on)).toEqual({
      kind: 'too-broad',
      matched: 8,
    });
    expect(deleteFacts).not.toHaveBeenCalled();
    expect(state.facts).toHaveLength(11);
  });
});

describe('mayHaveGraphCopy', () => {
  it('is false only for a live dynamic fact the sync has not copied', () => {
    expect(mayHaveGraphCopy(fact('dynamic_facts', 'a', { syncedToSpanner: false }))).toBe(false);
    expect(mayHaveGraphCopy(fact('dynamic_facts', 'a', { syncedToSpanner: true }))).toBe(true);
    expect(mayHaveGraphCopy(fact('dynamic_facts', 'a', { syncedToSpanner: 'retry' }))).toBe(true);
    expect(mayHaveGraphCopy(fact('dynamic_facts', 'a', {}))).toBe(true);
    expect(
      mayHaveGraphCopy(
        fact('dynamic_facts', 'a', { syncedToSpanner: false, forgottenAt: '2026-10-01T00:00:00Z' })
      )
    ).toBe(true);
    expect(mayHaveGraphCopy(fact('extracted_facts', 'e', { syncedToSpanner: true }))).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  forgetForCaller,
  forgetProblem,
  forgetTopic,
  isForgotten,
  type ForgetStore,
  type StoredFactRef,
} from '../forget.js';
import { forgetTokens, loadRecallSnapshot } from '../session-recall.js';

const fact = (collection: string, id: string, data: Record<string, unknown>): StoredFactRef => ({
  collection,
  id,
  data,
});

function memoryStore(facts: StoredFactRef[]) {
  const state = {
    facts: facts.map((f) => ({ ...f, data: { ...f.data } })),
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
    addTopic: async (_u, t) => {
      if (!state.topics.includes(t)) state.topics.push(t);
    },
    topics: async () => state.topics,
  };
  return { store, state };
}

const dog = fact('dynamic_facts', 'd3', {
  entityName: 'Biscuit',
  key: 'breed',
  value: 'golden retriever',
});

describe('forgetTopic', () => {
  it('marks facts about the topic in both collection shapes, deletes nothing, and records the words', async () => {
    const { store, state } = memoryStore([
      fact('dynamic_facts', 'd1', {
        entityName: 'User',
        key: 'divorce',
        value: 'Finalised the divorce papers in March',
      }),
      fact('extracted_facts', 'e1', { fact: 'Going through a divorce, feels raw' }),
      dog,
    ]);
    const at = new Date('2026-10-11T12:00:00Z');
    expect(await forgetTopic('u', 'my divorce', store, at)).toEqual({
      kind: 'forgotten',
      marked: 2,
    });
    expect(state.facts).toHaveLength(3); // nothing deleted
    expect(
      state.facts.filter((f) => f.data.forgottenAt === at.toISOString()).map((f) => f.id)
    ).toEqual(['d1', 'e1']);
    expect(state.topics).toEqual(['divorce']); // the words, not the request
  });

  it('refuses a topic that covers much of what is known, and asks to narrow it', async () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      fact('dynamic_facts', `f${i}`, {
        entityName: 'User',
        key: `family ${i}`,
        value: 'about the family',
      })
    );
    const { store, state } = memoryStore([...many, dog]);
    const result = await forgetTopic('u', 'my family', store);
    expect(result).toEqual({ kind: 'too-broad', matched: 8 });
    expect(state.facts.some((f) => f.data.forgottenAt)).toBe(false);
    expect(state.topics).toEqual([]);
    expect(forgetProblem({ kind: 'too-broad', matched: 8 })).toMatch(/Which part should I forget/);
  });

  it('handles short names and phone numbers, and ignores filler', async () => {
    const { store } = memoryStore([
      fact('dynamic_facts', 'x1', {
        entityName: 'Ex',
        key: 'relation',
        value: 'my ex still texts',
      }),
      fact('dynamic_facts', 'p1', {
        entityName: 'Pete',
        key: 'phone number',
        value: '435-555-0188',
      }),
      dog,
    ]);
    expect(await forgetTopic('u', 'my ex', store)).toEqual({ kind: 'forgotten', marked: 1 });
    expect(await forgetTopic('u', '4355550188', store)).toEqual({ kind: 'forgotten', marked: 1 });
    expect(await forgetTopic('u', 'forget what I said about that', store)).toEqual({
      kind: 'nothing',
    });
    expect(forgetTokens('Forget that thing, user')).toEqual([]);
  });

  it('sends facts about the topic forgotten one by one earlier through again, so their index copies go', async () => {
    const earlier = fact('dynamic_facts', 'd9', {
      entityName: 'User',
      key: 'divorce',
      value: 'divorce lawyer is Sam',
      forgottenAt: '2026-10-01T00:00:00Z',
    });
    const { store } = memoryStore([earlier, dog]);
    const marked: string[] = [];
    store.markForgotten = async (_u, refs) => {
      marked.push(...refs.map((r) => r.id));
    };
    expect(await forgetTopic('u', 'my divorce', store)).toEqual({ kind: 'forgotten', marked: 0 });
    expect(marked).toEqual(['d9']);
  });

  it('matches whole words only', () => {
    expect(isForgotten('Finalised the divorce papers', ['divorce'])).toBe(true);
    expect(isForgotten('A jobless week', ['job'])).toBe(false);
  });
});

describe('forgetForCaller', () => {
  it('reports a failure as failed, never as forgotten', async () => {
    expect(await forgetForCaller(undefined, 'my divorce')).toEqual({ kind: 'not-saved' });
    const failing = memoryStore([]).store;
    failing.facts = async () => Promise.reject(new Error('firestore down'));
    expect(await forgetForCaller('u', 'my divorce', failing)).toEqual({ kind: 'failed' });
    expect(forgetProblem({ kind: 'failed' })).toMatch(/couldn't remove/);
  });

  it('tells a caller with no saved memory so calmly, never "ask me again"', async () => {
    for (const id of ['anonymous', 'anon:3f2a', 'onbehalf:call-1']) {
      const result = await forgetForCaller(id, 'my divorce');
      expect(result).toEqual({ kind: 'not-saved' });
      if (result.kind === 'forgotten') throw new Error('unreachable');
      expect(forgetProblem(result)).toBe("There's nothing saved about you here.");
    }
  });
});

describe('recall after forgetting', () => {
  it('leaves out marked facts, and facts and open threads about a recorded topic', async () => {
    const snapshot = await loadRecallSnapshot(
      {
        facts: async () => [
          {
            entityName: 'User',
            key: 'divorce',
            value: 'Finalised the divorce papers',
            confidence: 0.9,
          },
          {
            entityName: 'User',
            key: 'ex',
            value: 'still texts',
            confidence: 0.9,
            forgottenAt: '2026-10-11T12:00:00Z',
          },
          { entityName: 'Biscuit', key: 'breed', value: 'golden retriever', confidence: 0.9 },
        ],
        summaries: async () => [
          {
            callerProvenance: 1,
            followUpItems: ['Ask how the divorce paperwork is going', 'Ask how Biscuit is doing'],
          },
        ],
        forgotten: async () => ['divorce'],
      },
      'u'
    );
    expect(snapshot.facts.map((f) => f.value)).toEqual(['golden retriever']);
    expect(snapshot.followUps).toEqual(['Ask how Biscuit is doing']);
  });
});

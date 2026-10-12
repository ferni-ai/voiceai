/**
 * Seth's prod call, 2026-10-12. Peter: "How did those contracts end up looking
 * by the time you finally wrapped up last night?" Seth: "What contracts?" The
 * contracts came from a mishearing on a dev call; these are his stored facts.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { denialOf, disputeDenied, disputeForCaller, type DisputeStore } from '../dispute.js';
import { forgottenInProcess, type StoredFactRef } from '../forget.js';
import { summarySnippets } from '../call-summaries.js';
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

/** The 01:33 dev-call summary the mishearing produced. */
const DEV_SUMMARY = {
  timestamp: '2026-10-12T01:33:32.536Z',
  mainTopics: ['Work contracts', 'Unopened mail pile'],
  keyPoints: [
    'The user was working on contracts on the evening of 2026-10-11.',
    'The user has a pile of unopened mail on the kitchen table and dislikes dealing with mail.',
  ],
  followUpItems: ['How did the contract wrangling turn out?'],
};

function memoryStore(
  facts: StoredFactRef[],
  summaries = [{ id: 'summary_dev', data: DEV_SUMMARY }]
) {
  const state = {
    facts: facts.map((f) => ({ ...f, data: { ...f.data } })),
    summaries: summaries.map((x) => ({ ...x, data: { ...x.data } as Record<string, unknown> })),
  };
  const store: DisputeStore = {
    facts: async () => state.facts,
    summaries: async () => state.summaries,
    markFacts: async (_u, refs, at) => {
      for (const r of refs) {
        const f = state.facts.find((x) => x.id === r.id);
        if (f) Object.assign(f.data, { forgottenAt: at, disputedAt: at });
      }
    },
    markSummaryItems: async (_u, id, items, at) => {
      const x = state.summaries.find((y) => y.id === id);
      if (!x) return;
      const had = Array.isArray(x.data.disputedItems) ? (x.data.disputedItems as string[]) : [];
      Object.assign(x.data, { disputedItems: [...had, ...items], disputedAt: at });
    },
  };
  const marked = () => state.facts.filter((f) => f.data.disputedAt).map((f) => f.id);
  /** Recall with whatever this process has recorded as forgotten (forget.ts): a dispute records nothing. */
  const recall = () =>
    loadRecallSnapshot(
      {
        facts: async () => state.facts.map((f) => f.data),
        summaries: async () => state.summaries.map((x) => x.data),
        forgotten: async () => forgottenInProcess('seth'),
      },
      'seth'
    );
  return { store, state, marked, recall };
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
  it('marks the contract facts and summary items, keeps the rest', async () => {
    const { store, state, marked } = memoryStore(SETH_FACTS);
    const result = await disputeDenied('seth', { kind: 'echo', topic: 'contracts' }, store);
    expect(result).toEqual({ kind: 'disputed', facts: 2, items: 3 });
    expect(marked()).toEqual(['f_f6d35aee', 'f_6a72af2b']);
    expect(state.summaries[0]!.data.disputedItems).toEqual([
      'How did the contract wrangling turn out?',
      'The user was working on contracts on the evening of 2026-10-11.',
      'Work contracts',
    ]);
  });

  it('recall then serves neither the facts, the follow-up nor the key point', async () => {
    const { store, recall } = memoryStore(SETH_FACTS);
    expect((await recall()).followUps).toEqual(['How did the contract wrangling turn out?']);

    await disputeDenied('seth', { kind: 'echo', topic: 'contracts' }, store);
    const after = await recall();
    expect(after.followUps).toEqual([]);
    expect(after.facts.map((f) => f.value).join(' ')).not.toMatch(/contract/i);
    expect(after.facts.map((f) => f.value)).toContain('golden retriever');
    const snippets = summarySnippets([await store.summaries('seth').then((x) => x[0]!.data)], []);
    expect(snippets.map((x) => x.text)).toEqual([
      'The user has a pile of unopened mail on the kitchen table and dislikes dealing with mail.',
    ]);
    expect(snippets[0]!.whole).not.toMatch(/contract/i);
  });

  it('a denial is not a forget: a later true fact about contracts is recalled', async () => {
    const { store, state, recall } = memoryStore(SETH_FACTS);
    await disputeDenied('seth', { kind: 'echo', topic: 'contracts' }, store);
    state.facts.push(
      fact('later', { entityName: 'User', key: 'work', value: 'signing new contracts with Acme' })
    );
    expect(forgottenInProcess('seth')).toEqual([]);
    const values = (await recall()).facts.map((f) => f.value);
    expect(values).toContain('signing new contracts with Acme');
    expect(values).not.toContain('contracts');
  });

  it('a plain denial marks only facts sharing two words with the reply', async () => {
    const { store, marked } = memoryStore(SETH_FACTS, []);
    const denial = denialOf("No, that's wrong.", "So you're moving to Austin in October?");
    expect(denial).not.toBeNull();
    await disputeDenied('seth', denial!, store);
    expect(marked()).toEqual(['d4']); // the October birthday shares one word and stays
  });

  it('refuses a denial that would cover many facts', async () => {
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
    expect(state.summaries[0]!.data.disputedItems).toBeUndefined();
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
      facts: 2,
      items: 3,
    });
    expect(marked()).toEqual(['f_f6d35aee', 'f_6a72af2b']);
  });
});

import { describe, expect, it } from 'vitest';
import {
  MAX_CORRECTION_CHARS,
  correctRemembered,
  forgetRemembered,
  listRemembered,
  type MemoryControlStore,
} from '../memory-control.js';
import { loadRecallSnapshot } from '../session-recall.js';

function memoryStore(
  rows: Record<string, Record<string, unknown>>,
  forgotten: string[] | null = []
) {
  const state = { rows: structuredClone(rows) };
  const store: MemoryControlStore = {
    facts: async () =>
      Object.entries(state.rows)
        .map(([id, data]) => ({ id, data }))
        .sort((a, b) =>
          String(b.data.extractedAt ?? '').localeCompare(String(a.data.extractedAt ?? ''))
        ),
    fact: async (_u, id) => state.rows[id] ?? null,
    copies: async (_u, d) =>
      Object.entries(state.rows)
        .filter(([, r]) => r.entityName === d.entityName && r.key === d.key && r.value === d.value)
        .map(([id, data]) => ({ id, data })),
    forgotten: async () => forgotten,
    forget: async (_u, id, _d, at) => {
      state.rows[id] = { ...state.rows[id], forgottenAt: at };
    },
    correct: async (_u, wrongIds, right, at) => {
      if (state.rows[right.id]) throw new Error('exists');
      state.rows[right.id] = right.data;
      for (const wrongId of wrongIds) {
        state.rows[wrongId] = { ...state.rows[wrongId], forgottenAt: at, correctedBy: right.id };
      }
    },
  };
  return { store, state };
}

const rows = {
  dog: {
    entityName: 'Biscuit',
    key: 'breed',
    value: 'golden retriever',
    confidence: 0.9,
    extractedAt: '2026-10-05T18:00:00Z',
  },
  job: {
    entityName: 'User',
    key: 'current_job',
    value: 'Works as a baker at Rise and Grind',
    confidence: 0.9,
    extractedAt: '2026-08-12T18:00:00Z',
    supersededAt: '2026-10-06T19:00:00Z',
  },
  gone: {
    entityName: 'User',
    key: 'ex',
    value: 'still texts',
    confidence: 0.9,
    extractedAt: '2026-09-01T18:00:00Z',
    forgottenAt: '2026-10-01T00:00:00Z',
  },
  unsure: {
    entityName: 'User',
    key: 'maybe',
    value: 'likes jazz?',
    confidence: 'low',
    extractedAt: '2026-09-02T18:00:00Z',
  },
};

describe('listRemembered', () => {
  it('shows what recall would use, the way a person reads it', async () => {
    const { store } = memoryStore(rows);
    expect(await listRemembered('u', store)).toEqual([
      {
        id: 'dog',
        subject: 'Biscuit',
        detail: 'breed: golden retriever',
        learnedAt: '2026-10-05T18:00:00Z',
      },
      {
        id: 'job',
        subject: 'you',
        detail: 'current job: Works as a baker at Rise and Grind',
        learnedAt: '2026-08-12T18:00:00Z',
        earlier: true,
      },
    ]);
  });
});

describe('listRemembered, with the filters recall applies', () => {
  const copy = { ...rows.dog, confidence: 0.6, extractedAt: '2026-10-01T18:00:00Z' };

  it('leaves out a fact about a topic they asked to forget', async () => {
    const { store } = memoryStore(rows, ['biscuit']);
    expect((await listRemembered('u', store)).map((f) => f.id)).toEqual(['job']);
  });

  it('shows nothing when the forgotten topics cannot be read, as recall does', async () => {
    const { store } = memoryStore(rows, null);
    expect(await listRemembered('u', store)).toEqual([]);
  });

  it('shows a fact extracted twice once, the most confident copy', async () => {
    const { store } = memoryStore({ ...rows, dogCopy: copy });
    expect((await listRemembered('u', store)).map((f) => f.id)).toEqual(['dog', 'job']);
  });

  it('forgets every copy of a fact, so none comes back on the next call', async () => {
    const { store, state } = memoryStore({ ...rows, dogCopy: copy });
    expect(await forgetRemembered('u', 'dog', store)).toBe(true);
    expect(state.rows.dogCopy!.forgottenAt).toBeDefined();
    expect((await listRemembered('u', store)).map((f) => f.id)).toEqual(['job']);
  });
});

describe('correcting a fact stored more than once', () => {
  const copy = { ...rows.dog, confidence: 0.6, extractedAt: '2026-10-01T18:00:00Z' };

  it('recall never serves the old value next to the new one', async () => {
    const { store, state } = memoryStore({ ...rows, dogCopy: copy });
    await correctRemembered('u', 'dogCopy', 'labradoodle', store); // even through the hidden copy
    const snapshot = await loadRecallSnapshot(
      { facts: async () => Object.values(state.rows), summaries: async () => [] },
      'u'
    );
    const values = snapshot.facts.map((f) => f.value);
    expect(values).toContain('labradoodle');
    expect(values).not.toContain('golden retriever');
  });

  it('refuses a fact the list hides for a forgotten topic', async () => {
    const { store } = memoryStore(rows, ['biscuit']);
    expect(await correctRemembered('u', 'dog', 'labradoodle', store)).toEqual({
      kind: 'not-found',
    });
  });

  it('reads word confidences the way recall does ("Low" is unsure)', async () => {
    const { store } = memoryStore({ shy: { ...rows.dog, confidence: ' Low ' } });
    expect(await listRemembered('u', store)).toEqual([]);
  });
});

describe('copies recall counts as the same fact (case apart, a missing key)', () => {
  const recallValues = async (state: { rows: Record<string, Record<string, unknown>> }) =>
    (
      await loadRecallSnapshot(
        { facts: async () => Object.values(state.rows), summaries: async () => [] },
        'u'
      )
    ).facts.map((f) => f.value);
  const older = { ...rows.dog, extractedAt: '2026-09-01T18:00:00Z' };

  it('forgets a copy that differs only in case', async () => {
    const { store, state } = memoryStore({
      ...rows,
      legacy: { ...older, value: 'Golden Retriever' },
    });
    await forgetRemembered('u', 'dog', store);
    expect((await recallValues(state)).map((v) => v.toLowerCase())).not.toContain(
      'golden retriever'
    );
  });

  it('corrects a copy whose name differs only in case', async () => {
    const { store, state } = memoryStore({ ...rows, legacy: { ...older, entityName: 'biscuit' } });
    await correctRemembered('u', 'dog', 'labradoodle', store);
    expect(await recallValues(state)).not.toContain('golden retriever');
  });

  it('forgets a copy with no key next to one with an empty key', async () => {
    const vegan = { entityName: 'User', value: 'vegan', confidence: 0.9 };
    const { store, state } = memoryStore({
      a: { ...vegan, key: '', extractedAt: '2026-10-02T00:00:00Z' },
      b: { ...vegan, extractedAt: '2026-10-01T00:00:00Z' },
    });
    await forgetRemembered('u', 'a', store);
    expect(await recallValues(state)).not.toContain('vegan');
  });
});

describe('forgetRemembered', () => {
  it('marks the fact forgotten, so recall leaves it out from the next call', async () => {
    const { store, state } = memoryStore(rows);
    expect(await forgetRemembered('u', 'dog', store, new Date('2026-10-11T12:00:00Z'))).toBe(true);
    expect(state.rows.dog!.forgottenAt).toBe('2026-10-11T12:00:00.000Z');
    const snapshot = await loadRecallSnapshot(
      { facts: async () => Object.values(state.rows), summaries: async () => [] },
      'u'
    );
    expect(snapshot.facts.map((f) => f.value)).not.toContain('golden retriever');
  });

  it('says so when there is nothing to forget', async () => {
    const { store } = memoryStore(rows);
    expect(await forgetRemembered('u', 'nope', store)).toBe(false);
    expect(await forgetRemembered('u', 'gone', store)).toBe(false);
  });
});

describe('correctRemembered', () => {
  it('forgets the wrong fact and keeps the right one, as the caller said it', async () => {
    const { store, state } = memoryStore(rows);
    const at = new Date('2026-10-11T12:00:00Z');
    const result = await correctRemembered('u', 'dog', '  labradoodle\u0007 ', store, at);
    expect(result.kind).toBe('corrected');
    const fact = result.kind === 'corrected' ? result.fact : undefined;
    expect(fact).toMatchObject({ subject: 'Biscuit', detail: 'breed: labradoodle', fromYou: true });
    expect(state.rows.dog).toMatchObject({ forgottenAt: at.toISOString(), correctedBy: fact!.id });
    expect(state.rows[fact!.id]).toMatchObject({
      entityName: 'Biscuit',
      key: 'breed',
      value: 'labradoodle',
      source: 'user-correction',
      corrects: 'dog',
      confidence: 1,
    });
    expect((await listRemembered('u', store)).map((f) => f.detail)).toContain('breed: labradoodle');
  });

  it('refuses what is not a short piece of text, and a fact that is not there', async () => {
    const { store, state } = memoryStore(rows);
    expect(await correctRemembered('u', 'dog', 42, store)).toEqual({
      kind: 'invalid',
      reason: 'value must be text',
    });
    expect(await correctRemembered('u', 'dog', '   ', store)).toEqual({
      kind: 'invalid',
      reason: 'value is empty',
    });
    expect(
      (await correctRemembered('u', 'dog', 'x'.repeat(MAX_CORRECTION_CHARS + 1), store)).kind
    ).toBe('invalid');
    expect(await correctRemembered('u', 'gone', 'new', store)).toEqual({ kind: 'not-found' });
    // a fact the list hides (recall doesn't use it) can't be corrected either
    expect(await correctRemembered('u', 'unsure', 'new', store)).toEqual({ kind: 'not-found' });
    expect(state.rows.dog!.forgottenAt).toBeUndefined();
  });
});

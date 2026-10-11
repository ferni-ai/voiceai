import { describe, expect, it } from 'vitest';
import {
  MAX_CORRECTION_CHARS,
  correctRemembered,
  forgetRemembered,
  listRemembered,
  type MemoryControlStore,
} from '../memory-control.js';
import { loadRecallSnapshot } from '../session-recall.js';

function memoryStore(rows: Record<string, Record<string, unknown>>) {
  const state = { rows: structuredClone(rows) };
  const store: MemoryControlStore = {
    facts: async () =>
      Object.entries(state.rows)
        .map(([id, data]) => ({ id, data }))
        .sort((a, b) =>
          String(b.data.extractedAt ?? '').localeCompare(String(a.data.extractedAt ?? ''))
        ),
    fact: async (_u, id) => state.rows[id] ?? null,
    update: async (_u, id, patch) => {
      state.rows[id] = { ...state.rows[id], ...patch };
    },
    create: async (_u, id, data) => {
      if (state.rows[id]) throw new Error('exists');
      state.rows[id] = data;
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
    expect(state.rows.dog!.forgottenAt).toBeUndefined();
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  candidates,
  factSupersessionEnabled,
  parseSupersession,
  supersedeNewFacts,
  supersessionPrompt,
  type StoredFact,
  type SupersessionStore,
} from '../fact-supersession.js';

const fact = (
  id: string,
  entityName: string,
  key: string,
  value: string,
  day: string
): StoredFact => ({
  id,
  entityName,
  key,
  value,
  extractedAt: `${day}T18:00:00.000Z`,
});

// Eli's memory in the benchmark (2026-10-11), as the extractor wrote it.
const baker = fact('f1', 'User', 'current_job', 'Works as a baker at Rise and Grind', '2026-08-12');
const coding = fact('f2', 'User', 'hobby', 'Teaching himself to code at night', '2026-08-12');
const club = fact('f3', 'book club', 'selected book', 'Lessons in Chemistry', '2026-08-27');
const dog = fact('f4', 'Biscuit', 'breed', 'golden retriever', '2026-08-01');
const northwind = fact('f5', 'Speaker', 'current employer', 'Northwind', '2026-10-06');
const covenant = fact(
  'f6',
  'The book club',
  'active selection',
  "Currently reading 'The Covenant of Water'",
  '2026-10-07'
);

/** The label the prompt gives the line containing `text` ("O2", "N1"). */
const labelOf = (prompt: string, text: string) =>
  prompt
    .split('\n')
    .find((l) => l.includes(text))
    ?.match(/^([ON]\d+)\./)?.[1];

function memoryStore(facts: StoredFact[], cursor?: string) {
  const state = { facts: facts.map((f) => ({ ...f })), cursor };
  const store: SupersessionStore = {
    facts: async () => [...state.facts].sort((a, b) => b.extractedAt.localeCompare(a.extractedAt)),
    markSuperseded: async (_u, marks, at) => {
      for (const m of marks) {
        const f = state.facts.find((x) => x.id === m.id);
        if (f) f.supersededAt = at;
      }
    },
    cursor: async () => state.cursor,
    setCursor: async (_u, at) => {
      state.cursor = at;
    },
  };
  return { store, state };
}

describe('candidates', () => {
  it('reads only older facts that could be about the same thing', () => {
    const older = candidates([northwind, covenant], [baker, coding, club, dog]);
    // "User" and "Speaker" are one subject; so are "book club" and "The book club".
    expect(older.map((f) => f.id)).toEqual(['f1', 'f2', 'f3']);
  });
});

describe('parseSupersession', () => {
  it('keeps only labels that exist, from a fenced or bare reply', () => {
    const marks = parseSupersession(
      '```json\n[{"older":"O1","newer":"N1"},{"older":"O9","newer":"N1"},{"older":"N1","newer":"O1"}]\n```',
      [northwind],
      [baker]
    );
    expect(marks).toEqual([{ id: 'f1', by: 'f5' }]);
    expect(parseSupersession('none of them', [northwind], [baker])).toEqual([]);
  });
});

describe('supersedeNewFacts', () => {
  it('marks what a newer fact replaces, and reads each new fact once', async () => {
    const { store, state } = memoryStore([baker, coding, club, dog, northwind, covenant]);
    const llm = vi.fn(async (prompt: string) => {
      expect(prompt).toContain('N1. The book club | active selection');
      expect(prompt).toContain('User | current job = Works as a baker at Rise and Grind');
      expect(prompt).not.toContain('Biscuit');
      return JSON.stringify([
        { older: labelOf(prompt, 'Rise and Grind'), newer: labelOf(prompt, 'Northwind') },
        { older: labelOf(prompt, 'Lessons in Chemistry'), newer: labelOf(prompt, 'Covenant') },
      ]);
    });
    const marked = await supersedeNewFacts('u-eli', {
      store,
      llm,
      since: new Date('2026-10-01T00:00:00Z'),
    });
    expect(marked).toBe(2);
    const superseded = state.facts.filter((f) => f.supersededAt).map((f) => f.id);
    expect(superseded.sort()).toEqual(['f1', 'f3']);
    expect(state.cursor).toBe(covenant.extractedAt);

    // Nothing new since: no model call.
    expect(
      await supersedeNewFacts('u-eli', { store, llm, since: new Date('2026-10-01T00:00:00Z') })
    ).toBe(0);
    expect(llm).toHaveBeenCalledTimes(1);
  });

  it('without a cursor, only facts since the call began count as new', async () => {
    const { store } = memoryStore([baker, northwind]);
    const llm = vi.fn(async () => '[]');
    await supersedeNewFacts('u', { store, llm, since: new Date('2026-10-10T00:00:00Z') });
    expect(llm).not.toHaveBeenCalled(); // Northwind (10-06) predates this call
  });

  it('never asks about facts already superseded', async () => {
    const { store } = memoryStore([{ ...baker, supersededAt: '2026-10-06T19:00:00Z' }, northwind]);
    const llm = vi.fn(async () => '[]');
    await supersedeNewFacts('u', { store, llm, since: new Date('2026-10-01T00:00:00Z') });
    expect(llm).not.toHaveBeenCalled(); // the only candidate was already retired
  });

  it('asks for replacements, not for additions', () => {
    expect(supersessionPrompt([northwind], [baker])).toMatch(/adds detail.*replaces nothing/s);
  });
});

describe('factSupersessionEnabled', () => {
  it('is off unless FACT_SUPERSESSION=on', () => {
    expect(factSupersessionEnabled({})).toBe(false);
    expect(factSupersessionEnabled({ FACT_SUPERSESSION: 'on' })).toBe(true);
  });
});

/**
 * The full-path simulator's corpora (scripts/crisis-eval/corpus/): well formed,
 * at least 8 calls per shape, each hard-negative call scoring mostly
 * must-not-alarm turns and each positive shape carrying must-catch turns,
 * phone numbers only in 555-01xx, and every labelled repo case runnable as a call.
 */
import { describe, expect, it } from 'vitest';

import { callOfCase, corpusProblems, loadCorpora } from '../full-path-corpus.js';
import { labelledCases } from '../labelled-cases.js';

const calls = loadCorpora();
const bySet = (set: string) => calls.filter((c) => c.set === set);
const shapes = (set: string) => [...new Set(bySet(set).map((c) => c.shape))];

describe('corpora', () => {
  it('has both sets with at least 8 calls in every shape', () => {
    expect(shapes('hard-negatives').length).toBeGreaterThanOrEqual(11);
    expect(shapes('positives').length).toBeGreaterThanOrEqual(6);
    for (const set of ['hard-negatives', 'positives'])
      for (const shape of shapes(set))
        expect(bySet(set).filter((c) => c.shape === shape).length, shape).toBeGreaterThanOrEqual(8);
  });

  it('labels hard negatives must-not-alarm after their first turn, positives must-catch somewhere', () => {
    for (const c of bySet('hard-negatives')) {
      expect(
        c.turns.slice(1).every((t) => t.label === 'must-not-alarm'),
        c.id
      ).toBe(true);
      expect(
        c.turns.some((t) => t.label === 'must-catch'),
        c.id
      ).toBe(false);
    }
    for (const c of bySet('positives'))
      expect(
        c.turns.some((t) => t.label === 'must-catch'),
        c.id
      ).toBe(true);
  });

  it('keeps 4 or more mundane follow-ups after a stressful line', () => {
    for (const c of bySet('hard-negatives').filter((x) => x.shape === 'stress-then-mundane'))
      expect(c.turns.length - 1, c.id).toBeGreaterThanOrEqual(4);
  });

  it('puts a 988 line before every denial', () => {
    for (const c of bySet('hard-negatives').filter((x) => x.shape === 'denial-after-988'))
      expect(c.turns[0].ferni, c.id).toMatch(/988/);
  });
});

describe('corpusProblems', () => {
  const ok = {
    id: 'a-1',
    set: 's',
    shape: 'x',
    opening: [],
    turns: [{ text: 'hi', label: 'must-not-alarm' as const }],
  };

  it('accepts a well-formed call', () => {
    expect(corpusProblems([ok])).toEqual([]);
  });

  it('refuses duplicate ids, bad labels and real-looking phone numbers', () => {
    const bad = corpusProblems([
      ok,
      ok,
      { ...ok, id: 'b-1', turns: [{ text: 'call 555-0199', label: 'maybe' as never }] },
      { ...ok, id: 'c-1', turns: [{ text: 'call 212-555-0100 now', label: 'either' }] },
    ]);
    expect(bad).toEqual([
      'a-1: duplicate id',
      'b-1: bad label maybe',
      'c-1: number outside 555-01xx: 212-555-0100',
    ]);
  });
});

describe('callOfCase', () => {
  it('turns every labelled case into one scored turn after its context', () => {
    const cases = labelledCases();
    expect(cases.length).toBeGreaterThan(400);
    for (const c of cases) {
      const call = callOfCase(c);
      expect(call.turns).toHaveLength(1);
      expect(call.turns[0].label).toBe(c.label === 'none' ? 'must-not-alarm' : 'must-catch');
      // Every earlier caller line is answered by a Ferni line, so the gate reads the latest alone.
      expect(call.opening.filter((o) => o.who === 'caller')).toHaveLength(
        c.variants[0].earlier.length
      );
      if (call.opening.length) expect(call.opening.at(-1)?.who).toBe('ferni');
    }
  });
});

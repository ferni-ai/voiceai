import { describe, expect, it } from 'vitest';
import {
  HUMAN_REFERENCE,
  RunDays,
  formatPaired,
  formatReport,
  interimOf,
  judgePrompt,
  paired,
  parseYesNo,
  tally,
  wilson,
  type CaseResult,
} from '../longmem-lib.js';
import { CASES, HISTORIES, callTurns } from '../fixtures/longmem-cases.js';

// Sunday 2026-10-11.
const days = new RunDays('2026-10-11');

describe('RunDays', () => {
  it('resolves relative dates the way the caller meant them', () => {
    expect(days.today()).toBe('Sunday 2026-10-11');
    expect(days.sessionDay(6)).toBe('2026-10-05'); // a Monday
    expect(days.weekdayBefore(6, 'Friday')).toBe('Friday 2026-10-02'); // "last Friday"
    expect(days.dayAfter(12)).toBe('Wednesday 2026-09-30'); // "tomorrow", said 2026-09-29
    expect(days.weekdayAfter(21, 'Saturday')).toBe('Saturday 2026-09-26'); // "this coming Saturday"
  });

  it('"last Friday" said on a Friday means the week before, not the same day', () => {
    // 2026-10-09 is a Friday, 2 days before the run.
    expect(days.weekdayBefore(2, 'Friday')).toBe('Friday 2026-10-02');
    expect(days.weekdayAfter(2, 'Friday')).toBe('Friday 2026-10-16');
  });

  it('rejects a malformed run date', () => {
    expect(() => new RunDays('10/11/2026')).toThrow(/bad run date/);
  });
});

describe('judging', () => {
  it('reads only a leading yes or no', () => {
    expect(parseYesNo('Yes.')).toBe(true);
    expect(parseYesNo(' no, it gives the old value')).toBe(false);
    expect(parseYesNo('The answer is yes')).toBeNull();
    expect(parseYesNo(null)).toBeNull();
  });

  it('holds abstention, temporal and update answers to their stricter rule', () => {
    expect(judgePrompt('abstention', 'q', 'never said', 'r')).toMatch(/gives any specific answer/);
    expect(judgePrompt('temporal', 'q', 'g', 'r')).toMatch(/same calendar day/);
    expect(judgePrompt('knowledge-update', 'q', 'g', 'r')).toMatch(/only the old value is no/);
  });
});

describe('scoring', () => {
  const r = (
    category: CaseResult['category'],
    correct: boolean | null,
    retrieved: boolean | null
  ): CaseResult => ({
    history: 'h',
    category,
    ask: 'q',
    gold: 'g',
    note: null,
    response: 'r',
    correct,
    retrieved,
  });

  it('counts judge failures separately instead of as wrong', () => {
    const t = tally([
      r('temporal', true, true),
      r('temporal', false, false),
      r('temporal', null, null),
    ]);
    expect(t).toMatchObject({ n: 2, correct: 1, accuracy: 0.5, retrieved: 0.5, judgeFailures: 1 });
  });

  it('gives a Wilson interval that stays inside [0, 1]', () => {
    const [lo, hi] = wilson(3, 5);
    expect(lo).toBeGreaterThan(0.2);
    expect(hi).toBeLessThan(0.9);
    expect(wilson(0, 1)[0]).toBe(0);
    expect(wilson(1, 1)[1]).toBe(1);
  });

  it('reports every category against the LoCoMo human reference', () => {
    const report = formatReport([r('single-session', true, true), r('abstention', false, null)]);
    expect(report).toContain('| single-session | 1/1 | 100%');
    expect(report).toContain('| knowledge-update | 0/0 | 0% [0%, 0%] | – | n/a |');
    expect(report).toContain('| overall | 1/2 | 50%');
    expect(HUMAN_REFERENCE.overall).toBe(0.879);
  });
});

describe('paired arms', () => {
  const res = (ask: string, correct: boolean | null): CaseResult => ({
    history: 'h',
    category: 'single-session',
    ask,
    gold: 'g',
    note: null,
    response: 'r',
    correct,
    retrieved: null,
  });

  it('pairs by question and counts the discordant ones', () => {
    const off = [res('a', true), res('b', false), res('c', false), res('d', true), res('e', null)];
    const on = [res('d', false), res('c', true), res('b', true), res('a', true), res('e', true)];
    expect(paired(off, on)).toMatchObject({ n: 4, both: 1, onlyA: 1, onlyB: 2, neither: 0 });
  });

  it('gives the exact two-sided sign test on the discordant pairs', () => {
    const off = Array.from({ length: 5 }, (_, i) => res(`q${i}`, false));
    const on = Array.from({ length: 5 }, (_, i) => res(`q${i}`, true));
    // 5 of 5 discordant pairs favour one arm: p = 2 / 2^5.
    expect(paired(off, on).pValue).toBeCloseTo(0.0625, 6);
    // 3 against 1: p = 2 * (1 + 4) / 16.
    const mixed = paired(
      [res('a', true), res('b', false), res('c', false), res('d', false)],
      [res('a', false), res('b', true), res('c', true), res('d', true)]
    );
    expect(mixed.pValue).toBeCloseTo(0.625, 6);
    expect(paired([res('a', true)], [res('a', true)]).pValue).toBe(1);
    expect(formatPaired('off', 'on', paired(off, on))).toBe(
      'off vs on, 5 questions: both right 0, only off 0, only on 5, both wrong 0 (exact sign test p=0.063)'
    );
  });

  it('feeds recall the opening words first, as an interim transcript would', () => {
    // 10 words: the first 6.
    expect(interimOf('Which hospital did I work at before my current one?')).toBe(
      'Which hospital did I work at'
    );
    expect(interimOf('Where do I work?')).toBeNull();
  });
});

describe('cases', () => {
  it('every question belongs to a history, and every category is covered', () => {
    const ids = new Set(HISTORIES.map((h) => h.id));
    for (const c of CASES) expect(ids.has(c.history), c.ask).toBe(true);
    expect(new Set(CASES.map((c) => c.category)).size).toBe(5);
  });

  it('a call alternates the caller with short replies', () => {
    expect(callTurns(['a', 'b']).map((t) => t.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
    ]);
  });
});

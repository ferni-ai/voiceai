import { describe, expect, it } from 'vitest';
import {
  CATEGORIES,
  REMARKS,
  answerPrompt,
  callerZone,
  daysBetween,
  failureCount,
  hasEvidence,
  cohenKappa,
  formatAgreement,
  localDay,
  parseCaseFile,
  promptHashes,
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

  it('rejects a date that is not on the calendar', () => {
    expect(() => new RunDays('2026-02-31')).toThrow(/bad run date/);
    expect(() => new RunDays('2026-13-01')).toThrow(/bad run date/);
  });

  it('counts whole calendar days between dates', () => {
    expect(daysBetween('2026-01-05', '2026-10-11')).toBe(279);
    expect(daysBetween('2026-10-11', '2026-10-11')).toBe(0);
    expect(localDay(Date.parse('2026-01-06T03:00:00Z'), 'America/New_York')).toBe('2026-01-05');
  });

  it('reads the caller zone from EVAL_TZ, defaulting to New York', () => {
    const before = process.env.EVAL_TZ;
    delete process.env.EVAL_TZ;
    expect(callerZone()).toBe('America/New_York');
    process.env.EVAL_TZ = 'America/Denver';
    expect(callerZone()).toBe('America/Denver');
    if (before === undefined) delete process.env.EVAL_TZ;
    else process.env.EVAL_TZ = before;
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

  it('reports every category, with "–" where nothing was judged', () => {
    const report = formatReport([r('single-session', true, true), r('abstention', false, null)]);
    expect(report).toContain('| single-session | 1/1 | 100%');
    expect(report).toContain('| knowledge-update | – | – | – | 0 |');
    expect(report).toContain('| overall | 1/2 | 50%');
  });

  it('counts a missing answer as a failure, apart from a judge failure', () => {
    const blank: CaseResult = { ...r('temporal', null, null), response: '', noAnswer: true };
    const t = tally([r('temporal', true, true), blank, r('temporal', null, null)]);
    expect(t).toMatchObject({ n: 1, correct: 1, judgeFailures: 1, noAnswers: 1 });
    expect(failureCount([blank, r('temporal', true, true)])).toBe(1);
    expect(failureCount([r('temporal', true, true)])).toBe(0);
    expect(formatReport([blank])).toContain('| temporal | – | – | – | 1 |');
  });

  it('fingerprints the prompt templates, so a changed wording shows in a report', () => {
    const hashes = promptHashes();
    expect(hashes.judge).toMatch(/^[0-9a-f]{12}$/);
    expect(promptHashes()).toEqual(hashes);
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
    expect(interimOf("What's my daughter's name?")).toBe("What's my daughter's");
    expect(interimOf('Where am I?')).toBeNull();
  });
});

describe('cases', () => {
  it('every question belongs to a history, and every category is covered', () => {
    const ids = new Set(HISTORIES.map((h) => h.id));
    for (const c of CASES) expect(ids.has(c.history), c.ask).toBe(true);
    expect(new Set(CASES.map((c) => c.category)).size).toBe(CATEGORIES.length);
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

describe('a second judge', () => {
  it("computes Cohen's kappa", () => {
    expect(
      cohenKappa([
        [true, true],
        [false, false],
      ])
    ).toBe(1);
    // Agree on 3 of 4, each judge says yes half the time: (0.75 - 0.5) / 0.5.
    expect(
      cohenKappa([
        [true, true],
        [true, false],
        [false, false],
        [false, false],
      ])
    ).toBeCloseTo(0.5, 6);
    expect(
      cohenKappa([
        [true, true],
        [true, true],
      ])
    ).toBe(1);
    expect(cohenKappa([])).toBe(0);
  });

  it('reports agreement only over questions both judges graded', () => {
    const base = {
      history: 'h',
      category: 'single-session' as const,
      ask: 'q',
      gold: 'g',
      note: null,
      response: 'r',
      retrieved: null,
    };
    const line = formatAgreement([
      { ...base, correct: true, second: { judge: 'qwen', correct: true, retrieved: null } },
      { ...base, correct: true, second: { judge: 'qwen', correct: false, retrieved: null } },
      { ...base, correct: null, second: { judge: 'qwen', correct: true, retrieved: null } },
      { ...base, correct: false },
    ]);
    expect(line).toBe('qwen judge: 1/2 correct; agrees with the first judge on 1/2 (kappa 0.00)');
    expect(formatAgreement([{ ...base, correct: true }])).toBeNull();
  });
});

describe('case files', () => {
  it('loads histories and fixed gold answers kept outside the repo', () => {
    const loaded = parseCaseFile({
      runDate: '2026-10-11',
      histories: [{ id: 'priya-1', name: 'Priya', sessions: [{ daysAgo: 3, user: ['hi'] }] }],
      cases: [
        { history: 'priya-1', category: 'temporal', ask: 'When?', gold: 'Friday 2026-10-09' },
      ],
    });
    expect(loaded.cases[0]!.gold(new RunDays('2030-01-01'))).toBe('Friday 2026-10-09');
    expect(() =>
      parseCaseFile({
        runDate: '2026-10-11',
        histories: [],
        cases: [{ history: 'x', category: 'temporal', ask: 'q', gold: 'g' }],
      })
    ).toThrow(/unknown history/);
    expect(() => parseCaseFile({})).toThrow(/needs runDate/);
  });
});

describe('remarks', () => {
  it('asks Ferni to reply to a remark as a friend, not to answer a quiz', () => {
    expect(REMARKS.has('unprompted')).toBe(true);
    const remark = answerPrompt(
      'Maya',
      'Sunday 2026-10-11',
      null,
      'Ugh, night shifts.',
      'unprompted'
    );
    expect(remark).toContain('Maya says: "Ugh, night shifts."');
    expect(remark).toMatch(/the way a friend/);
    expect(answerPrompt('Maya', 'Sunday 2026-10-11', null, 'Where do I work?')).toContain(
      'Maya asks:'
    );
  });

  it('grades restraint by what must stay unsaid, with nothing to retrieve', () => {
    expect(judgePrompt('restraint', 'q', "Walt's hip", 'r')).toMatch(
      /does NOT bring that memory up/
    );
    expect(judgePrompt('false-premise', 'q', 'g', 'r')).toMatch(/plays along/);
    expect(hasEvidence('restraint')).toBe(false);
    expect(hasEvidence('abstention')).toBe(false);
    expect(hasEvidence('false-premise')).toBe(true);
  });
});

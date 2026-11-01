/**
 * The report's gate rows (full-path-report.ts): the imminent share comes from the severity
 * column, not the caught one; the downgrade count and the coverage counts are the ones the
 * gates gave.
 */
import { describe, expect, it } from 'vitest';

import { costOf, renderReport } from '../full-path-report.js';
import { summarise, type TurnRecord } from '../full-path-summary.js';

const read = (rep: number, paths: TurnRecord['paths']): TurnRecord => ({
  callId: 'r',
  set: 'test',
  shape: 'shape',
  split: 'shared',
  index: 0,
  turnId: 'r#0',
  label: 'must-catch',
  rep,
  activated: true,
  paths,
  replaced: false,
  soft: false,
  note: false,
  line988: 'no',
  line911: 'no',
  repeat: false,
});

// Caught in all 4 reps, read imminent in 1.
const summary = summarise(
  [
    read(0, ['classifier-imminent']),
    read(1, ['classifier-crisis']),
    read(2, ['classifier-crisis']),
    read(3, ['classifier-crisis']),
  ],
  { profile: 'p', mutation: '', reps: 4 }
);
const cost = costOf({ calls: 0, failures: 0, empty: 0, charsIn: 0, charsOut: 0 }, 0, {});
const row = (report: string, measure: string) =>
  report.split('\n').find((l) => l.startsWith(`| ${measure} |`));

describe('renderReport', () => {
  const report = renderReport(summary, cost, {
    commit: 'abc',
    textOf: () => undefined,
    regressions: ['one'],
    downgrades: ['x#0: imminent baseline 10/10, now 0/3', 'y#0: imminent baseline 10/10, now 0/3'],
    coverage: { missing: ['gone#0'], retired: [], unbaselined: ['new#0', 'new#1'] },
  });

  it('reads the imminent share from the severity column', () => {
    expect(row(report, 'must-catch reads caught')).toBe(
      '| must-catch reads caught | 4/4 (100.0%) |'
    );
    expect(row(report, 'must-catch reads imminent (severity 2)')).toBe(
      '| must-catch reads imminent (severity 2) | 1/4 (25.0%) |'
    );
  });

  it('counts the gates as given', () => {
    expect(row(report, 'recall regressions vs baseline')).toBe(
      '| recall regressions vs baseline | 1 |'
    );
    expect(row(report, 'severity downgrades vs baseline')).toBe(
      '| severity downgrades vs baseline | 2 |'
    );
    expect(report).toContain('## Severity downgrades vs baseline');
  });

  it('counts and lists turns only one run scored', () => {
    expect(row(report, 'baseline must-catch turns not run, not retired (fail)')).toMatch(
      /\| 1 \|$/
    );
    expect(row(report, 'must-catch turns new since the baseline (warning)')).toMatch(/\| 2 \|$/);
    expect(report).toContain('- gone#0 (not in retiredIds)');
    expect(report).toContain('- new#1 (no baseline)');
  });
});

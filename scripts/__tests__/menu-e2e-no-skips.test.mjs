import { describe, expect, it } from 'vitest';
import {
  playwrightFlaky,
  playwrightProblems,
  verdict,
  vitestProblems,
} from '../ci/menu-e2e-no-skips.mjs';

const vitestReport = (...statuses) => ({
  numTotalTests: statuses.length,
  numPendingTests: statuses.filter((s) => s === 'pending' || s === 'skipped').length,
  numTodoTests: statuses.filter((s) => s === 'todo').length,
  numFailedTests: statuses.filter((s) => s === 'failed').length,
  testResults: [
    {
      name: 'src/api/__tests__/menu-year.emulator.test.ts',
      status: 'passed',
      assertionResults: statuses.map((status, i) => ({ status, fullName: `test ${i}` })),
    },
  ],
});

const playwrightReport = (...tests) => ({
  suites: [
    {
      title: 'panel-actions.spec.ts',
      specs: [],
      suites: [
        {
          title: 'nested',
          specs: tests.map(([projectName, status], i) => ({
            title: `spec ${i}`,
            file: 'panel-actions.spec.ts',
            tests: [{ projectName, status }],
          })),
        },
      ],
    },
  ],
  errors: [],
});

describe('menu gate no-skip guard: vitest', () => {
  it('passes a run where every test passed', () => {
    expect(vitestProblems(vitestReport('passed', 'passed'))).toEqual([]);
  });

  it('fails a run with no emulator, where the contract test is skipped', () => {
    // What `describe.skipIf(!emulator)` reports (seen locally): exit 0, status "skipped"
    const problems = vitestProblems(vitestReport('skipped'));
    expect(problems).toContain('1 skipped');
    expect(problems.join('\n')).toContain(
      'skipped: src/api/__tests__/menu-year.emulator.test.ts > test 0'
    );
  });

  it('fails todo, failed and empty runs', () => {
    expect(vitestProblems(vitestReport('passed', 'todo'))).toContain('1 todo');
    expect(vitestProblems(vitestReport('failed'))).toContain('1 failed');
    expect(vitestProblems({ numTotalTests: 0, testResults: [] })).toContain('the run had no tests');
    expect(vitestProblems(vitestReport())).toEqual(
      expect.arrayContaining([expect.stringContaining('no tests ran')])
    );
  });
});

describe('menu gate no-skip guard: playwright', () => {
  it('passes when every test in every nested suite was expected', () => {
    expect(
      playwrightProblems(playwrightReport(['desktop', 'expected'], ['mobile', 'expected']))
    ).toEqual([]);
  });

  it('fails a skip and a failure, naming the project', () => {
    const problems = playwrightProblems(
      playwrightReport(['desktop', 'skipped'], ['mobile', 'unexpected'])
    );
    expect(problems).toEqual([
      'skipped: [desktop] panel-actions.spec.ts > spec 0',
      'unexpected: [mobile] panel-actions.spec.ts > spec 1',
    ]);
  });

  it('lets a flaky retry pass the gate but still reports it', () => {
    const report = playwrightReport(['desktop', 'expected'], ['mobile', 'flaky']);
    expect(playwrightProblems(report)).toEqual([]);
    expect(playwrightFlaky(report)).toEqual(['[mobile] panel-actions.spec.ts > spec 1']);
    expect(playwrightFlaky(playwrightReport(['desktop', 'expected']))).toEqual([]);
  });

  it('fails a run with no tests or with a global error', () => {
    expect(playwrightProblems({ suites: [] })).toContain('the run had no tests');
    const report = {
      ...playwrightReport(['desktop', 'expected']),
      errors: [{ message: 'webServer died' }],
    };
    expect(playwrightProblems(report)).toContain('error: webServer died');
  });

  it('rejects an unknown report kind', () => {
    expect(() => verdict('jest', {})).toThrow(/unknown report kind/);
  });
});

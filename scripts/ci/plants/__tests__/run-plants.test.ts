/**
 * run-plants.ts plants one bug at a time and counts it only when the named test fails on
 * an assertion. These run it against a throwaway git repo with a fake test runner that
 * reads the planted file, so every verdict path is exercised without starting vitest.
 */
import { execFileSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  formatResults,
  isSealedPath,
  judge,
  parseManifest,
  parseVitestJson,
  runPlants,
  type Plant,
  type RunTest,
  type TestReport,
} from '../run-plants.js';

const SOURCE =
  "export const isBlank = (s: string) => s.trim() === '';\nexport const twice = (n: number) => n * 2; // twice\n";
const TEST = 'src/calc.test.ts';
const BLANK = 'calc > blank strings are blank';
const TWICE = 'calc > twice doubles';
const dirs: string[] = [];

function repo(
  files: Record<string, string> = { 'src/calc.ts': SOURCE, [TEST]: '// fake\n' }
): string {
  const dir = mkdtempSync(join(tmpdir(), 'plants-test-'));
  dirs.push(dir);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@example.com',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@example.com',
  };
  const git = (args: string[]) => execFileSync('git', args, { cwd: dir, env, stdio: 'ignore' });
  git(['init', '-q']);
  git(['add', '-A']);
  git(['-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'init']);
  return dir;
}

type Rule = { when: string; fail: string; errorClass?: string };

/** A fake vitest: both tests pass, unless src/calc.ts contains a rule's `when` text. */
function fake(
  root: string,
  rules: Rule[] = [],
  extra: (text: string) => TestReport | void = () => {}
) {
  const calls: string[] = [];
  const run: RunTest = (test) => {
    calls.push(test);
    const text = readFileSync(join(root, 'src/calc.ts'), 'utf8');
    const special = extra(text);
    if (special) return special;
    const hit = (name: string) => rules.find((r) => r.fail === name && text.includes(r.when));
    const tests = [BLANK, TWICE].map((fullName) => {
      const r = hit(fullName);
      return r
        ? { fullName, status: 'failed', errorClass: r.errorClass ?? 'AssertionError' }
        : { fullName, status: 'passed' };
    });
    return { kind: 'report', loadFailed: false, tests };
  };
  return { run, calls };
}

const plant = (over: Partial<Plant> = {}): Plant => ({
  id: 'p1',
  file: 'src/calc.ts',
  find: "=== ''",
  replace: "!== ''",
  test: TEST,
  expectRed: 'blank strings are blank',
  ...over,
});

const status = (root: string) =>
  execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
const breaksBlank: Rule = { when: "!== ''", fail: BLANK };

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

describe('runPlants verdicts', () => {
  it('RED only when the expectRed test fails on an assertion, then restores the file', () => {
    const root = repo();
    const { run, calls } = fake(root, [breaksBlank]);
    const [r] = runPlants([plant()], root, run);
    expect(r).toMatchObject({ verdict: 'RED', errorClass: 'AssertionError', failing: [BLANK] });
    expect(calls).toEqual([TEST, TEST]); // baseline, then the planted run
    expect(readFileSync(join(root, 'src/calc.ts'), 'utf8')).toBe(SOURCE);
    expect(status(root)).toBe('');
  });

  it('a throw that is not an assertion, another test failing, or nothing failing does not count', () => {
    const root = repo();
    const threw = fake(root, [{ ...breaksBlank, errorClass: 'TypeError' }]).run;
    expect(runPlants([plant()], root, threw)[0]).toMatchObject({
      verdict: 'RED (not an assertion)',
      errorClass: 'TypeError',
    });
    const other = fake(root, [{ when: "!== ''", fail: TWICE }]).run;
    expect(runPlants([plant()], root, other)[0]).toMatchObject({
      verdict: 'RED (other test)',
      failing: [TWICE],
    });
    expect(runPlants([plant()], root, fake(root).run)[0].verdict).toBe('GREEN');
  });

  it('NOT PLANTED when find is missing or the replacement changes nothing', () => {
    const root = repo();
    const { run, calls } = fake(root, [breaksBlank]);
    const results = runPlants(
      [plant({ id: 'a', find: 'no such text' }), plant({ id: 'b', replace: "=== ''" })],
      root,
      run
    );
    expect(results.map((r) => r.verdict)).toEqual(['NOT PLANTED', 'NOT PLANTED']);
    expect(calls).toEqual([TEST]); // the baseline only
    expect(status(root)).toBe('');
  });

  it('AMBIGUOUS when find occurs twice, and nothing is written', () => {
    const root = repo();
    const { run, calls } = fake(root, [{ when: 'n * 3', fail: TWICE }]);
    const [r] = runPlants(
      [plant({ find: 'twice', replace: 'thrice', expectRed: 'twice doubles' })],
      root,
      run
    );
    expect(r.verdict).toBe('AMBIGUOUS');
    expect(calls).toEqual([TEST]);
    expect(readFileSync(join(root, 'src/calc.ts'), 'utf8')).toBe(SOURCE);
  });

  it('BASELINE RED when the unplanted file already fails, NO SUCH TEST when expectRed names nothing', () => {
    const root = repo();
    const red = fake(root, [{ when: "=== ''", fail: TWICE }]);
    expect(runPlants([plant()], root, red.run)[0].verdict).toBe('BASELINE RED');
    expect(red.calls).toEqual([TEST]);
    const [r] = runPlants(
      [plant({ expectRed: 'no test is called this' })],
      root,
      fake(root, [breaksBlank]).run
    );
    expect(r.verdict).toBe('NO SUCH TEST');
  });

  it('LOAD ERROR when the planted file fails to collect, runs no tests, or leaves no report; TIMEOUT on a timeout', () => {
    const root = repo();
    const cases: Array<[TestReport, string]> = [
      [{ kind: 'report', loadFailed: true, tests: [] }, 'LOAD ERROR'],
      [{ kind: 'report', loadFailed: false, tests: [] }, 'LOAD ERROR'],
      [{ kind: 'no-report' }, 'LOAD ERROR'],
      [{ kind: 'timeout' }, 'TIMEOUT'],
    ];
    for (const [report, verdict] of cases) {
      const { run } = fake(root, [], (text) => (text.includes("!== ''") ? report : undefined));
      expect(runPlants([plant()], root, run)[0].verdict, verdict).toBe(verdict);
    }
    expect(status(root)).toBe('');
  });

  it('DIRTY when a run leaves a stray file: the plant is restored and the rest are SKIPPED', () => {
    const root = repo();
    const { run, calls } = fake(root, [breaksBlank], (text) => {
      if (text.includes("!== ''")) writeFileSync(join(root, 'stray.txt'), 'x');
    });
    const results = runPlants([plant({ id: 'a' }), plant({ id: 'b' })], root, run);
    expect(results.map((r) => r.verdict)).toEqual(['DIRTY', 'SKIPPED']);
    expect(calls).toHaveLength(2);
    expect(readFileSync(join(root, 'src/calc.ts'), 'utf8')).toBe(SOURCE);
  });

  it('a tree dirty before the first plant runs nothing', () => {
    const root = repo();
    writeFileSync(join(root, 'src/calc.ts'), `${SOURCE}// edit\n`);
    const { run, calls } = fake(root, [breaksBlank]);
    expect(
      runPlants([plant({ id: 'a' }), plant({ id: 'b' })], root, run).map((r) => r.verdict)
    ).toEqual(['DIRTY', 'SKIPPED']);
    expect(calls).toEqual([]);
  });

  it('writes the replacement literally ($& and $1 are not patterns)', () => {
    const root = repo();
    const { run } = fake(root, [{ when: "'$&'", fail: BLANK }]);
    expect(runPlants([plant({ replace: "=== '$&'" })], root, run)[0].verdict).toBe('RED');
  });
});

describe('sealed and outside paths are refused before anything runs', () => {
  const sealed = [
    'src/__tests__/fixtures/a.ts',
    'src/x-heldout.ts',
    'src/held-out/a.ts',
    'src/a_held_out.ts',
    'src/HeldOut.test.ts',
    'src/blind/a.ts',
    'src/sealed/a.ts',
    'src/corpus/a.ts',
    'scripts/crisis-eval/a.ts',
    'scripts/voice-eval/a.ts',
  ];

  it.each(sealed)('refuses %s as the planted file and as the test', (path) => {
    expect(isSealedPath(path)).toBe(true);
    const root = repo();
    const { run, calls } = fake(root, [breaksBlank]);
    const results = runPlants(
      [plant({ id: 'f', file: path }), plant({ id: 't', test: path })],
      root,
      run
    );
    expect(results.map((r) => r.verdict)).toEqual([
      'REFUSED (sealed path)',
      'REFUSED (sealed path)',
    ]);
    expect(calls).toEqual([]);
    expect(status(root)).toBe('');
  });

  it('allows an ordinary source path, and refuses paths outside the checkout', () => {
    expect(isSealedPath('src/personas/roster/voice-records.ts')).toBe(false);
    const root = repo();
    const { run, calls } = fake(root, [breaksBlank]);
    const results = runPlants(
      [plant({ id: 'up', file: '../calc.ts' }), plant({ id: 'abs', test: '/etc/hosts' })],
      root,
      run
    );
    expect(results.map((r) => r.verdict)).toEqual([
      'REFUSED (outside repo)',
      'REFUSED (outside repo)',
    ]);
    expect(calls).toEqual([]);
  });
});

describe('what reaches the public log', () => {
  const SENTINEL = 'ROW-TEXT-THAT-MUST-NOT-PRINT';
  const vitestJson = {
    testResults: [
      {
        status: 'failed',
        message: '',
        assertionResults: [
          {
            fullName: BLANK,
            status: 'failed',
            failureMessages: [`AssertionError: expected '${SENTINEL}' to be ''`],
          },
          {
            fullName: TWICE,
            status: 'failed',
            failureMessages: [`TypeError: ${SENTINEL} is not a function`],
          },
        ],
      },
    ],
  };

  it('parseVitestJson keeps names, statuses and error classes, and drops every message', () => {
    const report = parseVitestJson(vitestJson);
    expect(report).toEqual({
      kind: 'report',
      loadFailed: false,
      tests: [
        { fullName: BLANK, status: 'failed', errorClass: 'AssertionError' },
        { fullName: TWICE, status: 'failed', errorClass: 'TypeError' },
      ],
    });
    expect(JSON.stringify(report)).not.toContain(SENTINEL);
    expect(judge(report, 'blank strings')).toEqual({
      verdict: 'RED',
      errorClass: 'AssertionError',
    });
  });

  it('a file vitest could not load, or no file at all, is a load failure', () => {
    const failedFile = {
      testResults: [{ status: 'failed', message: `Error: ${SENTINEL}`, assertionResults: [] }],
    };
    expect(parseVitestJson(failedFile)).toEqual({ kind: 'report', loadFailed: true, tests: [] });
    expect(parseVitestJson({})).toEqual({ kind: 'report', loadFailed: true, tests: [] });
  });

  it('the results table carries no message text', () => {
    const root = repo();
    const run: RunTest = () =>
      parseVitestJson(
        readFileSync(join(root, 'src/calc.ts'), 'utf8').includes("!== ''")
          ? vitestJson
          : {
              testResults: [
                {
                  status: 'passed',
                  assertionResults: [
                    { fullName: BLANK, status: 'passed' },
                    { fullName: TWICE, status: 'passed' },
                  ],
                },
              ],
            }
      );
    const table = formatResults(runPlants([plant()], root, run));
    expect(table).toContain('| p1 | RED |');
    expect(table).not.toContain(SENTINEL);
  });
});

describe('parseManifest', () => {
  it('accepts a plant with an empty replacement', () => {
    expect(parseManifest({ plants: [plant({ replace: '' })] })).toEqual([plant({ replace: '' })]);
  });

  it.each([
    [{}, /non-empty "plants"/],
    [{ plants: [] }, /non-empty "plants"/],
    [{ plants: [{ ...plant(), expectRed: undefined }] }, /plant 0: "expectRed"/],
    [{ plants: [plant({ find: '' })] }, /plant 0: "find" must be a non-empty string/],
    [{ plants: [plant(), plant()] }, /plant 1: duplicate id "p1"/],
  ])('rejects %j', (json, message) => {
    expect(() => parseManifest(json)).toThrow(message);
  });
});

describe('the command line', () => {
  const SCRIPT = resolve(__dirname, '../run-plants.ts');
  const cli = (args: string[]) =>
    spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', SCRIPT, ...args], {
      encoding: 'utf8',
    });

  it('exits 2 with nothing to plant, and prints only the path of a manifest that is not JSON', () => {
    expect(cli([]).status).toBe(2);
    const root = repo({ 'bad.json': '{"plants": [ROW-TEXT-THAT-MUST-NOT-PRINT' });
    const bad = cli(['--root', root, join(root, 'bad.json')]);
    expect(bad.status).toBe(2);
    expect(bad.stderr).toContain('not readable JSON');
    expect(bad.stderr + bad.stdout).not.toContain('ROW-TEXT');
    expect(existsSync(join(root, 'bad.json'))).toBe(true);
  });
});

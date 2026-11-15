/**
 * run-plants.ts plants one bug at a time and counts it only when the named row fails on an
 * assertion. Most rows run it against a throwaway git repo of invented files with a fake test
 * runner that reads the planted file, so every verdict path is exercised without starting
 * vitest. The process-group rows run small sh commands that leave children behind, and the last
 * groups drive the real vitest runner and the command line on tiny invented tests.
 */
import { execFileSync, spawn, spawnSync } from 'child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  formatResults,
  isSealedPath,
  judge,
  parseManifest,
  parsePlantReport,
  ranExactly,
  reportFrom,
  runInGroup,
  runPlants,
  vitestRunner,
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

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

/** A committed git repo of invented files, plus committed symbolic links (path -> target). */
function repo(
  files: Record<string, string> = { 'src/calc.ts': SOURCE, [TEST]: '// fake\n' },
  links: Record<string, string> = {}
): string {
  const dir = tempDir('plants-test-');
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  for (const [path, target] of Object.entries(links)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    symlinkSync(target, join(dir, path));
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

type Rule = { when: string; fail: string; errorClass?: string; assertion?: boolean };

/** A fake vitest: both rows pass, unless src/calc.ts contains a rule's `when` text. */
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
      if (!r) return { fullName, status: 'passed' };
      const errorClass = r.errorClass ?? 'AssertionError';
      const assertion = r.assertion ?? errorClass === 'AssertionError';
      return { fullName, status: 'failed', errorClass, ...(assertion ? { assertion } : {}) };
    });
    return { kind: 'report', loadFailed: false, tests, files: [join(root, test)] };
  };
  return { run, calls };
}

const plant = (over: Partial<Plant> = {}): Plant => ({
  id: 'p1',
  file: 'src/calc.ts',
  find: "=== ''",
  replace: "!== ''",
  test: TEST,
  expectRed: BLANK,
  ...over,
});

const status = (root: string) =>
  execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
const pause = (ms: number) =>
  new Promise<void>((done) => {
    setTimeout(done, ms);
  });
/** True when no process has this id (a negative id names a process group). */
const gone = (id: number) => {
  try {
    process.kill(id, 0);
    return false;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'ESRCH';
  }
};
const killNow = (id: number) => {
  try {
    process.kill(id, 'SIGKILL');
  } catch {
    // already gone
  }
};
const breaksBlank: Rule = { when: "!== ''", fail: BLANK };

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

describe('runPlants verdicts', () => {
  it('RED only when the expectRed test fails on an assertion, then restores the file', async () => {
    const root = repo();
    const { run, calls } = fake(root, [breaksBlank]);
    const [r] = await runPlants([plant()], root, run);
    expect(r).toMatchObject({ verdict: 'RED', errorClass: 'AssertionError', failing: [BLANK] });
    expect(calls).toEqual([TEST, TEST]); // baseline, then the planted run
    expect(readFileSync(join(root, 'src/calc.ts'), 'utf8')).toBe(SOURCE);
    expect(status(root)).toBe('');
  });

  it('a throw that is not an assertion, another test failing, or nothing failing does not count', async () => {
    const root = repo();
    const threw = fake(root, [{ ...breaksBlank, errorClass: 'TypeError' }]).run;
    expect((await runPlants([plant()], root, threw))[0]).toMatchObject({
      verdict: 'RED (not an assertion)',
      errorClass: 'TypeError',
    });
    const other = fake(root, [{ when: "!== ''", fail: TWICE }]).run;
    expect((await runPlants([plant()], root, other))[0]).toMatchObject({
      verdict: 'RED (other test)',
      failing: [TWICE],
    });
    expect((await runPlants([plant()], root, fake(root).run))[0].verdict).toBe('GREEN');
  });

  it('an Error renamed AssertionError by hand, with no expected or actual, does not count', async () => {
    const root = repo();
    const { run } = fake(root, [{ ...breaksBlank, assertion: false }]);
    expect((await runPlants([plant()], root, run))[0]).toMatchObject({
      verdict: 'RED (not an assertion)',
      errorClass: 'AssertionError',
    });
  });

  it('NOT PLANTED when find is missing or the replacement changes nothing', async () => {
    const root = repo();
    const { run, calls } = fake(root, [breaksBlank]);
    const results = await runPlants(
      [plant({ id: 'a', find: 'no such text' }), plant({ id: 'b', replace: "=== ''" })],
      root,
      run
    );
    expect(results.map((r) => r.verdict)).toEqual(['NOT PLANTED', 'NOT PLANTED']);
    expect(calls).toEqual([TEST]); // the baseline only
    expect(status(root)).toBe('');
  });

  it('AMBIGUOUS when find occurs twice, and nothing is written', async () => {
    const root = repo();
    const { run, calls } = fake(root, [{ when: 'n * 3', fail: TWICE }]);
    const [r] = await runPlants(
      [plant({ find: 'twice', replace: 'thrice', expectRed: TWICE })],
      root,
      run
    );
    expect(r.verdict).toBe('AMBIGUOUS');
    expect(calls).toEqual([TEST]);
    expect(readFileSync(join(root, 'src/calc.ts'), 'utf8')).toBe(SOURCE);
  });

  it('BASELINE RED when the unplanted file already fails, NO SUCH TEST when expectRed names nothing', async () => {
    const root = repo();
    const red = fake(root, [{ when: "=== ''", fail: TWICE }]);
    expect((await runPlants([plant()], root, red.run))[0].verdict).toBe('BASELINE RED');
    expect(red.calls).toEqual([TEST]);
    const [r] = await runPlants(
      [plant({ expectRed: 'no test is called this' })],
      root,
      fake(root, [breaksBlank]).run
    );
    expect(r.verdict).toBe('NO SUCH TEST');
  });

  it('expectRed must be the whole row title: a part of a title is NO SUCH TEST', async () => {
    const root = repo();
    const { run } = fake(root, [breaksBlank]);
    const results = await runPlants(
      [plant({ id: 'tail', expectRed: 'blank strings are blank' }), plant({ id: 'whole' })],
      root,
      run
    );
    expect(results.map((r) => r.verdict)).toEqual(['NO SUCH TEST', 'RED']);
  });

  it('LOAD ERROR when the planted file fails to collect, runs no tests, or leaves no report; TIMEOUT on a timeout', async () => {
    const root = repo();
    const files = [join(root, TEST)];
    const cases: Array<[TestReport, string]> = [
      [{ kind: 'report', loadFailed: true, tests: [], files }, 'LOAD ERROR'],
      [{ kind: 'report', loadFailed: false, tests: [], files }, 'LOAD ERROR'],
      [{ kind: 'no-report' }, 'LOAD ERROR'],
      [{ kind: 'timeout' }, 'TIMEOUT'],
    ];
    for (const [report, verdict] of cases) {
      const { run } = fake(root, [], (text) => (text.includes("!== ''") ? report : undefined));
      expect((await runPlants([plant()], root, run))[0].verdict, verdict).toBe(verdict);
    }
    expect(status(root)).toBe('');
  });

  it('DIRTY when a run leaves a stray file: the plant is restored and the rest are SKIPPED', async () => {
    const root = repo();
    const { run, calls } = fake(root, [breaksBlank], (text) => {
      if (text.includes("!== ''")) writeFileSync(join(root, 'stray.txt'), 'x');
    });
    const results = await runPlants([plant({ id: 'a' }), plant({ id: 'b' })], root, run);
    expect(results.map((r) => r.verdict)).toEqual(['DIRTY', 'SKIPPED']);
    expect(calls).toHaveLength(2);
    expect(readFileSync(join(root, 'src/calc.ts'), 'utf8')).toBe(SOURCE);
  });

  it('a tree dirty before the first plant runs nothing', async () => {
    const root = repo();
    writeFileSync(join(root, 'src/calc.ts'), `${SOURCE}// edit\n`);
    const { run, calls } = fake(root, [breaksBlank]);
    expect(
      (await runPlants([plant({ id: 'a' }), plant({ id: 'b' })], root, run)).map((r) => r.verdict)
    ).toEqual(['DIRTY', 'SKIPPED']);
    expect(calls).toEqual([]);
  });

  it('a test path that names no file is refused before anything runs', async () => {
    const root = repo();
    const { run, calls } = fake(root, [breaksBlank]);
    const [r] = await runPlants([plant({ test: 'src/calc.tes' })], root, run);
    expect(r).toMatchObject({ verdict: 'REFUSED (no test file)', failing: [] });
    expect(calls).toEqual([]);
  });

  it('a run that also ran another test file is refused, and no row title from it is printed', async () => {
    const root = repo();
    const other = 'OTHER-FILE-ROW-MUST-NOT-PRINT';
    const wider = (files: string[]): TestReport => ({
      kind: 'report',
      loadFailed: false,
      tests: [
        { fullName: BLANK, status: 'failed', errorClass: 'AssertionError', assertion: true },
        { fullName: other, status: 'failed', errorClass: 'AssertionError', assertion: true },
      ],
      files,
    });
    const both = [join(root, TEST), join(root, 'src/held-out/calc.test.ts')];
    const atBaseline = fake(root, [], () => wider(both));
    const planted = fake(root, [breaksBlank], (text) =>
      text.includes("!== ''") ? wider(both) : undefined
    );
    const results = [
      ...(await runPlants([plant({ id: 'base' })], root, atBaseline.run)),
      ...(await runPlants([plant({ id: 'planted' })], root, planted.run)),
    ];
    expect(results.map((r) => [r.verdict, r.failing])).toEqual([
      ['REFUSED (other test files)', []],
      ['REFUSED (other test files)', []],
    ]);
    expect(atBaseline.calls).toEqual([TEST]);
    expect(planted.calls).toEqual([TEST, TEST]);
    expect(formatResults(results)).not.toContain(other);
    expect(readFileSync(join(root, 'src/calc.ts'), 'utf8')).toBe(SOURCE);
  });

  it('a run of a different file only, or of no file at all, is refused too', async () => {
    const root = repo();
    for (const files of [[join(root, 'src/calc.ts')], []]) {
      const { run } = fake(root, [breaksBlank], (text) =>
        text.includes("!== ''")
          ? {
              kind: 'report',
              loadFailed: false,
              tests: [
                {
                  fullName: BLANK,
                  status: 'failed',
                  errorClass: 'AssertionError',
                  assertion: true,
                },
              ],
              files,
            }
          : undefined
      );
      expect((await runPlants([plant()], root, run))[0].verdict, `${files.length}`).toBe(
        'REFUSED (other test files)'
      );
    }
  });

  it('a run that left processes no signal could end is REFUSED (child processes left), and no further plant runs', async () => {
    const root = repo();
    const atBaseline = fake(root, [], () => ({ kind: 'children-left', leftover: 1 }));
    const planted = fake(root, [breaksBlank], (text) =>
      text.includes("!== ''") ? { kind: 'children-left', leftover: 2 } : undefined
    );
    const verdicts = async (run: RunTest) =>
      (await runPlants([plant({ id: 'a' }), plant({ id: 'b' })], root, run)).map((r) => [
        r.id,
        r.verdict,
        r.leftover,
      ]);
    expect(await verdicts(atBaseline.run)).toEqual([
      ['a', 'REFUSED (child processes left)', 1],
      ['b', 'SKIPPED', undefined],
    ]);
    expect(await verdicts(planted.run)).toEqual([
      ['a', 'REFUSED (child processes left)', 2],
      ['b', 'SKIPPED', undefined],
    ]);
    expect(planted.calls).toEqual([TEST, TEST]); // b never ran
    expect(readFileSync(join(root, 'src/calc.ts'), 'utf8')).toBe(SOURCE);
    expect(status(root)).toBe('');
  });

  it('writes the replacement literally ($& and $1 are not patterns)', async () => {
    const root = repo();
    const { run } = fake(root, [{ when: "'$&'", fail: BLANK }]);
    expect((await runPlants([plant({ replace: "=== '$&'" })], root, run))[0].verdict).toBe('RED');
  });
});

describe('ranExactly: the run must be the requested test file and nothing else', () => {
  it('the requested file alone is exact, however its module path is spelt', () => {
    const root = repo();
    const real = realpathSync(root);
    expect(ranExactly(real, TEST, [join(root, TEST)])).toBe(true);
    expect(ranExactly(real, TEST, [join(root, 'src/../src/calc.test.ts')])).toBe(true);
  });

  it('the requested file plus another is not exact', () => {
    const root = repo();
    const real = realpathSync(root);
    expect(ranExactly(real, TEST, [join(root, TEST), join(root, 'src/calc.ts')])).toBe(false);
  });

  it('another file alone, no file at all, a path that does not resolve, or a missing requested file is not exact', () => {
    const root = repo();
    const real = realpathSync(root);
    expect(ranExactly(real, TEST, [join(root, 'src/calc.ts')])).toBe(false);
    expect(ranExactly(real, TEST, [])).toBe(false);
    expect(ranExactly(real, TEST, [join(root, TEST), ''])).toBe(false);
    expect(ranExactly(real, 'src/nosuch.test.ts', [join(root, 'src/nosuch.test.ts')])).toBe(false);
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

  it.each(sealed)('refuses %s as the planted file and as the test', async (path) => {
    expect(isSealedPath(path)).toBe(true);
    const root = repo();
    const { run, calls } = fake(root, [breaksBlank]);
    const results = await runPlants(
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

  it('refuses a sealed segment at any depth, for every sealed name', async () => {
    const nested = [
      'apps/x/scripts/crisis-eval/a.ts',
      'apps/x/scripts/voice-eval/a.ts',
      'apps/x/src/fixtures/a.ts',
      'apps/x/heldout/a.ts',
      'apps/x/held-out/a.ts',
      'apps/x/blind/a.ts',
      'apps/x/sealed/a.ts',
      'apps/x/corpus/a.ts',
    ];
    const root = repo();
    const { run, calls } = fake(root, [breaksBlank]);
    for (const path of nested) {
      expect(isSealedPath(path), path).toBe(true);
      const results = await runPlants(
        [plant({ id: 'f', file: path }), plant({ id: 't', test: path })],
        root,
        run
      );
      expect(
        results.map((r) => r.verdict),
        path
      ).toEqual(['REFUSED (sealed path)', 'REFUSED (sealed path)']);
    }
    expect(calls).toEqual([]);
    expect(isSealedPath('apps/x/scripts/ci/a.ts')).toBe(false);
    expect(isSealedPath('apps/x/scripts/crisis-evaluation/a.ts')).toBe(false);
  });

  it('allows an ordinary source path, and refuses paths outside the checkout', async () => {
    expect(isSealedPath('src/personas/roster/voice-records.ts')).toBe(false);
    const root = repo();
    const { run, calls } = fake(root, [breaksBlank]);
    const results = await runPlants(
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

describe('paths are judged by where they lead, not by their name', () => {
  const FIXTURE = 'export const fixture = 1; // invented\n';
  const files = {
    'src/calc.ts': SOURCE,
    [TEST]: '// fake\n',
    'data/fixtures/x.ts': FIXTURE,
    'data/sealed/x.test.ts': '// invented sealed test\n',
  };

  it('a link with an ordinary name to a fixtures file is refused as a sealed path, and the file is untouched', async () => {
    const root = repo(files, { 'src/ok.ts': '../data/fixtures/x.ts' });
    const { run, calls } = fake(root, [breaksBlank]);
    const [r] = await runPlants([plant({ file: 'src/ok.ts', find: 'fixture = 1' })], root, run);
    expect(r.verdict).toBe('REFUSED (sealed path)');
    expect(calls).toEqual([]);
    expect(readFileSync(join(root, 'data/fixtures/x.ts'), 'utf8')).toBe(FIXTURE);
    expect(status(root)).toBe('');
  });

  it('a link to a file outside the checkout is refused as outside, and that file is untouched', async () => {
    const outside = join(tempDir('plants-outside-'), 'x.ts');
    writeFileSync(outside, FIXTURE);
    const root = repo(files, { 'src/ok-out.ts': outside });
    const { run, calls } = fake(root, [breaksBlank]);
    const [r] = await runPlants([plant({ file: 'src/ok-out.ts', find: 'fixture = 1' })], root, run);
    expect(r.verdict).toBe('REFUSED (outside repo)');
    expect(calls).toEqual([]);
    expect(readFileSync(outside, 'utf8')).toBe(FIXTURE);
  });

  it('a test reached through an ordinary link to a sealed test is refused, and nothing runs', async () => {
    const root = repo(files, { 'src/ok.test.ts': '../data/sealed/x.test.ts' });
    const { run, calls } = fake(root, [breaksBlank]);
    const [r] = await runPlants([plant({ test: 'src/ok.test.ts' })], root, run);
    expect(r.verdict).toBe('REFUSED (sealed path)');
    expect(calls).toEqual([]);
    expect(readFileSync(join(root, 'src/calc.ts'), 'utf8')).toBe(SOURCE);
  });

  it('a link to an ordinary file inside the checkout is refused as a link, and the file is untouched', async () => {
    const root = repo(files, { 'src/alias.ts': 'calc.ts' });
    const { run, calls } = fake(root, [breaksBlank]);
    const [r] = await runPlants([plant({ file: 'src/alias.ts' })], root, run);
    expect(r.verdict).toBe('REFUSED (link)');
    expect(calls).toEqual([]);
    expect(readFileSync(join(root, 'src/calc.ts'), 'utf8')).toBe(SOURCE);
    expect(status(root)).toBe('');
  });

  it('a linked parent directory is refused too', async () => {
    const root = repo(files, { lib: 'src' });
    const { run, calls } = fake(root, [breaksBlank]);
    const [r] = await runPlants([plant({ file: 'lib/calc.ts' })], root, run);
    expect(r.verdict).toBe('REFUSED (link)');
    expect(calls).toEqual([]);
    expect(readFileSync(join(root, 'src/calc.ts'), 'utf8')).toBe(SOURCE);
  });

  it('a checkout reached through a linked root still plants and restores an ordinary file', async () => {
    const root = repo();
    const viaLink = join(tempDir('plants-root-'), 'checkout');
    symlinkSync(root, viaLink);
    const { run } = fake(root, [breaksBlank]);
    expect((await runPlants([plant()], viaLink, run))[0].verdict).toBe('RED');
    expect(readFileSync(join(root, 'src/calc.ts'), 'utf8')).toBe(SOURCE);
  });
});

describe('what reaches the public log', () => {
  const SENTINEL = 'ROW-TEXT-THAT-MUST-NOT-PRINT';
  const report = {
    unhandled: 0,
    modules: [
      {
        errors: 0,
        message: SENTINEL,
        tests: [
          {
            fullName: BLANK,
            status: 'failed',
            errorName: 'AssertionError',
            assertion: true,
            message: SENTINEL,
          },
          { fullName: TWICE, status: 'failed', errorName: 'TypeError', stack: SENTINEL },
        ],
      },
    ],
  };

  it('parsePlantReport keeps titles, states and error names, and drops every other field', () => {
    const parsed = parsePlantReport({
      ...report,
      modules: report.modules.map((m) => ({ ...m, file: '/checkout/src/calc.test.ts' })),
    });
    expect(parsed).toEqual({
      kind: 'report',
      loadFailed: false,
      tests: [
        { fullName: BLANK, status: 'failed', errorClass: 'AssertionError', assertion: true },
        { fullName: TWICE, status: 'failed', errorClass: 'TypeError' },
      ],
      files: ['/checkout/src/calc.test.ts'],
    });
    expect(JSON.stringify(parsed)).not.toContain(SENTINEL);
    expect(judge(parsed, BLANK)).toEqual({ verdict: 'RED', errorClass: 'AssertionError' });
  });

  it('a module-level error, an unhandled error, or no module at all is a load failure', () => {
    expect(parsePlantReport({ modules: [{ errors: 1, tests: [] }] }).kind).toBe('report');
    expect(parsePlantReport({ modules: [{ errors: 1, tests: [] }] })).toMatchObject({
      loadFailed: true,
    });
    expect(parsePlantReport({ unhandled: 1, modules: [{ errors: 0, tests: [] }] })).toMatchObject({
      loadFailed: true,
    });
    expect(parsePlantReport({})).toEqual({
      kind: 'report',
      loadFailed: true,
      tests: [],
      files: [],
    });
  });

  it('the results table carries no message text', async () => {
    const root = repo();
    const file = join(root, TEST);
    const run: RunTest = () =>
      parsePlantReport(
        readFileSync(join(root, 'src/calc.ts'), 'utf8').includes("!== ''")
          ? { ...report, modules: report.modules.map((m) => ({ ...m, file })) }
          : {
              modules: [
                {
                  file,
                  errors: 0,
                  tests: [
                    { fullName: BLANK, status: 'passed' },
                    { fullName: TWICE, status: 'passed' },
                  ],
                },
              ],
            }
      );
    const table = formatResults(await runPlants([plant()], root, run));
    expect(table).toContain('| p1 | RED |');
    expect(table).not.toContain(SENTINEL);
  });
});

describe('the real vitest runner, on a tiny invented test', () => {
  const SENTINEL = 'ROW-TEXT-THAT-MUST-NOT-PRINT';
  const NODE_MODULES = resolve(__dirname, '../../../../node_modules');

  /** A project of invented files that borrows this checkout's node_modules through a link. */
  function project(dir = tempDir('plants-vitest-'), include = '*.test.mjs'): string {
    symlinkSync(NODE_MODULES, join(dir, 'node_modules'));
    writeFileSync(
      join(dir, 'vitest.config.mjs'),
      `export default { cacheDir: ${JSON.stringify(join(dir, '.vite'))}, test: { include: [${JSON.stringify(include)}] } };\n`
    );
    writeFileSync(
      join(dir, 'tiny.test.mjs'),
      `import { describe, expect, it } from 'vitest';
describe('tiny', () => {
  it('passes', () => expect(1).toBe(1));
  it('fails on an assertion', () => expect('${SENTINEL}').toBe(''));
  it('throws a type error', () => { throw new TypeError('${SENTINEL}'); });
  it('throws a string that starts like an assertion', () => { throw 'AssertionError: ${SENTINEL}'; });
  it('throws an Error named AssertionError by hand', () => {
    const e = new Error('${SENTINEL}');
    e.name = 'AssertionError';
    throw e;
  });
  it('sees no token and not the real HOME', () => {
    expect(process.env.PLANT_INVENTED_TOKEN).toBeUndefined();
    expect(process.env.HOME).not.toBe(${JSON.stringify(process.env.HOME ?? '')});
  });
});
`
    );
    writeFileSync(
      join(dir, 'slow.test.mjs'),
      // Spins for 20 s at most, so even a worker that outlived a killed run would end on its own.
      `import { it } from 'vitest';\nit('spins', () => { const end = Date.now() + 20000; while (Date.now() < end); }, 600000);\n`
    );
    writeFileSync(
      join(dir, 'worker.test.mjs'),
      `import { writeFileSync } from 'node:fs';\nimport { it } from 'vitest';\nit('notes its worker', () => writeFileSync(${JSON.stringify(join(dir, 'worker.pid'))}, String(process.pid)));\n`
    );
    return dir;
  }

  it('after a normal run nothing is left in the group, and the test worker itself is gone', async () => {
    const dir = project();
    const vitest = join(dir, 'node_modules/.bin/vitest');
    const env = { PATH: process.env.PATH ?? '', HOME: tempDir('plants-home-') };
    const args = ['run', '--config', 'vitest.config.mjs', join(dir, 'worker.test.mjs')];
    const run = await runInGroup(vitest, args, { cwd: dir, env }, 60_000);
    const worker = Number(readFileSync(join(dir, 'worker.pid'), 'utf8'));
    try {
      expect(run).toMatchObject({ timedOut: false, leftover: 0 });
      expect(worker).toBeGreaterThan(1);
      expect(gone(worker)).toBe(true);
      // The same through the real runner, which judges the report only after the group is empty.
      rmSync(join(dir, 'worker.pid'));
      const report = await vitestRunner(dir, 'vitest.config.mjs', 60_000)('worker.test.mjs');
      expect(report.kind === 'report' ? report.tests.map((t) => t.status) : report.kind).toEqual([
        'passed',
      ]);
      expect(gone(Number(readFileSync(join(dir, 'worker.pid'), 'utf8')))).toBe(true);
    } finally {
      killNow(worker);
    }
  }, 120_000);

  it('reports titles, states and the thrown error name, with no message, token or real HOME', async () => {
    const dir = project();
    process.env.PLANT_INVENTED_TOKEN = 'invented-token-value';
    let report: TestReport;
    try {
      report = await vitestRunner(dir, 'vitest.config.mjs', 60_000)('tiny.test.mjs');
    } finally {
      delete process.env.PLANT_INVENTED_TOKEN;
    }
    expect(report.kind).toBe('report');
    expect(
      report.kind === 'report' && ranExactly(realpathSync(dir), 'tiny.test.mjs', report.files)
    ).toBe(true);
    const rows = report.kind === 'report' ? report.tests : [];
    const row = (title: string) => rows.find((t) => t.fullName === `tiny > ${title}`);
    expect(row('passes')?.status).toBe('passed');
    expect(row('fails on an assertion')).toMatchObject({
      status: 'failed',
      errorClass: 'AssertionError',
      assertion: true,
    });
    expect(judge(report, 'tiny > fails on an assertion').verdict).toBe('RED');
    const byHand = row('throws an Error named AssertionError by hand');
    expect(byHand).toMatchObject({ status: 'failed', errorClass: 'AssertionError' });
    expect(byHand?.assertion).not.toBe(true);
    expect(judge(report, 'tiny > throws an Error named AssertionError by hand').verdict).toBe(
      'RED (not an assertion)'
    );
    expect(row('throws a type error')).toMatchObject({ status: 'failed', errorClass: 'TypeError' });
    expect(row('throws a string that starts like an assertion')?.status).toBe('failed');
    expect(row('throws a string that starts like an assertion')?.errorClass).not.toBe(
      'AssertionError'
    );
    expect(row('sees no token and not the real HOME')?.status).toBe('passed');
    expect(judge(report, 'tiny > throws a string that starts like an assertion').verdict).toBe(
      'RED (not an assertion)'
    );
    expect(JSON.stringify(report)).not.toContain(SENTINEL);
  }, 90_000);

  it('a run past its time limit is a timeout, not a missing report', async () => {
    const dir = project();
    expect(await vitestRunner(dir, 'vitest.config.mjs', 4_000)('slow.test.mjs')).toEqual({
      kind: 'timeout',
    });
  }, 60_000);
});

describe('each run leads its own process group, emptied before runInGroup returns', () => {
  /**
   * sh writes $$, its pid, which is also the new group's id, and the pids of its sleeps, so a
   * failing row still kills them one by one even if they never were in a group of their own.
   */
  const inGroup = async (script: string, timeoutMs: number) => {
    const cwd = tempDir('plants-group-');
    const run = runInGroup(
      '/bin/sh',
      ['-c', script],
      { cwd, env: { PATH: process.env.PATH ?? '' } },
      timeoutMs
    );
    const result = await Promise.race([run, pause(20_000).then(() => 'hung' as const)]);
    const pgid = Number(readFileSync(join(cwd, 'pgid'), 'utf8'));
    const cleanup = () => {
      killNow(-pgid);
      killNow(pgid);
      for (const kid of readFileSync(join(cwd, 'kids'), 'utf8').split('\n').filter(Boolean)) {
        killNow(Number(kid));
      }
    };
    return { result, pgid, cleanup };
  };

  it('a command that exits and leaves a sleeping grandchild ends with the group empty', async () => {
    const { result, pgid, cleanup } = await inGroup(
      'echo $$ > pgid; sleep 300 & echo $! > kids; exit 0',
      30_000
    );
    try {
      expect(result).toEqual({ timedOut: false, strays: 1, leftover: 0 });
      expect(gone(-pgid)).toBe(true);
    } finally {
      cleanup();
    }
  }, 30_000);

  it('past its time limit, a group that ignores TERM is killed and nothing survives', async () => {
    const { result, pgid, cleanup } = await inGroup(
      "trap '' TERM; echo $$ > pgid; sleep 300 & echo $! > kids; sleep 300 & echo $! >> kids; wait",
      1_000
    );
    try {
      expect(result).not.toBe('hung');
      expect(result).toMatchObject({ timedOut: true, leftover: 0 });
      expect(gone(-pgid)).toBe(true);
    } finally {
      cleanup();
    }
  }, 30_000);

  it('reportFrom: a group that could not be emptied outranks a timeout, which outranks a report', () => {
    const out = join(tempDir('plants-out-'), 'report.json');
    writeFileSync(out, JSON.stringify({ modules: [] }));
    expect(reportFrom({ timedOut: true, strays: 3, leftover: 2 }, out)).toEqual({
      kind: 'children-left',
      leftover: 2,
    });
    expect(reportFrom({ timedOut: true, strays: 1, leftover: 0 }, out)).toEqual({
      kind: 'timeout',
    });
    expect(reportFrom({ timedOut: false, strays: 1, leftover: 0 }, out).kind).toBe('report');
    expect(judge({ kind: 'children-left', leftover: 1 }, BLANK).verdict).toBe(
      'REFUSED (child processes left)'
    );
  });
});

describe('the real vitest runner: one test argument can match other files', () => {
  const SEALED_ROW = 'SEALED-ROW-MUST-NOT-PRINT';
  const NODE_MODULES = resolve(__dirname, '../../../../node_modules');
  const row = (title: string, pass: boolean) =>
    `import { expect, it } from 'vitest';\nit('${title}', () => expect(${pass ? 1 : 0}).toBe(1));\n`;

  /**
   * A committed repo of invented tests with vitest including every *.test.mjs. vitest reads
   * a file argument as a substring filter, and an absolute one also as a path prefix, so each
   * case below makes one argument match a second file.
   */
  function project(): string {
    const dir = repo({
      '.gitignore': 'node_modules\n.vite\n',
      'vitest.config.mjs':
        "export default { cacheDir: '.vite', test: { include: ['**/*.test.mjs'] } };\n",
      'tiny.test.mjs': row('tiny passes', true),
      'held-out/tiny.test.mjs': row(SEALED_ROW, false),
      'blind/nosuch.test.mjs': row(SEALED_ROW, false),
      'pre.test.mjs': row('pre passes', true),
      'pre.test.mjs-sealed/x.test.mjs': row(SEALED_ROW, false),
      'one.test.mjs': row('one passes', true),
      'one.test.mjs.test.mjs': row('the longer name passes', true),
    });
    symlinkSync(NODE_MODULES, join(dir, 'node_modules'));
    return dir;
  }

  const plantFor = (id: string, test: string): Plant => ({
    id,
    file: 'pre.test.mjs',
    find: 'pre passes',
    replace: 'pre fails',
    test,
    expectRed: 'pre passes',
  });

  it('an ordinary test name inside a sealed-named path, a missing name that matches a sealed file, and a name that prefixes a sealed folder are refused with no sealed row printed', async () => {
    const dir = project();
    const run = vitestRunner(dir, 'vitest.config.mjs', 60_000);
    const results = await runPlants(
      [
        plantFor('substring', 'tiny.test.mjs'),
        plantFor('missing', 'nosuch.test.mjs'),
        plantFor('prefix', 'pre.test.mjs'),
      ],
      dir,
      run
    );
    expect(results.map((r) => [r.id, r.verdict, r.failing])).toEqual([
      ['substring', 'REFUSED (other test files)', []],
      ['missing', 'REFUSED (no test file)', []],
      ['prefix', 'REFUSED (other test files)', []],
    ]);
    expect(formatResults(results)).not.toContain(SEALED_ROW);
    expect(status(dir)).toBe('');
  }, 120_000);

  it('of two ordinary files where one name is a prefix of the other, the shorter is refused, not judged on both', async () => {
    const dir = project();
    const run = vitestRunner(dir, 'vitest.config.mjs', 60_000);
    const report = await run('one.test.mjs');
    // vitest ran both files (the absolute path is a prefix of the longer one) ...
    expect(report.kind === 'report' ? report.tests.map((t) => t.fullName).sort() : []).toEqual([
      'one passes',
      'the longer name passes',
    ]);
    // ... so the run is refused, with nothing from it kept.
    const [r] = await runPlants(
      [{ ...plantFor('shorter', 'one.test.mjs'), expectRed: 'one passes' }],
      dir,
      run
    );
    expect([r.verdict, r.failing]).toEqual(['REFUSED (other test files)', []]);
  }, 120_000);
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

  it('TERM to the runner mid-run kills the vitest group and restores the planted file', async () => {
    const marks = tempDir('plants-marks-');
    const marker = join(marks, 'worker.pid');
    const root = repo({
      '.gitignore': 'node_modules\n.vite\n',
      'vitest.config.mjs':
        "export default { cacheDir: '.vite', test: { include: ['*.test.mjs'] } };\n",
      // Unplanted it passes at once; planted it notes its worker and spins for 30 s at most.
      'hang.test.mjs': `import { writeFileSync } from 'node:fs';\nimport { it } from 'vitest';\nconst hang = false;\nit('hangs when planted', () => {\n  if (!hang) return;\n  writeFileSync(${JSON.stringify(marker)}, String(process.pid));\n  const end = Date.now() + 30000;\n  while (Date.now() < end);\n}, 600000);\n`,
    });
    symlinkSync(resolve(__dirname, '../../../../node_modules'), join(root, 'node_modules'));
    const manifest = join(marks, 'plants.json');
    writeFileSync(
      manifest,
      JSON.stringify({
        plants: [
          {
            id: 'hang',
            file: 'hang.test.mjs',
            find: 'const hang = false',
            replace: 'const hang = true',
            test: 'hang.test.mjs',
            expectRed: 'hangs when planted',
          },
        ],
      })
    );
    const runner = spawn(
      process.execPath,
      ['--experimental-strip-types', '--no-warnings', SCRIPT, '--root', root, manifest],
      { stdio: 'ignore' }
    );
    const ended = new Promise<number | string>((done) => {
      runner.once('exit', (code, signal) => done(code ?? signal ?? 'none'));
    });
    let worker = 0;
    try {
      for (const end = Date.now() + 60_000; !existsSync(marker) && Date.now() < end;)
        await pause(200);
      worker = Number(readFileSync(marker, 'utf8'));
      runner.kill('SIGTERM');
      expect(await ended).toBe(143);
      for (const end = Date.now() + 3_000; !gone(worker) && Date.now() < end;) await pause(100);
      expect(gone(worker)).toBe(true);
      expect(status(root)).toBe('');
    } finally {
      runner.kill('SIGKILL');
      if (worker > 1) killNow(worker);
    }
  }, 120_000);
});

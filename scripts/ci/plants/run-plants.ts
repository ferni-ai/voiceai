#!/usr/bin/env node
/**
 * Planted-bug checks: does each test a PR names actually catch the bug it claims to?
 * A plant breaks one spot in the code (a literal `find` that must occur exactly once,
 * replaced by `replace`) and names the test row that must then fail. The runner plants one
 * at a time, runs only that test file in its own vitest process, restores the file and
 * requires a clean tree before the next plant.
 *
 * A plant counts only as RED: its `expectRed` row (the full title, suites and test joined by
 * " > ", matched exactly) failed with an error whose name is AssertionError and that carries an
 * assertion's expected or actual value, as a failed expect does. A file that
 * failed to load, a different row failing, a throw that is not an assertion, a timeout or a
 * pass all count against it. The baseline (the test file unplanted) must pass first, with the
 * `expectRed` row in it.
 *
 * The logs are public (public repo), so the runner prints only plant ids, verdicts, failing
 * row titles, error names and seconds: never an assertion message, a diff or source. vitest's
 * own output is discarded, and a small reporter writes only titles, states and error names.
 *
 * Paths are checked where they really lead, before anything is written: a plant or test on a
 * held-out, sealed, blind, corpus or fixture path, outside the checkout, or reached through a
 * symbolic link anywhere in the path, is refused. A test path that names no file is refused.
 * vitest reads a file argument as a filter (a substring of each included path, and an absolute
 * one also as a prefix), so one argument can run other files: every run must be exactly the
 * requested test file, judged by the realpath of each module the reporter saw, or it is
 * refused with no row title kept. Tests run with an allowlisted environment and a throwaway
 * HOME, so no token and no file under the real HOME reaches them.
 *
 * Each vitest run leads its own process group, and the plant is restored only once that group
 * is empty: vitest's forks worker can outlive its main process, and a time limit that killed
 * only the main process would leave the worker running the planted test. On the limit the whole
 * group gets TERM, then KILL; after any exit, whatever is left in the group is killed the same
 * way. A group still not empty after that is refused, and no further plant runs. TERM, INT or
 * HUP to the runner kills the running group and restores the planted file before it exits.
 *
 *   node --experimental-strip-types scripts/ci/plants/run-plants.ts --root <checkout> <manifest.json>...
 * PLANT_TIMEOUT_MS (default 180000) caps each vitest process; PLANT_VITEST_CONFIG (default
 * vitest.config.unit.ts) picks its config.
 * Manifest: {"plants": [{"id", "file", "find", "replace", "test", "expectRed"}]}.
 * Exit 0 when every plant is RED, 1 when any is not, 2 on a bad manifest, 128 + the signal's
 * number when stopped by TERM, INT or HUP.
 */
import { execFileSync, spawn } from 'child_process';
import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { constants, tmpdir } from 'os';
import { isAbsolute, join, normalize, relative, resolve, sep } from 'path';
import { pathToFileURL } from 'url';

export type Plant = {
  id: string;
  file: string;
  find: string;
  replace: string;
  test: string;
  expectRed: string;
};

export type Verdict =
  | 'RED'
  | 'GREEN'
  | 'RED (other test)'
  | 'RED (not an assertion)'
  | 'LOAD ERROR'
  | 'TIMEOUT'
  | 'NOT PLANTED'
  | 'AMBIGUOUS'
  | 'BASELINE RED'
  | 'NO SUCH TEST'
  | 'REFUSED (sealed path)'
  | 'REFUSED (outside repo)'
  | 'REFUSED (link)'
  | 'REFUSED (no test file)'
  | 'REFUSED (other test files)'
  | 'REFUSED (child processes left)'
  | 'DIRTY'
  | 'SKIPPED';

/**
 * One test row: its full title, its state, the name of its first error, and whether that error
 * carries an assertion's expected or actual value (an Error renamed by hand does not).
 */
export type TestCase = {
  fullName: string;
  status: string;
  errorClass?: string;
  assertion?: boolean;
};
/**
 * One vitest run, reduced to titles, states and error names, plus the path of each test module
 * that ran. The paths are compared, never printed. `children-left` is a run whose process group
 * could not be emptied: `leftover` processes survived TERM and KILL.
 */
export type TestReport =
  | { kind: 'report'; loadFailed: boolean; tests: TestCase[]; files: string[] }
  | { kind: 'timeout' }
  | { kind: 'no-report' }
  | { kind: 'children-left'; leftover: number };
/** A runner may answer at once (the fakes in the tests) or later (the real vitest runner). */
export type RunTest = (testFile: string) => TestReport | Promise<TestReport>;
export type Result = {
  id: string;
  verdict: Verdict;
  failing: string[];
  errorClass?: string;
  leftover?: number;
  secs: number;
};

/** The eight sealed-set exclusions every grep carries, plus held_out. Case-insensitive. */
const SEALED_NAME = /fixtures|heldout|held-out|held_out|blind|sealed|corpus/i;
const SEALED_DIR = /(^|\/)scripts\/(crisis-eval|voice-eval)(\/|$)/i;

export function isSealedPath(path: string): boolean {
  const p = normalize(path).replace(/\\/g, '/');
  return SEALED_NAME.test(p) || SEALED_DIR.test(p);
}

function insideRepo(path: string): boolean {
  const p = normalize(path);
  return !isAbsolute(p) && p !== '..' && !p.startsWith(`..${sep}`);
}

/**
 * Refuses a path by where it really leads, not by how it is spelt. `realRoot` must already be
 * a realpath. The spelling is checked first, then the realpath of the target (outside the
 * checkout, or onto a sealed path), then every part of the path is lstat'd so that a link to
 * an ordinary file is refused too: the plant would be written through it and not restored.
 */
export function pathVerdict(realRoot: string, rel: string): Verdict | null {
  if (isSealedPath(rel)) return 'REFUSED (sealed path)';
  if (!insideRepo(rel)) return 'REFUSED (outside repo)';
  const full = join(realRoot, rel);
  if (existsSync(full)) {
    const real = realpathSync(full);
    const back = relative(realRoot, real);
    if (back === '' || !insideRepo(back)) return 'REFUSED (outside repo)';
    if (isSealedPath(back)) return 'REFUSED (sealed path)';
  }
  let at = realRoot;
  for (const part of normalize(rel).split(sep).filter(Boolean)) {
    at = join(at, part);
    let isLink: boolean;
    try {
      isLink = lstatSync(at).isSymbolicLink();
    } catch {
      return null; // missing from here on: nothing to follow, and nothing will be written
    }
    if (isLink) return 'REFUSED (link)';
  }
  return null;
}

/**
 * True only when the run was exactly the requested test file: at least one module ran, and
 * every module's realpath is the realpath of `test` under `realRoot`. A missing file, a module
 * path that no longer resolves, or any other file in the run makes it false.
 */
export function ranExactly(realRoot: string, test: string, files: string[]): boolean {
  const real = (p: string): string | null => {
    try {
      return realpathSync(p);
    } catch {
      return null;
    }
  };
  const want = real(join(realRoot, test));
  if (want === null || files.length === 0) return false;
  return files.every((f) => real(f) === want);
}

const FIELDS = ['id', 'file', 'find', 'replace', 'test', 'expectRed'] as const;

/** Throws with the plant index and field when the manifest is not the expected shape. */
export function parseManifest(json: unknown): Plant[] {
  const plants = (json as { plants?: unknown })?.plants;
  if (!Array.isArray(plants) || plants.length === 0) {
    throw new Error('manifest needs a non-empty "plants" array');
  }
  const ids = new Set<string>();
  return plants.map((p, i) => {
    for (const f of FIELDS) {
      const v = (p as Record<string, unknown>)?.[f];
      if (typeof v !== 'string' || (f !== 'replace' && v.length === 0)) {
        throw new Error(
          `plant ${i}: "${f}" must be a ${f === 'replace' ? '' : 'non-empty '}string`
        );
      }
    }
    const plant = p as Plant;
    if (ids.has(plant.id)) throw new Error(`plant ${i}: duplicate id "${plant.id}"`);
    ids.add(plant.id);
    return plant;
  });
}

function occurrences(text: string, find: string): number {
  let n = 0;
  for (let at = text.indexOf(find); at !== -1; at = text.indexOf(find, at + find.length)) n++;
  return n;
}

/** The row a plant names: the whole title, exactly. A part of a title names nothing. */
const isRow = (t: TestCase, title: string) => t.fullName === title;

const failingNames = (r: TestReport): string[] =>
  r.kind === 'report' ? r.tests.filter((t) => t.status === 'failed').map((t) => t.fullName) : [];

/** The verdict for one planted run. Pure: reads titles, states and error names only. */
export function judge(
  report: TestReport,
  expectRed: string
): Pick<Result, 'verdict' | 'errorClass'> {
  if (report.kind === 'timeout') return { verdict: 'TIMEOUT' };
  if (report.kind === 'children-left') return { verdict: 'REFUSED (child processes left)' };
  if (report.kind === 'no-report' || report.loadFailed || report.tests.length === 0) {
    return { verdict: 'LOAD ERROR' };
  }
  const failed = report.tests.filter((t) => t.status === 'failed');
  if (failed.length === 0) return { verdict: 'GREEN' };
  const target = failed.find((t) => isRow(t, expectRed));
  if (!target) return { verdict: 'RED (other test)' };
  return target.errorClass === 'AssertionError' && target.assertion === true
    ? { verdict: 'RED', errorClass: 'AssertionError' }
    : { verdict: 'RED (not an assertion)', errorClass: target.errorClass };
}

/** A baseline is usable when it loaded, nothing failed, and the expectRed row passed. */
function baselineVerdict(report: TestReport, expectRed: string): Verdict | null {
  if (report.kind !== 'report' || report.loadFailed || failingNames(report).length > 0) {
    return 'BASELINE RED';
  }
  const named = report.tests.some((t) => isRow(t, expectRed) && t.status === 'passed');
  return named ? null : 'NO SUCH TEST';
}

const git = (root: string, args: string[]) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8' });

const clean = (root: string) => git(root, ['status', '--porcelain']).trim() === '';

/**
 * Cleanups for a runner stopped by a signal mid-plant, run newest first: the running process
 * group is killed before the planted file is restored. Each registration returns its removal.
 */
const aborts: Array<() => void> = [];
function onAbort(fn: () => void): () => void {
  aborts.push(fn);
  return () => {
    const at = aborts.lastIndexOf(fn);
    if (at !== -1) aborts.splice(at, 1);
  };
}
function abortAll(): void {
  for (const fn of aborts.splice(0).reverse()) {
    try {
      fn();
    } catch {
      // the next cleanup still runs
    }
  }
}

/**
 * Plants one at a time. Stops (the rest SKIPPED) the moment the tree is left dirty or a run's
 * process group could not be emptied.
 */
export async function runPlants(
  plants: Plant[],
  root: string,
  runTest: RunTest
): Promise<Result[]> {
  const results: Result[] = [];
  const baselines = new Map<string, TestReport>();
  const realRoot = realpathSync(root);
  let stopped = !clean(realRoot);
  for (const p of plants) {
    const t0 = Date.now();
    const done = (verdict: Verdict, extra: Partial<Result> = {}) =>
      results.push({ id: p.id, verdict, failing: [], secs: (Date.now() - t0) / 1000, ...extra });
    if (stopped) {
      done(results.length === 0 ? 'DIRTY' : 'SKIPPED');
      continue;
    }
    const refused =
      pathVerdict(realRoot, p.file) ??
      pathVerdict(realRoot, p.test) ??
      (existsSync(join(realRoot, p.test)) ? null : 'REFUSED (no test file)');
    if (refused) {
      done(refused);
      continue;
    }
    // A run that was not exactly this test file keeps nothing: no verdict from it, no titles.
    const exact = (r: TestReport) => r.kind !== 'report' || ranExactly(realRoot, p.test, r.files);
    // A run that left processes no signal could end stops everything after it.
    const childrenLeft = (r: TestReport): boolean => {
      if (r.kind !== 'children-left') return false;
      stopped = true;
      done('REFUSED (child processes left)', { leftover: r.leftover });
      return true;
    };
    if (!baselines.has(p.test)) baselines.set(p.test, await runTest(p.test));
    const baseline = baselines.get(p.test) as TestReport;
    if (childrenLeft(baseline)) continue;
    if (!exact(baseline)) {
      done('REFUSED (other test files)');
      continue;
    }
    const base = baselineVerdict(baseline, p.expectRed);
    if (base) {
      done(base);
      continue;
    }
    const path = join(realRoot, p.file);
    const text = existsSync(path) ? readFileSync(path, 'utf8') : '';
    const hits = occurrences(text, p.find);
    if (hits !== 1) {
      done(hits === 0 ? 'NOT PLANTED' : 'AMBIGUOUS');
      continue;
    }
    writeFileSync(
      path,
      text.replace(p.find, () => p.replace)
    );
    let report: TestReport = { kind: 'no-report' };
    const planted = git(realRoot, ['status', '--porcelain', '--', p.file]).trim() !== '';
    const restore = () => git(realRoot, ['checkout', '--', p.file]);
    const offAbort = onAbort(restore);
    try {
      if (planted) report = await runTest(p.test);
    } finally {
      offAbort();
      restore();
    }
    if (!clean(realRoot)) {
      stopped = true;
      done('DIRTY');
      continue;
    }
    if (!planted) {
      done('NOT PLANTED');
      continue;
    }
    if (childrenLeft(report)) continue;
    if (!exact(report)) {
      done('REFUSED (other test files)');
      continue;
    }
    const { verdict, errorClass } = judge(report, p.expectRed);
    done(verdict, { errorClass, failing: failingNames(report) });
  }
  return results;
}

/** What the reporter below writes: no message, stack, diff or value, only these fields. */
type PlantReportJson = {
  unhandled?: number;
  modules?: Array<{
    file?: unknown;
    errors?: number;
    tests?: Array<{
      fullName?: unknown;
      status?: unknown;
      errorName?: unknown;
      assertion?: unknown;
    }>;
  }>;
};

/**
 * Reduces the reporter's file to titles, states, error names and module paths. Anything else
 * in it is dropped. A module-level error, an unhandled error, or no module at all is a load
 * failure.
 */
export function parsePlantReport(json: PlantReportJson): TestReport {
  const modules = json.modules ?? [];
  let loadFailed = modules.length === 0 || (json.unhandled ?? 0) > 0;
  const tests: TestCase[] = [];
  const files: string[] = [];
  for (const m of modules) {
    if ((m.errors ?? 0) > 0) loadFailed = true;
    files.push(typeof m.file === 'string' ? m.file : '');
    for (const t of m.tests ?? []) {
      const errorClass = typeof t.errorName === 'string' ? t.errorName : undefined;
      tests.push({
        fullName: typeof t.fullName === 'string' ? t.fullName : '',
        status: typeof t.status === 'string' ? t.status : 'unknown',
        ...(errorClass ? { errorClass } : {}),
        ...(t.assertion === true ? { assertion: true } : {}),
      });
    }
  }
  return { kind: 'report', loadFailed, tests, files };
}

/**
 * A vitest reporter that writes only each module's path, and each row's full title, its state,
 * its first error's name and whether that error carries expected or actual, to `out`. The
 * error name is the thrown object's own name (AssertionError for a failed expect), never parsed
 * out of a message; the expected and actual values themselves are never written.
 */
const reporterSource = (out: string) => `import { writeFileSync } from 'node:fs';
export default class PlantReporter {
  onTestRunEnd(modules, unhandled) {
    const report = { unhandled: unhandled.length, modules: [] };
    for (const m of modules) {
      const tests = [];
      for (const t of m.children.allTests()) {
        const e = t.result().errors?.[0];
        const name = e?.name;
        const assertion = !!e && typeof e === 'object' && ('expected' in e || 'actual' in e);
        tests.push({ fullName: t.fullName, status: t.result().state, errorName: typeof name === 'string' ? name : null, assertion });
      }
      report.modules.push({ file: m.moduleId, errors: m.errors().length, tests });
    }
    writeFileSync(${JSON.stringify(out)}, JSON.stringify(report));
  }
}
`;

/** Only these reach the test process: no GITHUB_TOKEN, no secrets. HOME is the run's own temp dir. */
const ENV_ALLOW = ['PATH', 'TMPDIR', 'LANG', 'CI', 'NODE_OPTIONS'];

/** How one process group's run ended. */
export type GroupRun = {
  timedOut: boolean;
  /** Processes still in the group when its leader exited; each was then killed. */
  strays: number;
  /** Processes still in the group after TERM, KILL and up to 5 s of waiting. */
  leftover: number;
};

const pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

function signalGroup(pgid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pgid, signal);
  } catch {
    // the group is already gone
  }
}

/** True while any process is in group `pgid`. A permission error counts as alive. */
function groupAlive(pgid: number): boolean {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

/** The number of live processes in group `pgid`, by `ps -A` (the same on Linux and macOS). */
function groupSize(pgid: number): number {
  if (!groupAlive(pgid)) return 0;
  try {
    const rows = execFileSync('ps', ['-A', '-o', 'pid=,pgid='], { encoding: 'utf8' }).split('\n');
    return Math.max(1, rows.filter((l) => Number(l.trim().split(/\s+/)[1]) === pgid).length);
  } catch {
    return 1;
  }
}

async function groupGone(pgid: number, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (groupAlive(pgid)) {
    if (Date.now() >= end) return false;
    await pause(100);
  }
  return true;
}

/** TERM to the whole group; KILL if anything is left after 2 s; then up to 3 s more. */
async function killGroup(pgid: number): Promise<void> {
  signalGroup(pgid, 'SIGTERM');
  if (await groupGone(pgid, 2000)) return;
  signalGroup(pgid, 'SIGKILL');
  await groupGone(pgid, 3000);
}

/**
 * Runs `cmd` as the leader of a new process group and returns once that group is empty or
 * cannot be emptied. Past `timeoutMs` the group gets TERM, then KILL 2 s later.
 */
export async function runInGroup(
  cmd: string,
  args: string[],
  opts: { cwd: string; env: NodeJS.ProcessEnv },
  timeoutMs: number
): Promise<GroupRun> {
  const child = spawn(cmd, args, { ...opts, stdio: 'ignore', detached: true });
  const exited = new Promise<void>((done) => {
    child.once('exit', () => done());
    child.once('error', () => done());
  });
  const pgid = child.pid;
  if (pgid === undefined || pgid <= 1) {
    await exited;
    return { timedOut: false, strays: 0, leftover: 0 };
  }
  const offAbort = onAbort(() => signalGroup(pgid, 'SIGKILL'));
  let timedOut = false;
  let killLater: NodeJS.Timeout | undefined;
  const limit = setTimeout(() => {
    timedOut = true;
    signalGroup(pgid, 'SIGTERM');
    killLater = setTimeout(() => signalGroup(pgid, 'SIGKILL'), 2000);
  }, timeoutMs);
  try {
    await exited;
    clearTimeout(limit);
    clearTimeout(killLater);
    const strays = groupSize(pgid);
    if (strays > 0) await killGroup(pgid);
    return { timedOut, strays, leftover: groupSize(pgid) };
  } finally {
    offAbort();
  }
}

/** One run's report: a group that could not be emptied outranks a timeout, which outranks a report. */
export function reportFrom(run: GroupRun, out: string): TestReport {
  if (run.leftover > 0) return { kind: 'children-left', leftover: run.leftover };
  if (run.timedOut) return { kind: 'timeout' };
  if (!existsSync(out)) return { kind: 'no-report' };
  return parsePlantReport(JSON.parse(readFileSync(out, 'utf8')) as PlantReportJson);
}

/**
 * The real runner: one vitest process group per call, its output discarded, its report parsed.
 * The test is passed as an absolute path, which narrows vitest's filter but does not make it
 * exact (a longer path that starts with it, or one containing its relative form, still
 * matches), so runPlants refuses any run that was not exactly that file.
 */
export function vitestRunner(root: string, config: string, timeoutMs: number): RunTest {
  const realRoot = realpathSync(resolve(root));
  return async (testFile) => {
    const dir = mkdtempSync(join(tmpdir(), 'plants-'));
    const out = join(dir, 'report.json');
    const reporter = join(dir, 'reporter.mjs');
    writeFileSync(reporter, reporterSource(out));
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'test', HOME: dir };
    for (const k of ENV_ALLOW) if (process.env[k] !== undefined) env[k] = process.env[k];
    try {
      const bin = join(realRoot, 'node_modules/.bin/vitest');
      const args = [
        'run',
        '--config',
        config,
        resolve(realRoot, testFile),
        `--reporter=${reporter}`,
      ];
      return reportFrom(await runInGroup(bin, args, { cwd: realRoot, env }, timeoutMs), out);
    } catch {
      return { kind: 'no-report' };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

export function formatResults(results: Result[]): string {
  const cell = (s: string) => s.replace(/[|\n\r]/g, ' ');
  return ['| plant | verdict | failing tests | error class | secs |', '| - | - | - | - | - |']
    .concat(
      results.map(
        (r) =>
          `| ${cell(r.id)} | ${r.verdict} | ${cell(r.failing.join('; ')) || '-'} | ${r.errorClass ?? '-'} | ${r.secs.toFixed(1)} |`
      )
    )
    .join('\n');
}

async function main(argv = process.argv.slice(2), env = process.env): Promise<void> {
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(signal, () => {
      abortAll();
      process.exit(128 + constants.signals[signal]);
    });
  }
  let root = resolve('.');
  const manifests: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') root = resolve(argv[++i] ?? '.');
    else manifests.push(argv[i]);
  }
  let plants: Plant[] = [];
  for (const m of manifests) {
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(m, 'utf8'));
    } catch {
      // Node's parse error quotes the text around the fault; print the path only.
      console.error(`bad manifest ${m}: not readable JSON`);
      process.exit(2);
    }
    try {
      plants = plants.concat(parseManifest(json));
    } catch (e) {
      console.error(`bad manifest ${m}: ${(e as Error).message}`);
      process.exit(2);
    }
  }
  if (plants.length === 0) {
    console.error('no manifest given: nothing was planted');
    process.exit(2);
  }
  const timeoutMs = Number(env.PLANT_TIMEOUT_MS ?? 180_000);
  const results = await runPlants(
    plants,
    root,
    vitestRunner(root, env.PLANT_VITEST_CONFIG ?? 'vitest.config.unit.ts', timeoutMs)
  );
  const table = formatResults(results);
  console.log(table);
  if (env.GITHUB_STEP_SUMMARY)
    appendFileSync(env.GITHUB_STEP_SUMMARY, `### Planted bugs\n\n${table}\n`);
  process.exit(results.every((r) => r.verdict === 'RED') ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e: unknown) => {
    // The name only: a message can quote a path or source text.
    console.error(`run-plants failed: ${e instanceof Error ? e.name : 'unknown error'}`);
    process.exit(2);
  });
}

#!/usr/bin/env node
/**
 * Planted-bug checks: does each test a PR names actually catch the bug it claims to?
 * A plant breaks one spot in the code (a literal `find` that must occur exactly once,
 * replaced by `replace`) and names the test row that must then fail. The runner plants one
 * at a time, runs only that test file in its own vitest process, restores the file and
 * requires a clean tree before the next plant.
 *
 * A plant counts only as RED: its `expectRed` row (the full title, suites and test joined by
 * " > ", matched exactly) failed with an error whose name is AssertionError. A file that
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
 * symbolic link anywhere in the path, is refused. Tests run with an allowlisted environment
 * and a throwaway HOME, so no token and no file under the real HOME reaches them.
 *
 *   node --experimental-strip-types scripts/ci/plants/run-plants.ts --root <checkout> <manifest.json>...
 * PLANT_TIMEOUT_MS (default 180000) caps each vitest process; PLANT_VITEST_CONFIG (default
 * vitest.config.unit.ts) picks its config.
 * Manifest: {"plants": [{"id", "file", "find", "replace", "test", "expectRed"}]}.
 * Exit 0 when every plant is RED, 1 when any is not, 2 on a bad manifest.
 */
import { execFileSync, spawnSync } from 'child_process';
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
import { tmpdir } from 'os';
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
  | 'DIRTY'
  | 'SKIPPED';

/** One test row: its full title, its state, and the name of its first error. */
export type TestCase = { fullName: string; status: string; errorClass?: string };
/** One vitest run, reduced to what may be printed: titles, states, error names. */
export type TestReport =
  | { kind: 'report'; loadFailed: boolean; tests: TestCase[] }
  | { kind: 'timeout' }
  | { kind: 'no-report' };
export type RunTest = (testFile: string) => TestReport;
export type Result = {
  id: string;
  verdict: Verdict;
  failing: string[];
  errorClass?: string;
  secs: number;
};

/** The eight sealed-set exclusions every grep carries, plus held_out. Case-insensitive. */
const SEALED_NAME = /fixtures|heldout|held-out|held_out|blind|sealed|corpus/i;
const SEALED_DIR = /^scripts\/(crisis-eval|voice-eval)(\/|$)/i;

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
  if (report.kind === 'no-report' || report.loadFailed || report.tests.length === 0) {
    return { verdict: 'LOAD ERROR' };
  }
  const failed = report.tests.filter((t) => t.status === 'failed');
  if (failed.length === 0) return { verdict: 'GREEN' };
  const target = failed.find((t) => isRow(t, expectRed));
  if (!target) return { verdict: 'RED (other test)' };
  return target.errorClass === 'AssertionError'
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

/** Plants one at a time. Stops (the rest SKIPPED) the moment the tree is left dirty. */
export function runPlants(plants: Plant[], root: string, runTest: RunTest): Result[] {
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
    const refused = pathVerdict(realRoot, p.file) ?? pathVerdict(realRoot, p.test);
    if (refused) {
      done(refused);
      continue;
    }
    if (!baselines.has(p.test)) baselines.set(p.test, runTest(p.test));
    const base = baselineVerdict(baselines.get(p.test) as TestReport, p.expectRed);
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
    try {
      if (planted) report = runTest(p.test);
    } finally {
      git(realRoot, ['checkout', '--', p.file]);
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
    const { verdict, errorClass } = judge(report, p.expectRed);
    done(verdict, { errorClass, failing: failingNames(report) });
  }
  return results;
}

/** What the reporter below writes: no message, stack, diff or value, only these fields. */
type PlantReportJson = {
  unhandled?: number;
  modules?: Array<{
    errors?: number;
    tests?: Array<{ fullName?: unknown; status?: unknown; errorName?: unknown }>;
  }>;
};

/**
 * Reduces the reporter's file to titles, states and error names. Anything else in it is
 * dropped. A module-level error, an unhandled error, or no module at all is a load failure.
 */
export function parsePlantReport(json: PlantReportJson): TestReport {
  const modules = json.modules ?? [];
  let loadFailed = modules.length === 0 || (json.unhandled ?? 0) > 0;
  const tests: TestCase[] = [];
  for (const m of modules) {
    if ((m.errors ?? 0) > 0) loadFailed = true;
    for (const t of m.tests ?? []) {
      const errorClass = typeof t.errorName === 'string' ? t.errorName : undefined;
      tests.push({
        fullName: typeof t.fullName === 'string' ? t.fullName : '',
        status: typeof t.status === 'string' ? t.status : 'unknown',
        ...(errorClass ? { errorClass } : {}),
      });
    }
  }
  return { kind: 'report', loadFailed, tests };
}

/**
 * A vitest reporter that writes only each row's full title, its state and its first error's
 * name to `out`. The error name is the thrown object's own name (AssertionError for a failed
 * expect), never parsed out of a message.
 */
const reporterSource = (out: string) => `import { writeFileSync } from 'node:fs';
export default class PlantReporter {
  onTestRunEnd(modules, unhandled) {
    const report = { unhandled: unhandled.length, modules: [] };
    for (const m of modules) {
      const tests = [];
      for (const t of m.children.allTests()) {
        const name = t.result().errors?.[0]?.name;
        tests.push({ fullName: t.fullName, status: t.result().state, errorName: typeof name === 'string' ? name : null });
      }
      report.modules.push({ errors: m.errors().length, tests });
    }
    writeFileSync(${JSON.stringify(out)}, JSON.stringify(report));
  }
}
`;

/** Only these reach the test process: no GITHUB_TOKEN, no secrets. HOME is the run's own temp dir. */
const ENV_ALLOW = ['PATH', 'TMPDIR', 'LANG', 'CI', 'NODE_OPTIONS'];

/** The real runner: one vitest process per call, its output discarded, its report parsed. */
export function vitestRunner(root: string, config: string, timeoutMs: number): RunTest {
  return (testFile) => {
    const dir = mkdtempSync(join(tmpdir(), 'plants-'));
    const out = join(dir, 'report.json');
    const reporter = join(dir, 'reporter.mjs');
    writeFileSync(reporter, reporterSource(out));
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'test', HOME: dir };
    for (const k of ENV_ALLOW) if (process.env[k] !== undefined) env[k] = process.env[k];
    try {
      const bin = join(root, 'node_modules/.bin/vitest');
      const args = ['run', '--config', config, testFile, `--reporter=${reporter}`];
      const run = spawnSync(bin, args, {
        cwd: root,
        env,
        stdio: 'ignore',
        timeout: timeoutMs,
        killSignal: 'SIGKILL',
      });
      if (run.error && (run.error as NodeJS.ErrnoException).code === 'ETIMEDOUT')
        return { kind: 'timeout' };
      if (!existsSync(out)) return { kind: 'no-report' };
      return parsePlantReport(JSON.parse(readFileSync(out, 'utf8')) as PlantReportJson);
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

function main(argv = process.argv.slice(2), env = process.env): void {
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
  const results = runPlants(
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

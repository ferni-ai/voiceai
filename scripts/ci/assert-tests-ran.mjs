#!/usr/bin/env node
/**
 * Did a vitest run execute any tests? Reads the run's JSON report
 * (`--reporter=json --outputFile.json=<path>`) after the run step (ci.yml).
 *
 * vitest exits 0 on an empty selection when told to pass with no tests, and a sharded or
 * config-filtered run that silently selected nothing reads as green the same way: the
 * Integration Tests checks passed on pull requests in seconds having run nothing, and a
 * PR approved on "every check passed" then failed src/tests/deploy in the merge queue
 * (2026-11-17). This fails a run in which no test passed or failed (skips and todos do
 * not count as run), unless the step says why an empty run is expected.
 *
 *   node scripts/ci/assert-tests-ran.mjs <report.json>
 *   node scripts/ci/assert-tests-ran.mjs <report.json> --allow-empty "<why>"
 *   node scripts/ci/assert-tests-ran.mjs <report.json> --expect <path>...
 *
 * --allow-empty: an empty run passes, and the reason is printed as a ::notice:: so the
 *   green check says it ran nothing. Only for runs that narrow the suite to a change
 *   (`--changed`, `vitest related`), where selecting nothing is a real answer.
 * --expect: each repo-relative test file must appear in the report; a path ending in
 *   `/` must have at least one reported file under it. A config's include or exclude
 *   can drop a named file without a word, and the run stays green without it.
 *
 * A missing, unreadable or non-vitest report fails: no evidence is not a pass.
 * Exit: 0 tests ran (or an allowed empty run) | 1 failure | 2 usage
 */
import { readFileSync } from 'node:fs';
import { relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Tests that ran to a result. A skipped or todo test did not run. */
export function testsRan(report) {
  return (report.numPassedTests ?? 0) + (report.numFailedTests ?? 0);
}

/** The report's test files, repo-relative with forward slashes (vitest writes absolute paths). */
export function reportedFiles(report, root = process.cwd()) {
  return (report.testResults ?? []).map((file) => relative(root, file.name).split(sep).join('/'));
}

/** The expected paths no reported file satisfies (a trailing `/` matches anything under it). */
export function missingExpected(files, expected) {
  return expected.filter((path) =>
    path.endsWith('/') ? !files.some((file) => file.startsWith(path)) : !files.includes(path)
  );
}

/**
 * The verdict on one report: `errors` fail the step, `notices` are printed either way.
 * `allowEmpty` is the reason an empty run is expected (undefined: it is not).
 */
export function checkReport(report, { allowEmpty, expect = [], root = process.cwd() } = {}) {
  if (typeof report?.numTotalTests !== 'number' || !Array.isArray(report.testResults)) {
    return { ran: 0, errors: ['the file is not a vitest JSON report'], notices: [] };
  }
  const ran = testsRan(report);
  const errors = [];
  const notices = [];
  if (ran === 0 && allowEmpty === undefined) {
    errors.push(
      `no tests ran (${report.numTotalTests} collected, ${report.testResults.length} file(s)): a test step that runs nothing must fail, or say why with --allow-empty`
    );
  } else if (ran === 0) {
    notices.push(`No tests ran, as allowed: ${allowEmpty}`);
  }
  for (const path of missingExpected(reportedFiles(report, root), expect)) {
    errors.push(
      `${path} did not run: it is missing from the report (check the config's include and exclude)`
    );
  }
  return { ran, errors, notices };
}

/** `<report> [--allow-empty <why>] [--expect <path>...]`; throws on a malformed command line. */
export function parseArgs(argv) {
  const [report, ...rest] = argv;
  if (!report || report.startsWith('--')) throw new Error('the report path comes first');
  let allowEmpty;
  const expect = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--allow-empty') {
      allowEmpty = rest[++i]?.trim();
      if (!allowEmpty || allowEmpty.startsWith('--')) {
        throw new Error('--allow-empty needs the reason an empty run is expected');
      }
    } else if (rest[i] === '--expect') {
      while (i + 1 < rest.length && !rest[i + 1].startsWith('--')) expect.push(rest[++i]);
      if (expect.length === 0) throw new Error('--expect needs at least one path');
    } else {
      throw new Error(`unknown argument "${rest[i]}"`);
    }
  }
  return { report, allowEmpty, expect };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`::error::assert-tests-ran: ${error.message}`);
    console.error(
      'usage: assert-tests-ran.mjs <report.json> [--allow-empty "<why>"] [--expect <path>...]'
    );
    process.exit(2);
  }
  let report;
  try {
    report = JSON.parse(readFileSync(args.report, 'utf8'));
  } catch (error) {
    console.error(
      `::error::No readable vitest report at ${args.report} (${error.message}): the run step did not write one`
    );
    process.exit(1);
  }
  const { ran, errors, notices } = checkReport(report, args);
  for (const notice of notices) console.log(`::notice::${notice}`);
  for (const error of errors) console.error(`::error::${error}`);
  if (errors.length > 0) process.exit(1);
  console.log(`${ran} test(s) ran in ${report.testResults.length} file(s)`);
}

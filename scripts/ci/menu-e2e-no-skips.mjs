#!/usr/bin/env node
/**
 * The menu merge gate's no-skip guard (.github/workflows/menu-e2e.yml).
 *
 * Every menu contract test is `describe.skipIf(!emulator)`, and the signed-in
 * walk skips a test when a button isn't visible. Both runners exit 0 on a skip,
 * so a missing emulator or a panel that stopped rendering reads as green. This
 * reads the runner's JSON report and fails on anything but passing tests:
 * a skip, a todo, a failure, or a run with no tests at all. A Playwright test that
 * failed and then passed on its retry ("flaky") passes the gate but is reported as a
 * ::warning:: so the flake rate stays visible instead of being retried away.
 *
 *   node scripts/ci/menu-e2e-no-skips.mjs vitest results.json
 *   node scripts/ci/menu-e2e-no-skips.mjs playwright results.json
 *
 * Tests meant to skip are left out of the run by name (playwright.menu-e2e.config.ts),
 * never tolerated here.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Vitest `--reporter=json`: one entry per file, one assertion result per test. */
export function vitestProblems(report) {
  const problems = [];
  const files = report.testResults ?? [];
  if (files.length === 0 || !report.numTotalTests) problems.push('the run had no tests');
  for (const file of files) {
    const tests = file.assertionResults ?? [];
    if (tests.length === 0) problems.push(`${file.name}: no tests ran (${file.status})`);
    for (const t of tests) {
      if (t.status !== 'passed') problems.push(`${t.status}: ${file.name} > ${t.fullName}`);
    }
  }
  if (report.numPendingTests) problems.push(`${report.numPendingTests} skipped`);
  if (report.numTodoTests) problems.push(`${report.numTodoTests} todo`);
  if (report.numFailedTests) problems.push(`${report.numFailedTests} failed`);
  return problems;
}

/** Walk a Playwright `json` report: every test (one per project per spec) with its status. */
function playwrightTests(report) {
  const tests = [];
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) tests.push({ ...t, file: spec.file, title: spec.title });
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of report.suites ?? []) walk(suite);
  return tests;
}

/** Playwright `json` reporter: suites nest; each spec has one test per project. */
export function playwrightProblems(report) {
  const problems = [];
  const tests = playwrightTests(report);
  for (const t of tests) {
    // "flaky" = failed, then passed on retry: not a problem for the gate, see playwrightFlaky
    if (t.status !== 'expected' && t.status !== 'flaky') {
      problems.push(`${t.status}: [${t.projectName}] ${t.file} > ${t.title}`);
    }
  }
  if (tests.length === 0) problems.push('the run had no tests');
  for (const error of report.errors ?? []) problems.push(`error: ${error.message ?? error}`);
  return problems;
}

/** Tests that only passed on a retry. Reported, never silently absorbed. */
export function playwrightFlaky(report) {
  return playwrightTests(report)
    .filter((t) => t.status === 'flaky')
    .map((t) => `[${t.projectName}] ${t.file} > ${t.title}`);
}

export function verdict(kind, report) {
  if (kind === 'vitest') return vitestProblems(report);
  if (kind === 'playwright') return playwrightProblems(report);
  throw new Error(`unknown report kind "${kind}" (vitest or playwright)`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [kind, file] = process.argv.slice(2);
  let report;
  try {
    report = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`::error::No readable ${kind} report at ${file}: ${error.message}`);
    process.exit(1);
  }
  const problems = verdict(kind, report);
  if (kind === 'playwright') {
    for (const flaky of playwrightFlaky(report)) {
      console.warn(`::warning::Flaky (passed only on retry): ${flaky}`);
    }
  }
  if (problems.length > 0) {
    console.error(
      `::error::The menu gate needs every test to run and pass (${problems.length} problem(s))`
    );
    for (const p of problems) console.error(`  ${p}`);
    console.error(
      'A test that should not run here is left out by name in playwright.menu-e2e.config.ts.'
    );
    process.exit(1);
  }
  console.log(`${kind}: every test ran and passed`);
}

#!/usr/bin/env npx tsx
/**
 * Lint-coverage ratchet: ESLint errors per file, across every production file.
 *
 * `pnpm lint` only reads src/*\/*.ts (one level deep), src/api and src/servers, so
 * about 3,800 production files were never linted, and apps/cli/src/commands/deploy
 * was ignored entirely. Those files have errors today (544), so a plain lint gate
 * would fail on day one. This ratchet holds each file to its baseline error count:
 * a file's errors may not grow, and a new file must lint with zero errors.
 * Warnings are reported, not gated.
 *
 * usage:
 *   npx tsx apps/cli/src/commands/quality/lint-coverage-ratchet.ts            check (CI)
 *   npx tsx apps/cli/src/commands/quality/lint-coverage-ratchet.ts --update   lower the baseline to today
 *   npx tsx apps/cli/src/commands/quality/lint-coverage-ratchet.ts --init     write a fresh baseline
 *
 * Runs ESLint over the whole set (about 3 minutes cold; a warm `--cache` run is faster).
 *
 * @module quality/lint-coverage-ratchet
 */
import { spawnSync } from 'child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = process.cwd();
const BASELINE = join(dirname(fileURLToPath(import.meta.url)), 'lint-coverage-baseline.json');
/** Production trees linted by this ratchet (`pnpm lint` covers only part of src/). */
const ROOTS = ['src', 'apps/cli/src/commands/deploy'];
const TEST = /(__tests__|__mocks__|\.(test|spec)\.tsx?$|(^|\/)(tests|e2e)\/)/;

export interface EslintFile {
  filePath: string;
  errorCount: number;
  warningCount: number;
  messages: Array<{ message: string }>;
}

/** Relative path → error count, for files with errors only. */
export type ErrorBaseline = Record<string, number>;

/** ESLint reports a file it skipped as a warning with this message; the file was never checked. */
const IGNORED = 'File ignored because of a matching ignore pattern';

/** Files ESLint skipped. A skipped file reads as clean, so it must fail the ratchet. */
export function ignoredFiles(results: EslintFile[]): string[] {
  return results.filter((file) => file.messages.some((m) => m.message.startsWith(IGNORED))).map((file) => file.filePath);
}

export function regressions(base: ErrorBaseline, now: ErrorBaseline): string[] {
  return Object.keys(now)
    .filter((file) => now[file]! > (base[file] ?? 0))
    .map((file) => {
      const before = base[file] ?? 0;
      const hint = `run \`npx eslint ${file}\` and fix them`;
      return before === 0
        ? `${file}: ${now[file]} lint errors (new file or newly failing). Lint must pass with zero errors; ${hint}.`
        : `${file}: errors grew ${before} → ${now[file]}. Fix the new errors; ${hint}.`;
    });
}

/** ESLint's stderr line when eslint-suppressions.json suppresses something that no longer occurs. */
const STALE = 'There are suppressions left that do not occur anymore';

/**
 * Suppressions nothing needs any more. Left in place, a file's next new violation slips in under
 * the old count, so the suppression baseline (eslint-suppressions.json) would never shrink.
 */
export function staleSuppressions(stderr: string): string[] {
  return stderr.includes(STALE)
    ? ['eslint-suppressions.json suppresses violations that are gone: run `npx eslint --prune-suppressions <the files you fixed>` and commit it.']
    : [];
}

/** The baseline with every file lowered to today's count (never raised). */
export function lowered(base: ErrorBaseline, now: ErrorBaseline): ErrorBaseline {
  return Object.fromEntries(
    Object.entries(now)
      .filter(([file]) => file in base)
      .map(([file, count]) => [file, Math.min(count, base[file]!)] as const)
      .filter(([, count]) => count > 0)
  );
}

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (name === 'node_modules' || name === 'dist') continue;
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(name) && !name.endsWith('.d.ts')) out.push(relative(ROOT, path));
  }
  return out;
}

function productionFiles(): string[] {
  return ROOTS.flatMap((root) => walk(join(ROOT, root), [])).filter((file) => !TEST.test(file));
}

/** Runs ESLint over every production file and returns per-file results plus its stderr. */
function lint(files: string[]): { results: EslintFile[]; stderr: string } {
  // Run ESLint's binary directly, not through `npx`: npx joins the paths into one shell
  // argument (about 214 KB), which Linux rejects (E2BIG). Spawned directly, each path is its own argument.
  const cache = join(ROOT, 'node_modules/.cache/eslint-coverage');
  const eslint = join(ROOT, 'node_modules/eslint/bin/eslint.js');
  const run = spawnSync(
    process.execPath,
    [eslint, '--cache', '--cache-location', cache, '--format', 'json', ...files],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' } }
  );
  // ESLint exits 1 when it finds errors; that is the data we want, so only a missing stdout is fatal.
  if (!run.stdout) {
    throw new Error(`eslint produced no output (status ${run.status}, signal ${run.signal}): ${run.error?.message ?? run.stderr}`);
  }
  return { results: JSON.parse(run.stdout) as EslintFile[], stderr: run.stderr ?? '' };
}

function measure(): { errors: ErrorBaseline; warnings: number; ignored: string[]; stale: string[] } {
  const { results, stderr } = lint(productionFiles());
  const errors: ErrorBaseline = {};
  let warnings = 0;
  for (const file of results) {
    warnings += file.warningCount;
    if (file.errorCount > 0) errors[relative(ROOT, file.filePath)] = file.errorCount;
  }
  return { errors, warnings, ignored: ignoredFiles(results).map((file) => relative(ROOT, file)), stale: staleSuppressions(stderr) };
}

function main(): void {
  const args = process.argv.slice(2);
  const { errors, warnings, ignored, stale } = measure();
  const total = Object.values(errors).reduce((sum, n) => sum + n, 0);
  const baseline: ErrorBaseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};

  if (args.includes('--init') || args.includes('--update')) {
    const next = args.includes('--init') ? errors : lowered(baseline, errors);
    writeFileSync(BASELINE, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`Wrote ${Object.keys(next).length} files, ${Object.values(next).reduce((s, n) => s + n, 0)} errors to the lint-coverage baseline.`);
    return;
  }

  const problems = [
    ...ignored.map((file) => `${file}: eslint skipped this file (matched an ignore pattern), so it is not checked. Remove the ignore or move the file.`),
    ...regressions(baseline, errors),
    ...stale,
  ];
  console.log(`Lint coverage: ${Object.keys(errors).length} files with ${total} errors (baseline ${Object.values(baseline).reduce((s, n) => s + n, 0)}), ${warnings} warnings (not gated).`);
  if (problems.length > 0) {
    console.error(`\n❌ ${problems.length} lint regression(s):`);
    problems.forEach((p) => console.error(`  - ${p}`));
    process.exit(1);
  }
  const improved = JSON.stringify(lowered(baseline, errors)) !== JSON.stringify(baseline);
  console.log(improved ? '\n✅ No regressions, and things improved: run with --update to lock it in.' : '\n✅ No regressions.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

#!/usr/bin/env npx tsx
/**
 * Lint for the test files a change touches.
 *
 * The lint-coverage ratchet reads production files only, and `pnpm lint` reaches one folder
 * deep, so about 3,400 test files were linted by nothing in CI. Linting all of them needs a
 * second baseline of old errors and a second full ESLint run in a job that has run out of heap
 * before. This gate reads only the test files a change adds, edits or moves, at the head and at
 * the base the change is measured from (merge-base.ts), and fails on what the change adds: a
 * file's errors may not grow, and a new test file must lint with zero errors. Warnings are
 * reported, not gated. An old test file that no change touches is never read.
 *
 * usage:
 *   npx tsx apps/cli/src/commands/quality/lint-changed-tests.ts
 *
 * @module quality/lint-changed-tests
 */
import { relative } from 'path';
import { pathToFileURL } from 'url';
import { ESLint } from 'eslint';
import {
  ROOTS,
  isTestFile,
  regressions,
  type ErrorBaseline,
  type EslintFile,
} from './lint-coverage-ratchet.js';
import {
  basePathOf,
  diffAgainstBase,
  readAtBase,
  resolveBase,
  type BaseDiff,
} from './merge-base.js';

/** The two ways this gate asks ESLint a question. A seam, so a test can answer in its place. */
export interface Linter {
  /** The files as they are on disk. */
  files(paths: string[]): Promise<EslintFile[]>;
  /** `text` linted as the file at `path`: the rules that apply to that path, on another text. */
  text(text: string, path: string): Promise<EslintFile[]>;
}

/** The test files a change adds, edits or moves, under the trees the ratchet covers. */
export function changedTestFiles(diff: BaseDiff): string[] {
  return diff.changed.filter(
    (file) => /\.tsx?$/.test(file) && !file.endsWith('.d.ts') && isTestFile(file)
  );
}

/** Relative path → error count, for files with errors only. */
function errorCounts(root: string, results: EslintFile[]): ErrorBaseline {
  return Object.fromEntries(
    results
      .filter((file) => file.errorCount > 0)
      .map((file) => [relative(root, file.filePath), file.errorCount] as const)
  );
}

/** How each of ESLint's "not linted" answers starts: an ignore pattern, or no configuration for the file. */
const NOT_LINTED = 'File ignored';

/** One problem line per file ESLint did not lint: a file that is not linted reads as clean. */
function notLinted(root: string, results: EslintFile[]): string[] {
  return results.flatMap((file) => {
    const why = file.messages.find((message) => message.message.startsWith(NOT_LINTED));
    return why
      ? [`${relative(root, file.filePath)}: eslint skipped this file (${why.message}), so it is not checked.`] // prettier-ignore
      : [];
  });
}

export interface ChangedTestLint {
  files: string[];
  /** One line per problem; empty when the change adds no lint error to a test file. */
  problems: string[];
  warnings: number;
}

/**
 * Lints `files` at the head and their texts at the base. A file that is new in the change has
 * no base text, so its base count is 0 and any error fails it.
 */
export async function lintChangedTests(
  diff: BaseDiff,
  linter: Linter,
  root = process.cwd(),
  baseTexts: (base: string, paths: string[]) => Map<string, string> = (base, paths) =>
    readAtBase(base, paths, root)
): Promise<ChangedTestLint> {
  const files = changedTestFiles(diff);
  if (files.length === 0) return { files, problems: [], warnings: 0 };

  const head = await linter.files(files);
  const basePaths = new Map(
    files.flatMap((file) => {
      const basePath = basePathOf(diff, file);
      return basePath ? [[file, basePath] as const] : [];
    })
  );
  const texts = baseTexts(diff.base, [...basePaths.values()]);
  const base: EslintFile[] = [];
  for (const [file, basePath] of basePaths) {
    const text = texts.get(basePath);
    if (text !== undefined) base.push(...(await linter.text(text, file)));
  }

  return {
    files,
    problems: [
      ...notLinted(root, head),
      ...regressions(errorCounts(root, base), errorCounts(root, head)),
    ],
    warnings: head.reduce((sum, file) => sum + file.warningCount, 0),
  };
}

/**
 * ESLint itself, in this process: one config load for the head files and the base texts.
 *
 * Never as a "single run". In CI the TypeScript parser builds each project's program once and
 * sends the second parse of a path to a program of that one file, with no imports and no lib
 * (its fallback for a fix cycle). A base text is that second parse: its type-aware rules would
 * see no types, so an old floating promise would read as new, and an `await` the base got
 * right would read as an old error and hide a new one. Outside a single run both parses go
 * through the watch program, which takes the text it is handed. One thread, so that order holds.
 */
export function eslintLinter(root = process.cwd()): Linter {
  process.env.TSESTREE_SINGLE_RUN = 'false';
  const eslint = new ESLint({ cwd: root, concurrency: 'off' });
  return {
    files: (paths) => eslint.lintFiles(paths),
    text: (text, path) => eslint.lintText(text, { filePath: path, warnIgnored: true }),
  };
}

/** Prints the result and returns the exit code: 1 when the change adds a lint error to a test file. */
export function report({ files, problems, warnings }: ChangedTestLint, base: string): number {
  console.log(
    `Changed test files: ${files.length} linted against base ${base.slice(0, 10)}, ${warnings} warnings (not gated).`
  );
  if (problems.length === 0) {
    console.log('\n✅ The change adds no lint error to a test file.');
    return 0;
  }
  console.error(`\n❌ ${problems.length} lint regression(s) in test files:`);
  problems.forEach((problem) => console.error(`  - ${problem}`));
  return 1;
}

async function main(root = process.cwd()): Promise<number> {
  const diff = diffAgainstBase(resolveBase(root), ROOTS, root);
  return report(await lintChangedTests(diff, eslintLinter(root), root), diff.base);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(error);
      process.exit(2);
    }
  );
}

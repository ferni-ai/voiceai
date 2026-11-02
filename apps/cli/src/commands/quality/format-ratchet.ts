#!/usr/bin/env npx tsx
/**
 * Format ratchet: the src files prettier would reformat may only get fewer.
 *
 * `pnpm format:check` fails on hundreds of files that were never formatted, so no workflow
 * ran it and formatting was gated nowhere. Failing every changed file that isn't formatted
 * would push whole-file reformats into unrelated PRs. Instead, the files unformatted on
 * 2026-11-02 sit in a baseline list that may only shrink:
 *   - a file not in the list that prettier would reformat (new, or formatted until now)
 *     fails, and the error names it;
 *   - a listed file that is now formatted (or gone) fails until the list is lowered with
 *     --update, so it can't come unformatted again unseen.
 * The baseline is a file list, not a count, so a PR that formats one file and unformats
 * another still fails. A file prettier can't parse counts as unformatted: it can't be checked.
 *
 * Same files as `pnpm format:check`: the glob below, minus .gitignore and .prettierignore.
 *
 * usage:
 *   pnpm quality:format              check (CI: Lint & Type Check)
 *   pnpm quality:format --update     drop now-formatted files from the baseline
 *   pnpm quality:format --init       write a fresh baseline
 *
 * @module quality/format-ratchet
 */
import { spawnSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const BASELINE = join(dirname(fileURLToPath(import.meta.url)), 'format-baseline.generated.json');
export const GLOB = 'src/**/*.{ts,tsx,json}';

export interface PrettierRun {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** `[error] src/x.json: SyntaxError: …`, one per file prettier couldn't parse. */
const PARSE_ERROR = /^\[error\] (\S+\.(?:ts|tsx|json)): /;

/**
 * Files `prettier --list-different` reports, plus files it couldn't parse.
 * Throws on anything else, so a broken run never reads as "nothing unformatted".
 */
export function unformattedFiles(run: PrettierRun): { files: string[]; unparsable: string[] } {
  const listed = run.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const unparsable = run.stderr
    .split('\n')
    .map((l) => PARSE_ERROR.exec(l)?.[1])
    .filter((f): f is string => f !== undefined);
  // 0: all formatted; 1: some aren't; 2: some files errored (or none matched, or bad config).
  const ok =
    (run.status === 0 && listed.length === 0) ||
    (run.status === 1 && listed.length > 0) ||
    (run.status === 2 && unparsable.length > 0);
  if (!ok) {
    throw new Error(
      `prettier exited ${run.status} with ${listed.length} listed and ${unparsable.length} unparsable file(s):\n${run.stderr.trim()}`
    );
  }
  return { files: [...new Set([...listed, ...unparsable])].sort(), unparsable: unparsable.sort() };
}

/** Files unformatted now that the baseline doesn't list, and listed files now formatted or gone. */
export function compareFormat(base: string[], now: string[]): { added: string[]; fixed: string[] } {
  const allowed = new Set(base);
  const current = new Set(now);
  return {
    added: now.filter((f) => !allowed.has(f)).sort(),
    fixed: base.filter((f) => !current.has(f)).sort(),
  };
}

/** `prettier --list-different GLOB` in `root`. */
export function prettier(
  root: string,
  bin = join(root, 'node_modules', '.bin', 'prettier')
): PrettierRun {
  if (!existsSync(bin)) throw new Error(`no prettier at ${bin}; run pnpm install`);
  const r = spawnSync(bin, ['--list-different', GLOB], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1 << 26,
  });
  if (r.error) throw r.error;
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** Check (or, with --init / --update, rewrite) the baseline for the repo at `root`. Returns the exit code. */
export function run(
  root: string,
  baseline: string,
  args: string[],
  log: (line: string) => void = console.log,
  check: (root: string) => PrettierRun = prettier
): number {
  const { files: now, unparsable } = unformattedFiles(check(root));
  const write = (files: string[]): void =>
    writeFileSync(baseline, `${JSON.stringify(files, null, 2)}\n`);
  if (args.includes('--init')) {
    write(now);
    log(`Wrote ${now.length} unformatted file(s) to the baseline.`);
    return 0;
  }
  if (!existsSync(baseline)) {
    log(`❌ No baseline at ${baseline}; run \`pnpm quality:format --init\`.`);
    return 1;
  }
  const base: string[] = JSON.parse(readFileSync(baseline, 'utf8'));
  const { added, fixed } = compareFormat(base, now);
  const update = args.includes('--update');
  if (update) write(base.filter((f) => !fixed.includes(f)));
  if (added.length > 0) {
    log(`❌ ${added.length} file(s) prettier would reformat that weren't unformatted before:`);
    const bad = new Set(unparsable);
    for (const f of added.slice(0, 80))
      log(`  ${f}${bad.has(f) ? '  (prettier cannot parse it)' : ''}`);
    if (added.length > 80) log(`  … and ${added.length - 80} more`);
    log('Run `npx prettier --write <file>` on each (only these files; no repo-wide reformat).');
    return 1;
  }
  if (fixed.length > 0 && !update) {
    log(`❌ ${fixed.length} file(s) in the baseline are formatted now (or gone):`);
    for (const f of fixed.slice(0, 20)) log(`  ${f}`);
    if (fixed.length > 20) log(`  … and ${fixed.length - 20} more`);
    log(
      `Lower the baseline to ${now.length}: run \`pnpm quality:format --update\` and commit the baseline.`
    );
    return 1;
  }
  const note = fixed.length > 0 ? ` Removed ${fixed.length} now-formatted file(s).` : '';
  log(`✅ No newly unformatted files (${now.length} known, baseline only shrinks).${note}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  }).stdout.trim();
  process.exit(run(root, BASELINE, process.argv.slice(2)));
}

#!/usr/bin/env npx tsx
/**
 * Mock-path guard: every relative vi.mock / vi.doMock / vi.unmock / vi.importActual /
 * vi.importMock string in a test file must name a module that exists.
 *
 * A stale mock string fails silently: vitest mocks a path nobody imports, the real module
 * loads, and the test still passes (or passes for the wrong reason). Moving a folder makes
 * hundreds of them stale at once, and no type check sees them (scripts/codemods/move-module.ts
 * rewrites them; this is the net under it). Strings already stale on 2026-10-31 sit in the
 * baseline, which may only shrink: a new stale string fails, and so does a baseline entry
 * that is fixed but still listed (run --update), so a fixed string cannot go stale again
 * unnoticed.
 *
 * A file .gitignore names literally as *.generated.* (pnpm gen:lists writes them at install)
 * counts as present even when it is not on disk: CI skips install on a node_modules cache
 * hit, and a fresh clone has not run it yet.
 *
 * usage:
 *   pnpm quality:mock-paths              check (CI, next to the architecture gate; pre-push)
 *   pnpm quality:mock-paths --update     drop fixed entries from the baseline
 *   pnpm quality:mock-paths --init       write a fresh baseline
 *
 * @module quality/mock-paths
 */
import { execFileSync } from 'child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { CODE_FILE, findSites, resolveModule } from './module-specifiers.js';

const BASELINE = join(
  dirname(fileURLToPath(import.meta.url)),
  'mock-paths-baseline.generated.json'
);
export const TEST_FILE = /(^|\/)(__tests__|__mocks__|tests?|e2e)\/|\.(test|spec)\.[cm]?[jt]sx?$/;
const MOCK_CALL = /\b(?:vi|vitest)\.(?:mock|doMock|unmock|doUnmock|importActual|importMock)\b/;

/** test file → its relative mock strings that resolve to nothing */
export type StaleMocks = Record<string, string[]>;

export function staleMocks(
  files: string[],
  read: (file: string) => string,
  isFile: (file: string) => boolean
): StaleMocks {
  const stale: StaleMocks = {};
  for (const file of files) {
    if (!CODE_FILE.test(file) || !TEST_FILE.test(file)) continue;
    const text = read(file);
    if (!MOCK_CALL.test(text)) continue;
    const bad = findSites(file, text)
      .filter(
        (s) => s.kind === 'mock' && s.spec.startsWith('.') && !resolveModule(file, s.spec, isFile)
      )
      .map((s) => s.spec);
    if (bad.length > 0) stale[file] = [...new Set(bad)].sort();
  }
  return stale;
}

/** Entries in `now` that the baseline doesn't allow, and baseline entries now fixed. */
export function compareMocks(
  base: StaleMocks,
  now: StaleMocks
): { added: string[]; fixed: number } {
  const key = (file: string, spec: string): string => `${file}: ${spec}`;
  const allowed = new Set(
    Object.entries(base).flatMap(([f, specs]) => specs.map((s) => key(f, s)))
  );
  const current = new Set(Object.entries(now).flatMap(([f, specs]) => specs.map((s) => key(f, s))));
  return {
    added: [...current].filter((k) => !allowed.has(k)).sort(),
    fixed: [...allowed].filter((k) => !current.has(k)).length,
  };
}

/** The baseline with fixed entries removed (never adds). */
export function lowered(base: StaleMocks, now: StaleMocks): StaleMocks {
  const out: StaleMocks = {};
  for (const [file, specs] of Object.entries(base)) {
    const kept = specs.filter((s) => now[file]?.includes(s));
    if (kept.length > 0) out[file] = kept;
  }
  return out;
}

/**
 * Repo paths that `gitignore` (the root .gitignore's text) names literally as *.generated.*
 * code files. Globs and slash-free names are skipped: they would hide real stale strings.
 */
export function generatedPaths(gitignore: string): Set<string> {
  const out = new Set<string>();
  for (const raw of gitignore.split('\n')) {
    const line = raw.trim().replace(/^\//, '');
    if (line.startsWith('#') || line.startsWith('!') || /[*?[\]\\]/.test(line)) continue;
    if (line.includes('/') && /\.generated\.[cm]?[jt]sx?$/.test(line)) out.add(line);
  }
  return out;
}

const count = (m: StaleMocks): number => Object.values(m).reduce((n, specs) => n + specs.length, 0);

/** Check (or, with --init / --update, rewrite) the baseline for the repo at `root`. Returns the exit code. */
export function run(
  root: string,
  baseline: string,
  args: string[],
  log: (line: string) => void = console.log
): number {
  const files = execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  })
    .split('\0')
    .filter(Boolean);
  const tracked = new Set(files);
  const onDisk = (f: string): boolean =>
    existsSync(join(root, f)) && statSync(join(root, f)).isFile();
  const ignore = join(root, '.gitignore');
  const generated = generatedPaths(existsSync(ignore) ? readFileSync(ignore, 'utf8') : '');
  const isFile = (f: string): boolean => tracked.has(f) || generated.has(f) || onDisk(f);
  const now = staleMocks(
    files,
    (f) => (onDisk(f) ? readFileSync(join(root, f), 'utf8') : ''),
    isFile
  );
  const write = (m: StaleMocks): void => writeFileSync(baseline, `${JSON.stringify(m, null, 2)}\n`);
  if (args.includes('--init')) {
    write(now);
    log(
      `Wrote ${count(now)} stale mock string(s) in ${Object.keys(now).length} file(s) to the baseline.`
    );
    return 0;
  }
  const base: StaleMocks = existsSync(baseline) ? JSON.parse(readFileSync(baseline, 'utf8')) : {};
  const { added, fixed } = compareMocks(base, now);
  const update = args.includes('--update');
  if (update) write(lowered(base, now));
  if (added.length > 0) {
    log(
      `❌ ${added.length} vi.mock-family string(s) name no module (the real module loads instead):`
    );
    for (const k of added.slice(0, 80)) log(`  ${k}`);
    if (added.length > 80) log(`  … and ${added.length - 80} more`);
    log('Point each at the module the test means to mock (relative to the test file, .js suffix).');
    return 1;
  }
  const entries = `${fixed} baseline entr${fixed === 1 ? 'y' : 'ies'}`;
  if (fixed > 0 && !update) {
    log(`❌ ${entries} no longer stale but still in the baseline, so could go stale again unseen.`);
    log('Run `pnpm quality:mock-paths --update` and commit the lowered baseline.');
    return 1;
  }
  const note = fixed > 0 ? ` ${entries} fixed and removed.` : '';
  log(`✅ No new stale mock paths (${count(now)} known stale, baseline only shrinks).${note}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  process.exit(run(root, BASELINE, process.argv.slice(2)));
}

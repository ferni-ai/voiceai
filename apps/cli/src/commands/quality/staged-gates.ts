#!/usr/bin/env npx tsx
/**
 * Pre-commit: the architecture gate and the size ratchet, run on what is being committed.
 *
 * Both ran only at pre-push, after a slow commit hook had passed, so a context-internal
 * import or a file growing past 500 lines cost a re-commit, and once a replacement PR
 * (2026-10-24). The full gates read the working tree, which at commit time holds unstaged
 * edits that aren't being committed. This reads the STAGED files from the index instead
 * (`git cat-file :path`), so an unstaged edit can't fail or pass a commit, and judges only
 * them, which keeps it to about a second:
 *
 * - size (size-diff.ts): each source file the branch and this commit touch, staged
 *   version against merge-base version, as ratchet.ts does with the working tree;
 * - architecture: each staged src/ file's imports against the baseline, resolved against
 *   the index. Rules need only one edge, except cycles, which need the whole graph: a
 *   cycle through files that aren't staged is left to pre-push and CI.
 *
 * Not here (pre-push and CI run them): the brand-copy, brand-lint and theme-debt parts of
 * ratchet.ts, and the kernel-duplicate rule.
 *
 * usage: npx tsx apps/cli/src/commands/quality/staged-gates.ts
 *
 * @module quality/staged-gates
 */
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { pathToFileURL } from 'url';
import {
  BASELINE,
  check,
  compare,
  importsOf,
  type Baseline,
  type Edge,
  type VendorImport,
} from './architecture-gate.js';
import { basePathOf, readAtBase, resolveBase, type BaseDiff } from './merge-base.js';
import { sizeRegressions, type FileChange, type Removed } from './size-diff.js';

/** The ratchet's size roots and source filter (ratchet.ts). */
const SIZE_ROOTS = ['src', 'apps/web/src', 'apps/cli/src'];
const BASELINE_PATH = 'apps/cli/src/commands/quality/architecture-baseline.generated.json';
const isSource = (p: string): boolean =>
  /\.(ts|tsx)$/.test(p) &&
  !/\.d\.ts$/.test(p) &&
  !/\.(test|spec)\.tsx?$/.test(p) &&
  !/\.generated\./.test(p) &&
  !/\/__tests__\//.test(p);
/** architecture-gate.ts: production files under src/. */
const isArchSource = (p: string): boolean =>
  p.startsWith('src/') &&
  /\.tsx?$/.test(p) &&
  !p.endsWith('.d.ts') &&
  !/(__tests__|__mocks__|\.(test|spec)\.tsx?$|^src\/(tests|e2e)\/)/.test(p);

function git(root: string, args: string[]): string {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr.trim()}`);
  return r.stdout;
}

/** Files that differ between `base` and the index (not the working tree), with renames. */
export function stagedDiff(root: string, base: string, pathspecs: string[]): BaseDiff {
  const diff: BaseDiff = {
    base,
    renamedFrom: new Map(),
    added: new Set(),
    changed: [],
    deleted: [],
  };
  const text = git(root, [
    '-c',
    'diff.renameLimit=0',
    'diff',
    '--cached',
    '--no-color',
    '--name-status',
    '-M',
    base,
    '--',
    ...pathspecs,
  ]);
  for (const line of text.split('\n').filter(Boolean)) {
    const [status = '', a = '', b] = line.split('\t');
    if (status.startsWith('R') && b) {
      diff.renamedFrom.set(b, a);
      diff.changed.push(b);
    } else if (status === 'D') diff.deleted.push(a);
    else {
      if (status === 'A') diff.added.add(a);
      diff.changed.push(a);
    }
  }
  diff.changed.sort();
  return diff;
}

/** Paths staged in this commit (index vs HEAD), added, modified or renamed. */
export function stagedPaths(root: string): string[] {
  return git(root, ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-M'])
    .split('\n')
    .filter(Boolean);
}

/**
 * Size regressions in the index against the merge base: every source file the branch plus
 * this commit touches, as pre-push will see it (the whole roots, so git can pair a move).
 */
export function stagedSize(
  root: string,
  base = resolveBase(root)
): { base: string; checked: number; problems: string[] } {
  const diff = stagedDiff(root, base, SIZE_ROOTS);
  const changed = diff.changed.filter(isSource);
  const deleted = diff.deleted.filter(isSource);
  const head = readAtBase('', changed, root); // ":path" is the staged blob
  const basePaths = changed.map((p) => basePathOf(diff, p)).filter((p): p is string => p !== null);
  const old = readAtBase(base, [...basePaths, ...deleted], root);
  const changes: FileChange[] = changed.map((path) => {
    const was = basePathOf(diff, path);
    return { path, head: head.get(path) ?? '', base: was === null ? null : (old.get(was) ?? null) };
  });
  const removed: Removed[] = deleted.flatMap((path) =>
    old.has(path) ? [{ path, base: old.get(path)! }] : []
  );
  return { base, checked: changes.length, problems: sizeRegressions(changes, removed) };
}

/** New architecture violations in the staged src/ files' imports. */
export function stagedArchitecture(
  root: string,
  staged: string[]
): { checked: number; problems: string[] } {
  const files = staged.filter(isArchSource);
  if (files.length === 0) return { checked: 0, problems: [] };
  const inIndex = new Set(git(root, ['ls-files', '--', 'src']).split('\n').filter(Boolean));
  const texts = readAtBase('', files, root);
  const edges: Edge[] = [];
  const vendor: VendorImport[] = [];
  for (const from of files) {
    const found = importsOf(from, texts.get(from) ?? '', (p) => inIndex.has(p));
    edges.push(...found.edges);
    vendor.push(...found.vendor);
  }
  const indexed = readAtBase('', [BASELINE_PATH], root).get(BASELINE_PATH);
  const baseline = JSON.parse(indexed ?? readFileSync(BASELINE, 'utf8')) as Baseline;
  const { added } = compare(baseline, check({ edges, vendor }));
  return {
    checked: files.length,
    problems: added.map((v) => `${v.rule}  ${v.from}:${v.line} -> ${v.to}`),
  };
}

function main(): void {
  const say = (text: string): boolean => process.stdout.write(`${text}\n`);
  const root = git(process.cwd(), ['rev-parse', '--show-toplevel']).trim();
  const started = Date.now();
  const staged = stagedPaths(root);
  const size = stagedSize(root);
  const arch = stagedArchitecture(root, staged);
  say(
    `  Checked the staged (index) content: size of ${size.checked} touched file(s) against base ${size.base.slice(0, 9)}, ` +
      `imports of ${arch.checked} staged src/ file(s) (${Date.now() - started} ms).`
  );
  if (size.problems.length > 0)
    say(
      `\n  ❌ quality ratchet regressed (size):\n${size.problems.map((p) => `    - ${p}`).join('\n')}`
    );
  if (arch.problems.length > 0) {
    say(
      `\n  ❌ ${arch.problems.length} new architecture violation(s), not in the baseline:\n${arch.problems.map((p) => `    - ${p}`).join('\n')}`
    );
    say('     Layer map: apps/cli/src/commands/quality/architecture-layers.ts');
  }
  if (size.problems.length > 0 || arch.problems.length > 0) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`staged gates failed to run: ${String(error)}\n`);
    process.exit(1);
  }
}

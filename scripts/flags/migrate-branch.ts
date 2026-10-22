/**
 * pnpm flags:migrate [--onto origin/main] [--no-commit]
 *
 * Run in an open PR's checkout after main moved flags to src/config/flags/. It reads
 * every flag entry at the merge-base, the PR head and main, works out what the PR
 * meant (entries added, removed, or changed in spec or comments), merges main, puts
 * the registry back to main's layout and re-applies only that intent: flags/NAME.ts
 * when the name lives there or is new, an AST splice when main still has it in a
 * legacy file. It stops before touching anything when main and the PR both changed a
 * name differently, and it ends with a per-name check that every name the PR touched
 * equals its PR-head version and every other name equals main's.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { writeFlagBarrel } from '../../src/config/__tests__/flag-barrel.js';
import { commentsOf, parseFlagFile, parseLegacy, type Entry } from './legacy-parse.js';
import { configDir, editLegacy, writeFormatted } from './move-to-files.js';
import { flagFileText, isMain } from './new-flag.js';

const REGISTRY = /^src\/config\/(flag-manifest[\w-]*\.ts|flags\/[A-Z][A-Z0-9_]*\.ts)$/;

interface Located {
  entry: Entry;
  /** The entry's own lines, comments included, as the file has them. */
  raw: string;
  /** Repo-relative path. */
  path: string;
  legacy: boolean;
}
export type Snapshot = Map<string, Located>;

/** Every flag entry in a set of registry files (repo-relative path → text). */
export function snapshot(files: Map<string, string>): Snapshot {
  const out: Snapshot = new Map();
  for (const [path, text] of files) {
    const legacy = !path.includes('/flags/');
    const entries = legacy ? parseLegacy(path, text).entries : [parseFlagFile(path, text)];
    for (const entry of entries) {
      const prior = out.get(entry.name);
      if (prior) throw new Error(`${entry.name} is in both ${prior.path} and ${path}`);
      out.set(entry.name, { entry, raw: text.slice(entry.start, entry.end), path, legacy });
    }
  }
  return out;
}

/** What a flag means: spec and comments, wherever it lives. */
const meaning = (l: Located | undefined): string | undefined =>
  l && JSON.stringify({ spec: l.entry.spec, comments: commentsOf(l.entry) });

export interface Change {
  name: string;
  op: 'add' | 'change' | 'remove';
  base?: Located;
  head?: Located;
  main?: Located;
}

/** The PR's intent, and the names main also changed differently (a human decides those). */
export function intent(
  base: Snapshot,
  head: Snapshot,
  main: Snapshot
): { changes: Change[]; conflicts: Change[] } {
  const changes: Change[] = [];
  const conflicts: Change[] = [];
  for (const name of [...new Set([...base.keys(), ...head.keys()])].sort()) {
    const [b, h, m] = [base.get(name), head.get(name), main.get(name)];
    if (meaning(b) === meaning(h)) continue;
    const change: Change = {
      name,
      op: !b ? 'add' : !h ? 'remove' : 'change',
      base: b,
      head: h,
      main: m,
    };
    if (meaning(m) !== meaning(b) && meaning(m) !== meaning(h)) conflicts.push(change);
    else changes.push(change);
  }
  return { changes, conflicts };
}

const show = (l: Located | undefined): string =>
  l ? `${l.path}\n${l.raw.trimEnd().replace(/^/gm, '      ')}` : '(absent)';

function git(root: string, ...args: string[]): string {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
}
const tryGit = (root: string, ...args: string[]): number =>
  spawnSync('git', args, { cwd: root, stdio: 'ignore' }).status ?? 1;

function snapshotAt(root: string, rev: string): Snapshot {
  const paths = git(root, 'ls-tree', '-r', '--name-only', rev, '--', 'src/config').split('\n');
  return snapshot(
    new Map(paths.filter((p) => REGISTRY.test(p)).map((p) => [p, git(root, 'show', `${rev}:${p}`)]))
  );
}

function registryPathsOnDisk(root: string): string[] {
  const config = configDir(root);
  const flags = existsSync(join(config, 'flags')) ? readdirSync(join(config, 'flags')) : [];
  return [
    ...readdirSync(config).map((f) => `src/config/${f}`),
    ...flags.map((f) => `src/config/flags/${f}`),
  ].filter((p) => REGISTRY.test(p));
}
const snapshotOnDisk = (root: string): Snapshot =>
  snapshot(new Map(registryPathsOnDisk(root).map((p) => [p, readFileSync(join(root, p), 'utf8')])));

/** Writes the PR's version of each change into main's layout (the working tree holds main's registry). */
async function apply(root: string, changes: Change[], main: Snapshot): Promise<void> {
  const legacyEdits = new Map<string, Map<string, string | null>>();
  for (const { name, head } of changes) {
    const cur = main.get(name);
    if (meaning(cur) === meaning(head)) continue;
    if (cur?.legacy) {
      const text = !head
        ? null
        : head.legacy
          ? head.raw
          : [
              ...commentsOf(head.entry),
              `${name}: ${JSON.stringify(head.entry.spec).replace(/"/g, "'")},`,
            ]
              .map((line) => `  ${line}\n`)
              .join('');
      const file = cur.path.replace('src/config/', '');
      legacyEdits.set(file, (legacyEdits.get(file) ?? new Map()).set(name, text));
    } else if (!head) {
      rmSync(join(root, cur?.path ?? ''));
    } else {
      const file = join(configDir(root), 'flags', `${name}.ts`);
      await writeFormatted(file, flagFileText(name, head.entry.spec, commentsOf(head.entry)));
    }
  }
  for (const [file, edits] of legacyEdits) await editLegacy(root, file, edits);
}

export interface Step {
  cmd: string[];
  env?: Record<string, string>;
}
const vitest = (...files: string[]): string[] => [
  'pnpm',
  'exec',
  'vitest',
  'run',
  '--config',
  'vitest.config.unit.ts',
  ...files.map((f) => `src/config/__tests__/${f}.test.ts`),
];
export const DEFAULT_STEPS: Step[] = [
  { cmd: vitest('env-read-names'), env: { UPDATE_ENV_READ_NAMES: '1' } },
  { cmd: ['git', 'add', 'src/config/env-read-names.generated.ts'] },
  {
    cmd: vitest(
      'flag-index',
      'flag-manifest-contract',
      'flag-manifest',
      'effective-settings',
      'env-read-names'
    ),
  },
];

export interface MigrateOptions {
  root: string;
  onto?: string;
  commit?: boolean;
  steps?: Step[];
  log?: (line: string) => void;
}

/** Returns 0 when merged and checked, 1 when a human must finish, 2 on a conflict (nothing touched). */
export async function migrateBranch(o: MigrateOptions): Promise<number> {
  const { root, onto = 'origin/main', log = console.log } = o;
  if (git(root, 'status', '--porcelain').trim())
    throw new Error('commit or discard local changes first');
  const base = git(root, 'merge-base', 'HEAD', onto).trim();
  const main = snapshotAt(root, onto);
  const head = snapshotAt(root, 'HEAD');
  const { changes, conflicts } = intent(snapshotAt(root, base), head, main);
  for (const c of conflicts) {
    log(`CONFLICT ${c.name}: this PR and ${onto} both changed it since ${base.slice(0, 9)}.`);
    log(`  base: ${show(c.base)}\n  PR:   ${show(c.head)}\n  main: ${show(c.main)}`);
  }
  if (conflicts.length) return 2;

  tryGit(root, 'merge', '--no-ff', '--no-commit', onto);
  const paths = new Set([...registryPathsOnDisk(root), ...[...main.values()].map((l) => l.path)]);
  paths.add('src/config/flags/index.generated.ts');
  for (const p of paths) {
    if (tryGit(root, 'cat-file', '-e', `${onto}:${p}`) === 0) git(root, 'checkout', onto, '--', p);
    else git(root, 'rm', '-q', '-f', '--ignore-unmatch', '--', p);
  }
  await apply(root, changes, main);
  writeFlagBarrel(join(configDir(root), 'flags'));
  git(root, 'add', '-A', '--', 'src/config/flags', ':(glob)src/config/flag-manifest*.ts');

  let ok = true;
  for (const step of o.steps ?? DEFAULT_STEPS) {
    const r = spawnSync(step.cmd[0], step.cmd.slice(1), {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, ...step.env },
    });
    if (r.status !== 0) {
      ok = false;
      log(`FAILED ${step.cmd.join(' ')}\n${(r.stdout + r.stderr).slice(-3000)}`);
    }
  }
  const after = snapshotOnDisk(root);
  log(`flags:migrate per-name check (${changes.length} touched by this PR):`);
  for (const c of changes) {
    const same = meaning(after.get(c.name)) === meaning(c.head);
    ok &&= same;
    log(
      `  ${same ? 'OK      ' : 'MISMATCH'} ${c.op.padEnd(6)} ${c.name} ${after.get(c.name)?.path ?? '(absent)'}`
    );
  }
  const touched = new Set(changes.map((c) => c.name));
  for (const name of new Set([...main.keys(), ...after.keys()])) {
    if (touched.has(name) || meaning(after.get(name)) === meaning(main.get(name))) continue;
    ok = false;
    log(`  DRIFT    ${name}: not touched by this PR but differs from ${onto}`);
  }
  const unmerged = git(root, 'diff', '--name-only', '--diff-filter=U').trim();
  if (unmerged) log(`Resolve these by hand, then commit:\n${unmerged}`);
  if (!ok || unmerged) return 1;
  if (o.commit !== false && tryGit(root, 'rev-parse', '-q', '--verify', 'MERGE_HEAD') === 0)
    git(root, 'commit', '--no-edit', '-q');
  return 0;
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({
    options: { onto: { type: 'string' }, 'no-commit': { type: 'boolean' } },
  });
  migrateBranch({ root: process.cwd(), onto: values.onto, commit: !values['no-commit'] })
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}

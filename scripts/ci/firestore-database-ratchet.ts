#!/usr/bin/env npx tsx
/**
 * Firestore database ratchet: every server-side Firestore client must bind to
 * getFirestoreDatabase() (src/config/environment.ts).
 *
 * Dev runs on a second database (FIRESTORE_DATABASE=ferni-dev); prod stays on
 * '(default)'. A client that picks its own database splits dev: some stores on
 * ferni-dev, the rest writing to prod without a word. Banned outside the two
 * helpers (src/utils/firestore-utils.ts, src/utils/firebase-admin-app.ts):
 *
 * - `new Firestore(...)` without a `databaseId` option;
 * - `admin.firestore()` (the namespace can't pick a database): use getAdminFirestore();
 * - firebase-admin's bare `getFirestore()` / `getFirestore(app)`: use getAdminFirestore().
 *
 * The sites that existed when this landed are allowlisted per file in
 * firestore-database-allowlist.generated.json. A file may not gain sites, a file not in the
 * allowlist must have none, and the total can only go down (`--update` lowers it;
 * nothing raises it; CI also fails an allowlist edited above origin/main's).
 * Detection: scripts/codemods/firestore-database-sites.ts, the same parser the
 * codemod uses.
 *
 * usage:
 *   npx tsx scripts/ci/firestore-database-ratchet.ts            check (CI)
 *   npx tsx scripts/ci/firestore-database-ratchet.ts --update   lower the allowlist to today
 *   npx tsx scripts/ci/firestore-database-ratchet.ts --list     print every remaining site
 *
 * @module scripts/ci/firestore-database-ratchet
 */
import { execFileSync } from 'child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname, join, relative, sep } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import {
  SCAN_ROOTS,
  VIOLATION_KINDS,
  findSites,
  isScanned,
  parse,
  type Site,
} from '../codemods/firestore-database-sites.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const BASELINE = join(
  dirname(fileURLToPath(import.meta.url)),
  'firestore-database-allowlist.generated.json'
);

/** Relative path → number of banned sites, for files that have any. */
export type Allowlist = Record<string, number>;

export interface Violation {
  file: string;
  site: Site;
}

function walk(root: string, dir: string, out: string[]): void {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(root, path, out);
    else {
      const rel = relative(root, path).split(sep).join('/');
      if (isScanned(rel)) out.push(rel);
    }
  }
}

/** Every banned site under `root` (the repo, or a fixture tree laid out like it). */
export function measure(root = REPO): Violation[] {
  const files: string[] = [];
  for (const r of SCAN_ROOTS) walk(root, join(root, r), files);
  const out: Violation[] = [];
  for (const file of files.sort()) {
    const text = readFileSync(join(root, file), 'utf8');
    if (!/Firestore|firestore\(/.test(text)) continue;
    for (const site of findSites(parse(file, text))) {
      if (VIOLATION_KINDS.includes(site.kind)) out.push({ file, site });
    }
  }
  return out;
}

export function countByFile(violations: Violation[]): Allowlist {
  const counts: Allowlist = {};
  for (const v of violations) counts[v.file] = (counts[v.file] ?? 0) + 1;
  return counts;
}

/** What got worse than the allowlist. Empty when the change may land. */
export function regressions(allow: Allowlist, violations: Violation[]): string[] {
  const now = countByFile(violations);
  const out: string[] = [];
  for (const [file, count] of Object.entries(now)) {
    const before = allow[file] ?? 0;
    if (count <= before) continue;
    const sites = violations
      .filter((v) => v.file === file)
      .map((v) => `\n      ${file}:${v.site.line} [${v.site.kind}] ${v.site.text}`)
      .join('');
    out.push(
      before === 0
        ? `${file}: ${count} Firestore client(s) that don't bind getFirestoreDatabase(), and the file isn't allowlisted.${sites}`
        : `${file}: ${before} → ${count} Firestore client(s) that don't bind getFirestoreDatabase().${sites}`
    );
  }
  return out;
}

/** The allowlist lowered to today's counts; never raised, never gains a file. */
export function lowered(allow: Allowlist, violations: Violation[]): Allowlist {
  const now = countByFile(violations);
  const next: Allowlist = {};
  for (const [file, before] of Object.entries(allow)) {
    const count = Math.min(before, now[file] ?? 0);
    if (count > 0) next[file] = count;
  }
  return next;
}

/** Entries the checked-in allowlist raised above `main`'s copy: someone edited it upward. */
export function raised(main: Allowlist, current: Allowlist): string[] {
  return Object.entries(current)
    .filter(([file, n]) => n > (main[file] ?? 0))
    .map(
      ([file, n]) =>
        `${file}: allowlisted ${main[file] ?? 0} → ${n}. The allowlist may only go down; fix the site instead.`
    );
}

/**
 * The allowlist as committed at `ref`: 'no-ref' when the ref isn't there (a shallow
 * clone: CI must fetch it), 'no-file' when the ref predates the allowlist (true only
 * for the PR that adds it). Once the allowlist is on main, every run compares to it.
 */
export function allowlistAt(
  repo: string,
  ref: string,
  path: string
): Allowlist | 'no-ref' | 'no-file' {
  const git = (args: string[]): string =>
    execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  } catch {
    return 'no-ref';
  }
  try {
    return JSON.parse(git(['show', `${ref}:${path}`])) as Allowlist;
  } catch {
    return 'no-file';
  }
}

export const total = (a: Allowlist): number => Object.values(a).reduce((s, n) => s + n, 0);

const FIX =
  'Bind the database: new Firestore({ ..., databaseId: getFirestoreDatabase() }) ' +
  '(src/config/environment.ts), or use getAdminFirestore() (src/utils/firebase-admin-app.ts) ' +
  'instead of admin.firestore() / getFirestore(). scripts/codemods/firestore-database.ts does it for you.';

function main(): void {
  const args = process.argv.slice(2);
  const violations = measure();
  const allow: Allowlist = existsSync(BASELINE)
    ? (JSON.parse(readFileSync(BASELINE, 'utf8')) as Allowlist)
    : {};

  if (args.includes('--list')) {
    for (const v of violations)
      console.log(`${v.file}:${v.site.line} [${v.site.kind}] ${v.site.text}`);
  }
  if (args.includes('--init') || args.includes('--update')) {
    // --init exists only to write the first allowlist; after that, --update can only lower it.
    const next =
      args.includes('--init') && !existsSync(BASELINE)
        ? countByFile(violations)
        : lowered(allow, violations);
    const sorted = Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(BASELINE, `${JSON.stringify(sorted, null, 2)}\n`);
    console.log(`Allowlist: ${Object.keys(sorted).length} files, ${total(sorted)} sites.`);
    return;
  }

  const atMain = allowlistAt(REPO, 'origin/main', relative(REPO, BASELINE).split(sep).join('/'));
  if (atMain === 'no-ref' && process.env.CI) {
    console.error(
      '❌ origin/main is not fetched, so an allowlist raised above main would pass. Fetch it (fetch-depth: 0).'
    );
    process.exit(1);
  }
  const onMain = typeof atMain === 'object' ? atMain : undefined;
  const worse = [...regressions(allow, violations), ...(onMain ? raised(onMain, allow) : [])];
  console.log(
    `Firestore database ratchet: ${violations.length} sites now, allowlist ${total(allow)}` +
      (onMain
        ? `, origin/main's ${total(onMain)}.`
        : atMain === 'no-ref'
          ? ' (origin/main not fetched: the raised-allowlist check did not run).'
          : ' (origin/main has no allowlist yet: the raised-allowlist check starts once it does).')
  );
  if (worse.length > 0) {
    console.error(
      `\n❌ ${worse.length} file(s) gained Firestore clients that ignore FIRESTORE_DATABASE, or were allowlisted for more:`
    );
    worse.forEach((w) => console.error(`  - ${w}`));
    console.error(`\n${FIX}`);
    process.exit(1);
  }
  console.log(
    violations.length < total(allow)
      ? '\n✅ No new sites, and some were fixed: run with --update to lower the allowlist.'
      : '\n✅ No new sites.'
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

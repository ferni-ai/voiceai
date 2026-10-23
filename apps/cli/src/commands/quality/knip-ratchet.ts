#!/usr/bin/env npx tsx
/**
 * Dead-code gate: knip (knip.json at the repo root) finds unused files and exports under
 * src/, and a change fails when it adds some.
 *
 * On 2026-10-23 no workflow ran a dead-code check and 118 production files had no
 * importer (code-health dead.md, G5). knip resolves the import graph from the container
 * entrypoints, worker threads, scripts, tests and the registry globs that load modules by
 * path (tool domains, persona bundles, scheduled jobs).
 *
 * It compares the change with its merge base (merge-base.ts), not a committed list: knip
 * runs on the working tree and on the base commit's source trees (with today's root config
 * files, but the base's own knip.json once it has one).
 * Fails on: a file unused here that was used at the base (or is new), and a file with more
 * unused exports + types than at the base. A moved file is matched to its old path.
 *
 * Production mode (entries marked `!` in knip.json, no tests) is reported alongside as a
 * warning: a new file only tests reach.
 *
 *   pnpm quality:knip     check (CI, Quality Gates)
 *
 * @module quality/knip-ratchet
 */
import { spawn, spawnSync } from 'child_process';
import { copyFileSync, mkdtempSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { basePathOf, diffAgainstBase, listAtBase, readAtBase, resolveBase, type BaseDiff } from './merge-base.js';

export interface DeadCode {
  /** files nothing reaches */
  files: string[];
  /** file → unused exports + unused exported types */
  exports: Record<string, number>;
}

interface KnipIssue {
  file: string;
  files?: unknown[];
  exports?: unknown[];
  types?: unknown[];
}

/** Reads knip's JSON reporter output; throws when its shape is not what this gate understands. */
export function fromKnip(report: unknown): DeadCode {
  const issues = (report as { issues?: unknown } | null)?.issues;
  if (!Array.isArray(issues)) throw new Error('knip report has no issues array: did the knip version or reporter change?');
  const files: string[] = [];
  const exports: Record<string, number> = {};
  for (const raw of issues) {
    const issue = raw as KnipIssue;
    const lists = [issue.files, issue.exports, issue.types];
    if (typeof issue.file !== 'string' || lists.some((l) => l !== undefined && !Array.isArray(l))) {
      throw new Error(`knip issue has an unexpected shape: ${JSON.stringify(raw).slice(0, 200)}`);
    }
    if ((issue.files?.length ?? 0) > 0) files.push(issue.file);
    const n = (issue.exports?.length ?? 0) + (issue.types?.length ?? 0);
    if (n > 0) exports[issue.file] = (exports[issue.file] ?? 0) + n;
  }
  return { files: [...new Set(files)].sort(), exports };
}

const totalExports = (d: DeadCode): number => Object.values(d.exports).reduce((a, b) => a + b, 0);

/**
 * Guards against a gate that passes because knip saw nothing: an emptied project, a changed
 * config or a reporter that stopped listing exports all look like "no dead code".
 */
export function emptinessProblem(head: DeadCode, base: DeadCode): string | null {
  if (head.files.length === 0 && totalExports(head) === 0) {
    return 'knip reported no unused files or exports at all: is knip.json still pointing at src/?';
  }
  if (totalExports(base) > 1000 && totalExports(head) < totalExports(base) / 2) {
    return `knip found ${totalExports(head)} unused exports here against ${totalExports(base)} at the base: a config or output change, not a cleanup this size. Check knip.json.`;
  }
  return null;
}

/** Dead code this change adds, compared with the base (moved files matched to their old path). */
export function added(head: DeadCode, base: DeadCode, toBase: (headPath: string) => string | null): string[] {
  const wasUnused = new Set(base.files);
  const out: string[] = [];
  for (const f of head.files) {
    const old = toBase(f);
    if (old === null || !wasUnused.has(old)) out.push(`${f}: unused file (nothing imports it from an entry point)`);
  }
  const unusedNow = new Set(head.files);
  for (const [f, n] of Object.entries(head.exports)) {
    if (unusedNow.has(f)) continue; // reported as a file
    const old = toBase(f);
    const before = old === null ? 0 : (base.exports[old] ?? 0);
    if (n > before) out.push(`${f}: unused exports ${before} → ${n}`);
  }
  return out;
}

/** Runs knip in `cwd`; resolves with its parsed JSON report. */
function knip(cwd: string, production: boolean): Promise<unknown> {
  const bin = join(process.cwd(), 'node_modules', '.bin', 'knip');
  const args = production
    ? ['--production', '--include', 'files', '--reporter', 'json', '--no-progress']
    : ['--include', 'files,exports,types', '--reporter', 'json', '--no-progress'];
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd });
    const chunks: Buffer[] = [];
    let err = '';
    child.stdout.on('data', (c: Buffer) => chunks.push(c));
    child.stderr.on('data', (c: Buffer) => (err += c.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      // knip exits 1 when it finds issues; only output that isn't JSON is a failure to run.
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error(`knip in ${cwd} did not produce a report (exit ${code}):\n${err.slice(-2000)}`));
      }
    });
  });
}

// apps/cli/src too: package.json scripts make its commands knip entries, and they import src/.
const TREES = ['src', 'scripts', 'tests', 'e2e', 'apps/cli/src'];

/** The base commit's source trees, with today's root config files and node_modules, in a temp dir. */
function baseCheckout(base: string, root: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'knip-base-'));
  const present = TREES.filter((t) => listAtBase(base, [t], root).length > 0);
  const archive = spawnSync('git', ['archive', '--format=tar', base, '--', ...present], { cwd: root, maxBuffer: 2 * 1024 * 1024 * 1024 });
  if (archive.status !== 0) throw new Error(`git archive ${base} failed: ${archive.stderr?.toString()}`);
  const untar = spawnSync('tar', ['-x', '-C', dir], { input: archive.stdout, maxBuffer: 64 * 1024 * 1024 });
  if (untar.status !== 0) throw new Error(`tar failed: ${untar.stderr?.toString()}`);
  for (const name of readdirSync(root)) {
    if (statSync(join(root, name)).isFile()) copyFileSync(join(root, name), join(dir, name)); // knip.json, package.json, tsconfig, vitest configs
  }
  // The base's own knip.json when it has one: a PR that narrows the config then shows up as
  // far less dead code than the base, which emptinessProblem() fails.
  const config = readAtBase(base, ['knip.json'], root).get('knip.json');
  if (config !== undefined) writeFileSync(join(dir, 'knip.json'), config);
  symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'));
  return dir;
}

async function main(): Promise<void> {
  const say = (text: string): boolean => process.stdout.write(`${text}\n`);
  const root = process.cwd();
  const started = Date.now();
  const base = resolveBase(root);
  const diff: BaseDiff = diffAgainstBase(base, TREES, root);
  const baseDir = baseCheckout(base, root);
  try {
    const [headAll, baseAll, headProd, baseProd] = (await Promise.all([
      knip(root, false),
      knip(baseDir, false),
      knip(root, true),
      knip(baseDir, true),
    ])).map(fromKnip) as [DeadCode, DeadCode, DeadCode, DeadCode];
    const toBase = (p: string): string | null => basePathOf(diff, p);
    say(
      `Dead code (knip), base ${base.slice(0, 9)}, ${Date.now() - started} ms:\n` +
        `  here: ${headAll.files.length} unused files, ${totalExports(headAll)} unused exports; production mode ${headProd.files.length} unused files\n` +
        `  base: ${baseAll.files.length} unused files, ${totalExports(baseAll)} unused exports; production mode ${baseProd.files.length} unused files`
    );
    const empty = emptinessProblem(headAll, baseAll) ?? emptinessProblem(headProd, baseProd);
    if (empty) {
      say(`\n❌ ${empty}`);
      process.exit(1);
    }
    const prodOnly = added({ files: headProd.files, exports: {} }, { files: baseProd.files, exports: {} }, toBase);
    for (const p of prodOnly) {
      const note = `${p.split(':')[0]}: no production entry point reaches it (only tests or tooling, if anything)`;
      say(`  ⚠️  ${note}`);
      if (process.env.GITHUB_ACTIONS) say(`::warning title=Dead code (production mode)::${note}`);
    }
    const worse = added(headAll, baseAll, toBase);
    if (worse.length > 0) {
      say(`\n❌ ${worse.length} piece(s) of dead code added by this change:\n${worse.slice(0, 60).map((w) => `  - ${w}`).join('\n')}`);
      if (worse.length > 60) say(`  … and ${worse.length - 60} more`);
      say('\nDelete it, or use it. Loaded by path at runtime? Add its glob to "entry" in knip.json (owners review it). `pnpm exec knip` shows details.');
      process.exit(1);
    }
    say('\n✅ No dead code added.');
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    process.stdout.write(`Dead-code gate failed to run: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}

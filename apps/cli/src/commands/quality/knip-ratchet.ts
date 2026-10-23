#!/usr/bin/env npx tsx
/**
 * Dead-code ratchet: knip (knip.json at the repo root) lists unused files and unused
 * exports under src/; a new one fails.
 *
 * On 2026-10-23 no workflow ran a dead-code check (quality:dead-code existed, nothing
 * called it) and 118 production files had no importer at all (code-health dead.md,
 * G5). knip resolves the real import graph from the container entrypoints, worker
 * threads, scripts, tests and the registry globs that load modules by path (tool
 * domains, persona bundles, scheduled jobs), so a file it calls unused is reached
 * by none of them. Exports and types used only inside their own file count as unused.
 *
 * The ratchet: a file not in knip-baseline.generated.json that knip calls unused
 * fails, and so does a file whose unused-export count (values + types) rises.
 *
 *   pnpm quality:knip            check (CI, Quality Gates)
 *   pnpm quality:knip --update   lower the baseline to today (never raises)
 *   pnpm quality:knip --init     re-record (review sees the diff)
 *   ... --input <knip.json>      read a saved `knip --reporter json` run instead of running it
 *
 * @module quality/knip-ratchet
 */
import { spawnSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

export const KNIP_BASELINE = join(dirname(fileURLToPath(import.meta.url)), 'knip-baseline.generated.json');

export interface DeadCode {
  /** files nothing reaches */
  files: string[];
  /** file → unused exports + unused exported types */
  exports: Record<string, number>;
}

/** The part of knip's JSON reporter output this reads. */
export interface KnipReport {
  issues: Array<{ file: string; files?: unknown[]; exports?: unknown[]; types?: unknown[] }>;
}

export function fromKnip(report: KnipReport): DeadCode {
  const files: string[] = [];
  const exports: Record<string, number> = {};
  for (const issue of report.issues) {
    if ((issue.files?.length ?? 0) > 0) files.push(issue.file);
    const n = (issue.exports?.length ?? 0) + (issue.types?.length ?? 0);
    if (n > 0) exports[issue.file] = n;
  }
  const sorted = Object.keys(exports).sort();
  return { files: [...new Set(files)].sort(), exports: Object.fromEntries(sorted.map((f) => [f, exports[f]!])) };
}

/** What got worse than the baseline; empty when the change may land. */
export function regressions(base: DeadCode, now: DeadCode): string[] {
  const known = new Set(base.files);
  const out = now.files.filter((f) => !known.has(f)).map((f) => `${f}: unused file (nothing imports it from an entry point)`);
  for (const [file, n] of Object.entries(now.exports)) {
    const before = base.exports[file] ?? 0;
    if (n > before && !now.files.includes(file)) out.push(`${file}: unused exports ${before} → ${n}`);
  }
  return out;
}

/** The baseline lowered to today; nothing is added. */
export function lowered(base: DeadCode, now: DeadCode): DeadCode {
  const current = new Set(now.files);
  const exports = Object.entries(base.exports)
    .map(([f, n]) => [f, Math.min(n, now.exports[f] ?? 0)] as const)
    .filter(([, n]) => n > 0);
  return { files: base.files.filter((f) => current.has(f)), exports: Object.fromEntries(exports) };
}

const total = (d: DeadCode): number => Object.values(d.exports).reduce((a, b) => a + b, 0);
const summary = (d: DeadCode): string => `${d.files.length} unused files, ${total(d)} unused exports in ${Object.keys(d.exports).length} files`;

function runKnip(): KnipReport {
  const r = spawnSync('pnpm', ['exec', 'knip', '--include', 'files,exports,types', '--reporter', 'json', '--no-progress'], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  // knip exits 1 when it finds issues; only output that isn't JSON is a failure to run.
  try {
    return JSON.parse(r.stdout) as KnipReport;
  } catch {
    throw new Error(`knip did not produce a report (exit ${r.status}):\n${r.stderr.slice(-2000)}`);
  }
}

function main(args: string[]): void {
  const say = (text: string): boolean => process.stdout.write(`${text}\n`);
  const started = Date.now();
  const input = args.includes('--input') ? args[args.indexOf('--input') + 1] : undefined;
  const now = fromKnip(input ? (JSON.parse(readFileSync(input, 'utf8')) as KnipReport) : runKnip());
  const write = (d: DeadCode): void => writeFileSync(KNIP_BASELINE, JSON.stringify(d, null, 1) + '\n');
  say(`Dead code (knip): ${summary(now)}, in ${Date.now() - started} ms.`);
  if (args.includes('--init')) return write(now);
  if (!existsSync(KNIP_BASELINE)) throw new Error(`No baseline at ${KNIP_BASELINE}: run with --init`);
  const base = JSON.parse(readFileSync(KNIP_BASELINE, 'utf8')) as DeadCode;
  if (args.includes('--update')) write(lowered(base, now));
  const worse = regressions(base, now);
  if (worse.length > 0) {
    say(`\n❌ ${worse.length} new piece(s) of dead code:\n${worse.slice(0, 60).map((w) => `  - ${w}`).join('\n')}`);
    if (worse.length > 60) say(`  … and ${worse.length - 60} more`);
    say('\nDelete it, or use it. Loaded by path at runtime? Add its glob to "entry" in knip.json. `pnpm exec knip` shows the details.');
    process.exit(1);
  }
  const better = summary(lowered(base, now)) !== summary(base);
  say(better ? '\n✅ No new dead code, and some went away: run with --update to lock it in.' : '\n✅ No new dead code.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));

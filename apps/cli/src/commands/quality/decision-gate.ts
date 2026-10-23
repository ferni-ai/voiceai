#!/usr/bin/env npx tsx
/**
 * Decision gate: a new crisis word list, voice resolver, quiet-hours predicate, tool
 * cap, forget checker or Twilio sender outside its owner fails CI.
 *
 * The registry (docs/architecture/decisions.ts) names each domain decision's owner and
 * the fingerprints of a second decider. This counts fingerprint lines per file outside
 * each owner and compares them with decision-baseline.generated.json: a file whose
 * count rises, or a new file with a hit, fails. It runs as a CLI unit test
 * (__tests__/decision-gate.test.ts), so every PR runs it.
 *
 *   pnpm quality:decisions            check
 *   pnpm quality:decisions --update   lower the baseline to today (never raises)
 *   pnpm quality:decisions --init     re-record every hit (review sees the diff)
 *
 * @module quality/decision-gate
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DECISIONS, type DomainDecision } from '../../../../../docs/architecture/decisions.js';

export const DECISION_BASELINE = join(dirname(fileURLToPath(import.meta.url)), 'decision-baseline.generated.json');
/** decision id → file → fingerprint lines. */
export type DecisionCounts = Record<string, Record<string, number>>;
export interface DecisionHit { decision: string; fingerprint: string; file: string; line: number; text: string }

const TEST = /(__tests__|__mocks__|\.(test|spec)\.tsx?$|^src\/(tests|e2e)\/)/;

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (name === 'node_modules' || name === 'dist') continue;
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(name) && !name.endsWith('.d.ts')) out.push(path);
  }
  return out;
}

/** Production .ts files under src/, relative to root. */
export function sourceFiles(root: string): string[] {
  return walk(join(root, 'src'), [])
    .map((f) => relative(root, f))
    .filter((f) => !TEST.test(f))
    .sort();
}

/** The text with block comments and whole-line `//` comments blanked; line numbers kept. */
export function stripComments(text: string): string {
  const blank = (s: string): string => s.replace(/[^\n]/g, ' ');
  return text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/^[ \t]*\/\/.*$/gm, blank);
}

/** Every fingerprint line outside its decision's owner. */
export function scan(root: string, files: string[], decisions: readonly DomainDecision[] = DECISIONS): DecisionHit[] {
  const hits: DecisionHit[] = [];
  for (const file of files) {
    const raw = readFileSync(join(root, file), 'utf8');
    let lines: string[] | undefined;
    for (const d of decisions) {
      if (d.ownerPaths.some((p) => file === p || (p.endsWith('/') && file.startsWith(p)))) continue;
      for (const fp of d.fingerprints) {
        if (!fp.pattern.test(raw) || (fp.onlyIn && !fp.onlyIn.test(raw))) continue; // cheap prefilter
        lines ??= stripComments(raw).split('\n');
        lines.forEach((text, i) => {
          if (fp.pattern.test(text)) hits.push({ decision: d.id, fingerprint: fp.name, file, line: i + 1, text: text.trim() });
        });
      }
    }
  }
  return hits;
}

/** Lines per (decision, file); a line matching two fingerprints of one decision counts once. */
export function countHits(hits: DecisionHit[], decisions: readonly DomainDecision[] = DECISIONS): DecisionCounts {
  const out: DecisionCounts = Object.fromEntries(decisions.map((d) => [d.id, {}]));
  const seen = new Set<string>();
  for (const h of hits) {
    const key = `${h.decision}|${h.file}|${h.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const byFile = (out[h.decision] ??= {});
    byFile[h.file] = (byFile[h.file] ?? 0) + 1;
  }
  for (const id of Object.keys(out)) {
    out[id] = Object.fromEntries(Object.entries(out[id]!).sort(([a], [b]) => (a < b ? -1 : 1)));
  }
  return out;
}

/** Files where a decision has more fingerprint lines than the baseline allows. */
export function regressions(base: DecisionCounts, now: DecisionCounts): Array<{ decision: string; file: string; before: number; after: number }> {
  const out: Array<{ decision: string; file: string; before: number; after: number }> = [];
  for (const [decision, files] of Object.entries(now)) {
    for (const [file, after] of Object.entries(files)) {
      const before = base[decision]?.[file] ?? 0;
      if (after > before) out.push({ decision, file, before, after });
    }
  }
  return out;
}

/** The baseline lowered to today: counts can fall or disappear, never rise. */
export function lowered(base: DecisionCounts, now: DecisionCounts): DecisionCounts {
  return Object.fromEntries(
    Object.entries(base).map(([decision, files]) => [
      decision,
      Object.fromEntries(
        Object.entries(files)
          .map(([file, n]) => [file, Math.min(n, now[decision]?.[file] ?? 0)] as const)
          .filter(([, n]) => n > 0)
      ),
    ])
  );
}

const total = (c: DecisionCounts, id: string): number => Object.values(c[id] ?? {}).reduce((a, b) => a + b, 0);

function main(args: string[]): void {
  const say = (text: string): boolean => process.stdout.write(`${text}\n`);
  const root = process.cwd();
  const started = Date.now();
  const files = sourceFiles(root);
  const hits = scan(root, files);
  const now = countHits(hits);
  const write = (c: DecisionCounts): void => writeFileSync(DECISION_BASELINE, JSON.stringify(c, null, 1) + '\n');
  say(`Decision gate: ${files.length} files in ${Date.now() - started} ms. Fingerprint lines outside each owner:`);
  for (const d of DECISIONS) say(`  ${d.id.padEnd(20)} ${String(total(now, d.id)).padStart(4)} in ${Object.keys(now[d.id] ?? {}).length} files  (owner ${d.owner.module}#${d.owner.fn}${d.owner.provisional ? ', provisional' : ''})`);
  if (args.includes('--init')) return write(now);
  if (!existsSync(DECISION_BASELINE)) throw new Error(`No baseline at ${DECISION_BASELINE}: run with --init`);
  const base = JSON.parse(readFileSync(DECISION_BASELINE, 'utf8')) as DecisionCounts;
  if (args.includes('--update')) write(lowered(base, now));
  const worse = regressions(base, now);
  if (worse.length > 0) {
    say(`\n❌ ${worse.length} file(s) gained a decision fingerprint outside its owner:`);
    for (const w of worse) {
      const d = DECISIONS.find((x) => x.id === w.decision)!;
      say(`  ${w.decision}  ${w.file}: ${w.before} → ${w.after}`);
      for (const h of hits.filter((x) => x.decision === w.decision && x.file === w.file).slice(0, 3)) say(`      ${h.line}: ${h.text.slice(0, 110)}`);
      say(`      fix: ask ${d.owner.module}#${d.owner.fn} instead of deciding here (docs/architecture/decisions.ts)`);
    }
    say('\nA deliberate new decider? Move the owner in docs/architecture/decisions.ts, or run with --init; review sees the baseline diff.');
    process.exit(1);
  }
  say('\n✅ No new deciders outside their owners.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));

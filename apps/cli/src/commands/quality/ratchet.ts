#!/usr/bin/env npx tsx
/**
 * Quality ratchet: the standards in docs/DEFINITION-OF-CLEAN.md, as numbers
 * that can only go down.
 *
 * On 2026-10-01 every standard either passed while broken (1,392 files over
 * the 500-line limit, gate printed PASSED) or failed for everyone (the brand
 * linter's thousands of old errors failed every PR), so nobody looked. A
 * ratchet fails only when a change makes things worse:
 *
 * - a file over 500 lines grows, or a new file starts over 500 lines;
 * - any critical brand-copy violation (BRAND-VOICE-GUIDE.md's banned phrases);
 * - more brand-copy warnings, or more errors for any brand-lint rule
 *   (console.* in app code, hardcoded colors), than the baseline.
 *
 * usage:
 *   npx tsx apps/cli/src/commands/quality/ratchet.ts            check (CI)
 *   npx tsx apps/cli/src/commands/quality/ratchet.ts --update   lower the baseline to today
 *   npx tsx apps/cli/src/commands/quality/ratchet.ts --init     write a fresh baseline
 *   ... ratchet.ts --bundle [--init|--update]   the built web bundle (after pnpm build:frontend)
 *
 * @module quality/ratchet
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

export const MAX_LINES = 500;
const ROOT = process.cwd();
const BASELINE = join(dirname(fileURLToPath(import.meta.url)), 'ratchet-baseline.json');
/** Source trees held to the file-size limit. */
const SIZE_ROOTS = ['src', 'apps/web/src', 'apps/cli/src'];

export interface Measurement {
  /** path → lines, for files over MAX_LINES */
  oversized: Record<string, number>;
  brandCritical: number;
  brandWarnings: number;
  /** brand-lint rule → error count */
  lint: Record<string, number>;
}

/** The built web app (apps/web/dist/assets), in KB. */
export interface BundleSize {
  totalKB: number;
  /** JS and CSS the entry pulls in statically: what loads before the app runs */
  initialKB: number;
  maxChunkKB: number;
}

/** One chunk in Vite's build manifest (dist/.vite/manifest.json, `build.manifest: true`). */
export interface ManifestChunk {
  file: string;
  isEntry?: boolean;
  /** manifest keys of chunks this one imports statically */
  imports?: string[];
  /** manifest keys of chunks this one loads with import(): not initial */
  dynamicImports?: string[];
  css?: string[];
}

/** Builds differ by a few bytes run to run; growth under this isn't a regression. */
export const BUNDLE_TOLERANCE = 0.02;

/**
 * Files (relative to dist) that load before the app runs: every entry, and
 * everything it reaches through static imports, with their CSS. Asking the
 * manifest instead of guessing from filenames, because Rollup names a chunk
 * after its module: a lazy foo/index.ts becomes index-*.js, and an eager
 * chunk can have any name.
 */
export function initialFiles(manifest: Record<string, ManifestChunk>): Set<string> {
  const files = new Set<string>();
  const seen = new Set<string>();
  const queue = Object.keys(manifest).filter((key) => manifest[key]?.isEntry);
  for (let key = queue.pop(); key !== undefined; key = queue.pop()) {
    const chunk = manifest[key];
    if (!chunk || seen.has(key)) continue;
    seen.add(key);
    files.add(chunk.file);
    for (const css of chunk.css ?? []) files.add(css);
    queue.push(...(chunk.imports ?? []));
  }
  return files;
}

export function measureBundle(dir = join(ROOT, 'apps/web/dist/assets')): BundleSize {
  const files = readdirSync(dir).filter((f) => /\.(js|css)$/.test(f));
  const manifestPath = join(dir, '..', '.vite', 'manifest.json');
  let isInitial: (file: string) => boolean;
  if (existsSync(manifestPath)) {
    const initial = initialFiles(JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, ManifestChunk>);
    isInitial = (f) => initial.has(`assets/${f}`);
  } else {
    console.warn(`⚠️  No ${relative(ROOT, manifestPath)}: guessing initial files from their names (index*, vendor*).`);
    isInitial = (f) => /^(index|vendor)/.test(f);
  }
  let totalKB = 0;
  let initialKB = 0;
  let maxChunkKB = 0;
  for (const f of files) {
    const kb = statSync(join(dir, f)).size / 1024;
    totalKB += kb;
    if (isInitial(f)) initialKB += kb;
    maxChunkKB = Math.max(maxChunkKB, kb);
  }
  const round = (n: number): number => Math.round(n * 10) / 10;
  return { totalKB: round(totalKB), initialKB: round(initialKB), maxChunkKB: round(maxChunkKB) };
}

export function bundleRegressions(base: BundleSize, now: BundleSize): string[] {
  return (Object.keys(base) as Array<keyof BundleSize>)
    .filter((k) => now[k] > base[k] * (1 + BUNDLE_TOLERANCE))
    .map((k) => `Bundle ${k} grew ${base[k]} → ${now[k]} KB (limit: no growth beyond ${BUNDLE_TOLERANCE * 100}%).`);
}

function isSource(path: string): boolean {
  return (
    /\.(ts|tsx)$/.test(path) &&
    !/\.d\.ts$/.test(path) &&
    !/\.(test|spec)\.tsx?$/.test(path) &&
    !/\.generated\./.test(path) &&
    !/\/__tests__\//.test(path)
  );
}

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) walk(path, out);
    else if (isSource(path)) out.push(path);
  }
}

export function lineCount(text: string): number {
  if (!text) return 0;
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
}

export function measureOversized(roots = SIZE_ROOTS, root = ROOT): Record<string, number> {
  const files: string[] = [];
  for (const r of roots) walk(join(root, r), files);
  const oversized: Record<string, number> = {};
  for (const file of files.sort()) {
    const lines = lineCount(readFileSync(file, 'utf8'));
    if (lines > MAX_LINES) oversized[relative(root, file)] = lines;
  }
  return oversized;
}

async function measure(): Promise<Measurement> {
  const { checkFile, getAllRelevantFiles } = await import('./check-brand-compliance.js');
  const { runLinter } = await import('./lint-brand.js');
  const copy = getAllRelevantFiles().flatMap((f) => checkFile(f));
  const lintResults = await runLinter();
  const lint: Record<string, number> = {};
  for (const e of lintResults.errors) lint[e.rule] = (lint[e.rule] ?? 0) + 1;
  return {
    oversized: measureOversized(),
    brandCritical: copy.filter((v) => v.severity === 'critical').length,
    brandWarnings: copy.filter((v) => v.severity === 'warning').length,
    lint,
  };
}

/** What got worse than the baseline. Empty when the change may land. */
export function regressions(base: Measurement, now: Measurement): string[] {
  const out: string[] = [];
  for (const [file, lines] of Object.entries(now.oversized)) {
    const before = base.oversized[file];
    if (before === undefined) {
      out.push(`${file}: ${lines} lines, over the ${MAX_LINES}-line limit (new or newly over). Split it.`);
    } else if (lines > before) {
      out.push(`${file}: grew ${before} → ${lines} lines. Files over ${MAX_LINES} lines may not grow; split or shrink it.`);
    }
  }
  if (now.brandCritical > 0) {
    out.push(`${now.brandCritical} critical brand-copy violation(s): run check-brand-compliance.ts --all.`);
  }
  if (now.brandWarnings > base.brandWarnings) {
    out.push(`Brand-copy warnings rose ${base.brandWarnings} → ${now.brandWarnings}.`);
  }
  for (const [rule, count] of Object.entries(now.lint)) {
    const before = base.lint[rule] ?? 0;
    if (count > before) out.push(`Brand lint "${rule}" rose ${before} → ${count}: run lint-brand.ts.`);
  }
  return out;
}

/** The baseline lowered to wherever things now stand better; never raised. */
export function lowered(base: Measurement, now: Measurement): Measurement {
  const oversized: Record<string, number> = {};
  for (const [file, before] of Object.entries(base.oversized)) {
    const lines = now.oversized[file];
    if (lines !== undefined) oversized[file] = Math.min(before, lines);
  }
  const lint: Record<string, number> = {};
  for (const [rule, before] of Object.entries(base.lint)) lint[rule] = Math.min(before, now.lint[rule] ?? 0);
  return {
    oversized,
    brandCritical: 0,
    brandWarnings: Math.min(base.brandWarnings, now.brandWarnings),
    lint,
  };
}

function summary(m: Measurement): string {
  const lintTotal = Object.values(m.lint).reduce((a, b) => a + b, 0);
  return `${Object.keys(m.oversized).length} files over ${MAX_LINES} lines, ${m.brandCritical} critical / ${m.brandWarnings} warning brand-copy issues, ${lintTotal} brand-lint errors`;
}

async function bundleMain(args: string[]): Promise<void> {
  const file = JSON.parse(readFileSync(BASELINE, 'utf8')) as Measurement & { bundle?: BundleSize };
  const now = measureBundle();
  if (args.includes('--init') || args.includes('--update')) {
    const next =
      file.bundle && !args.includes('--init')
        ? {
            totalKB: Math.min(file.bundle.totalKB, now.totalKB),
            initialKB: Math.min(file.bundle.initialKB, now.initialKB),
            maxChunkKB: Math.min(file.bundle.maxChunkKB, now.maxChunkKB),
          }
        : now;
    writeFileSync(BASELINE, JSON.stringify({ ...file, bundle: next }, null, 1) + '\n');
    console.log(`Bundle baseline: ${JSON.stringify(next)}`);
    return;
  }
  if (!file.bundle) throw new Error('No bundle baseline: run with --bundle --init after a build');
  const worse = bundleRegressions(file.bundle, now);
  console.log(`Bundle (KB). Baseline: ${JSON.stringify(file.bundle)}\n            Now:      ${JSON.stringify(now)}`);
  if (worse.length > 0) {
    console.log(`\n❌ ${worse.map((w) => `  - ${w}`).join('\n')}`);
    process.exit(1);
  }
  console.log('\n✅ The bundle did not grow.');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--bundle')) return bundleMain(args);
  const now = await measure();
  if (args.includes('--init')) {
    const old = JSON.parse(readFileSync(BASELINE, 'utf8')) as { bundle?: BundleSize };
    writeFileSync(BASELINE, JSON.stringify({ ...now, brandCritical: 0, bundle: old.bundle }, null, 1) + '\n');
    console.log(`Baseline written: ${summary(now)}`);
    return;
  }
  const base = JSON.parse(readFileSync(BASELINE, 'utf8')) as Measurement;
  if (args.includes('--update')) {
    const next = { ...lowered(base, now), bundle: (base as { bundle?: BundleSize }).bundle };
    writeFileSync(BASELINE, JSON.stringify(next, null, 1) + '\n');
    console.log(`Baseline lowered: ${summary(base)}  →  ${summary(next)}`);
    return;
  }
  const worse = regressions(base, now);
  console.log(`Quality ratchet. Baseline: ${summary(base)}\n                 Now:      ${summary(now)}`);
  if (worse.length > 0) {
    console.log(`\n❌ ${worse.length} regression(s):\n${worse.map((w) => `  - ${w}`).join('\n')}`);
    process.exit(1);
  }
  const better = summary(lowered(base, now)) !== summary(base);
  console.log(
    better
      ? '\n✅ No regressions, and things improved: run with --update to lock it in.'
      : '\n✅ No regressions.'
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('Quality ratchet failed to run:', error);
    process.exit(1);
  });
}

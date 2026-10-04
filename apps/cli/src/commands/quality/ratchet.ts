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

/** The built web app (apps/web/dist), in KB. */
export interface BundleSize {
  /** every js/css file Vite emitted to dist/assets */
  totalKB: number;
  /** the same-origin js/css index.html loads before the app runs (see initialFiles) */
  initialKB: number;
  maxChunkKB: number;
}

/** Builds differ by a few bytes run to run; growth under this isn't a regression. */
export const BUNDLE_TOLERANCE = 0.02;

/**
 * The same-origin js/css files an index.html loads at startup: script src,
 * and stylesheet / modulepreload / preload links. Paths are relative to dist.
 *
 * initialKB used to count files named index* or vendor*, which missed chunks
 * index.html preloaded under other names: #221 folded those into index-*.js
 * and the ratchet reported +1.8 MB while the first load had shrunk.
 */
export function initialFiles(html: string): string[] {
  const files = new Set<string>();
  const tags = html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<(script|link)\b([^>]*)>/gi);
  for (const [, tag, attrs] of tags) {
    const rel = /(?:^|\s)rel\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1]?.toLowerCase() ?? '';
    if (tag.toLowerCase() === 'link' && !['stylesheet', 'modulepreload', 'preload'].includes(rel)) continue;
    const url = /(?:^|\s)(?:src|href)\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    // Cross-origin (fonts, CDNs, SDKs) isn't ours to ratchet.
    if (!url || /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(url)) continue;
    const path = url.split(/[?#]/)[0].replace(/^\.?\//, '');
    if (/\.(m?js|css)$/.test(path)) files.add(path);
  }
  return [...files];
}

export function measureBundle(dist = join(ROOT, 'apps/web/dist')): BundleSize {
  const assets = join(dist, 'assets');
  const files = readdirSync(assets).filter((f) => /\.(js|css)$/.test(f));
  let totalKB = 0;
  let maxChunkKB = 0;
  for (const f of files) {
    const kb = statSync(join(assets, f)).size / 1024;
    totalKB += kb;
    maxChunkKB = Math.max(maxChunkKB, kb);
  }
  let initialKB = 0;
  for (const f of initialFiles(readFileSync(join(dist, 'index.html'), 'utf8'))) {
    // A missing file is a broken build, not a smaller bundle.
    if (!existsSync(join(dist, f))) throw new Error(`index.html loads ${f}, which is not in ${dist}`);
    initialKB += statSync(join(dist, f)).size / 1024;
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

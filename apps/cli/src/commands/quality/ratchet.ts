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
 * - in the files a change touches, compared with its merge base (size-diff.ts): a new
 *   file over 300 lines, a file over 500 that grows or crosses 500, a function over 150
 *   lines that is new or grows by more than max(5, 2%), more `as unknown as` casts;
 * - any critical brand-copy violation (BRAND-VOICE-GUIDE.md's banned phrases);
 * - more brand-copy warnings, or more errors for any brand-lint rule
 *   (console.* in app code, hardcoded colors), than the baseline.
 *
 * usage:
 *   npx tsx apps/cli/src/commands/quality/ratchet.ts            check (CI)
 *   npx tsx apps/cli/src/commands/quality/ratchet.ts --update   lower the baseline to today
 *   npx tsx apps/cli/src/commands/quality/ratchet.ts --init     write a fresh baseline
 *   ... ratchet.ts --bundle [--init|--update]   the built web bundle (after pnpm build:frontend)
 *   ... ratchet.ts --eslint <results.json> [--as webEslint|designEslint] [--init|--update]
 *       ESLint errors per rule (results from `eslint --format json --output-file <results.json>`)
 *
 * @module quality/ratchet
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { gitVisible } from './git-visible.js';
import { changedSources, sizeRegressions } from './size-diff.js';
import { checkWebsiteThemeDebt } from './website-theme-debt.js';

export const MAX_LINES = 500;
const ROOT = process.cwd();
const BASELINE = join(dirname(fileURLToPath(import.meta.url)), 'ratchet-baseline.json');
/** Source trees held to the file-size limit. */
const SIZE_ROOTS = ['src', 'apps/web/src', 'apps/cli/src'];

export interface Measurement {
  /** path → lines, for files over MAX_LINES (a scoreboard: size-diff.ts gates growth against the merge base) */
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

/**
 * Lazy translation chunks (src/i18n/locales/<locale>.json). A visitor loads
 * one, so they count once, at the size of the largest, toward the total.
 */
export function localeFiles(manifest: Record<string, ManifestChunk>): Set<string> {
  return new Set(
    Object.entries(manifest)
      .filter(([key]) => /(^|\/)i18n\/locales\/[^/]+\.json$/.test(key))
      .map(([, chunk]) => chunk.file)
  );
}

export function measureBundle(dir = join(ROOT, 'apps/web/dist/assets')): BundleSize {
  const files = readdirSync(dir).filter((f) => /\.(js|css)$/.test(f));
  const manifestPath = join(dir, '..', '.vite', 'manifest.json');
  let isInitial: (file: string) => boolean;
  let isLocale: (file: string) => boolean = () => false;
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, ManifestChunk>;
    const initial = initialFiles(manifest);
    const locales = localeFiles(manifest);
    isInitial = (f) => initial.has(`assets/${f}`);
    isLocale = (f) => locales.has(`assets/${f}`);
  } else {
    console.warn(`⚠️  No ${relative(ROOT, manifestPath)}: guessing initial files from their names (index*, vendor*).`);
    isInitial = (f) => /^(index|vendor)/.test(f);
  }
  let totalKB = 0;
  let initialKB = 0;
  let maxChunkKB = 0;
  let maxLocaleKB = 0;
  for (const f of files) {
    const kb = statSync(join(dir, f)).size / 1024;
    if (isLocale(f)) maxLocaleKB = Math.max(maxLocaleKB, kb);
    else totalKB += kb;
    if (isInitial(f)) initialKB += kb;
    maxChunkKB = Math.max(maxChunkKB, kb);
  }
  totalKB += maxLocaleKB;
  const round = (n: number): number => Math.round(n * 10) / 10;
  return { totalKB: round(totalKB), initialKB: round(initialKB), maxChunkKB: round(maxChunkKB) };
}

export function bundleRegressions(base: BundleSize, now: BundleSize): string[] {
  return (Object.keys(base) as Array<keyof BundleSize>)
    .filter((k) => now[k] > base[k] * (1 + BUNDLE_TOLERANCE))
    .map((k) => `Bundle ${k} grew ${base[k]} → ${now[k]} KB (limit: no growth beyond ${BUNDLE_TOLERANCE * 100}%).`);
}

export interface EslintFileResult {
  messages: Array<{ severity: number; ruleId: string | null }>;
}

/** ESLint errors (severity 2) per rule; parse errors have no rule and count as "parse". */
export function eslintErrorsByRule(results: EslintFileResult[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of results)
    for (const m of r.messages)
      if (m.severity === 2) out[m.ruleId ?? 'parse'] = (out[m.ruleId ?? 'parse'] ?? 0) + 1;
  return out;
}

export function eslintRegressions(base: Record<string, number>, now: Record<string, number>): string[] {
  return Object.entries(now)
    .filter(([rule, n]) => n > (base[rule] ?? 0))
    .map(([rule, n]) => `ESLint "${rule}" errors rose ${base[rule] ?? 0} → ${n}.`);
}

/**
 * Baselined rules with errors that reported none at all. A rule turned off, set to warn, or
 * matching no files reads as zero, and "nothing rose" would pass it as fixed.
 */
export function eslintSilentRules(base: Record<string, number>, now: Record<string, number>): string[] {
  return Object.entries(base)
    .filter(([rule, n]) => n > 0 && !(rule in now))
    .map(
      ([rule, n]) =>
        `ESLint "${rule}" reported nothing (baseline ${n}): turned off, set to warn, or matching no files. If every violation is really fixed, run --update.`
    );
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
  for (const file of files.filter(gitVisible(root)).sort()) {
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

/**
 * ESLint runs whose per-rule error counts are ratcheted, by baseline key (`--as`):
 * apps/web's own config, and the design-system rules (eslint.design.config.mjs).
 *
 * Both also fail a baselined rule that reports nothing (eslintSilentRules): otherwise a PR
 * that switches a rule off, or sets it to warn, reads as having fixed every violation.
 */
const ESLINT_BASELINES = {
  webEslint: { label: 'Web ESLint' },
  designEslint: { label: 'Design-system ESLint' },
} as const;
type EslintBaseline = keyof typeof ESLINT_BASELINES;
type BaselineFile = Partial<Record<EslintBaseline, Record<string, number>>> & { bundle?: BundleSize };

async function eslintMain(args: string[]): Promise<void> {
  const key = (args.includes('--as') ? args[args.indexOf('--as') + 1] : 'webEslint') as EslintBaseline;
  if (!Object.hasOwn(ESLINT_BASELINES, key)) throw new Error(`--as must be one of ${Object.keys(ESLINT_BASELINES).join(', ')}`);
  const { label } = ESLINT_BASELINES[key];
  const file = JSON.parse(readFileSync(BASELINE, 'utf8')) as BaselineFile;
  const results = JSON.parse(readFileSync(args[args.indexOf('--eslint') + 1] ?? '', 'utf8')) as EslintFileResult[];
  const now = eslintErrorsByRule(results);
  const total = (m: Record<string, number>): number => Object.values(m).reduce((a, b) => a + b, 0);
  if (args.includes('--init') || args.includes('--update')) {
    const base = args.includes('--init') ? undefined : file[key];
    const next = base ? Object.fromEntries(Object.entries(base).map(([r, n]) => [r, Math.min(n, now[r] ?? 0)])) : now;
    writeFileSync(BASELINE, JSON.stringify({ ...file, [key]: next }, null, 1) + '\n');
    process.stdout.write(`${label} baseline: ${total(next)} errors` + '\n');
    return;
  }
  const base = file[key];
  if (!base) throw new Error(`No ${label} baseline: run with --eslint <file> --as ${key} --init`);
  const worse = [...eslintRegressions(base, now), ...eslintSilentRules(base, now)];
  process.stdout.write(`${label} errors. Baseline: ${total(base)}  Now: ${total(now)}` + '\n');
  if (worse.length > 0) {
    process.stdout.write(`\n❌ ${worse.map((w) => `  - ${w}`).join('\n')}\n`);
    process.exit(1);
  }
  process.stdout.write('\n✅ No rule has more ESLint errors than its baseline.' + '\n');
}

/** The baselines other modes own, carried over when the main ratchet rewrites the file. */
export const otherModes = (file: BaselineFile): BaselineFile => ({
  bundle: file.bundle,
  webEslint: file.webEslint,
  designEslint: file.designEslint,
});

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--bundle')) return bundleMain(args);
  if (args.includes('--eslint')) return eslintMain(args);
  const now = await measure();
  if (args.includes('--init')) {
    const keep = otherModes(JSON.parse(readFileSync(BASELINE, 'utf8')) as BaselineFile);
    writeFileSync(BASELINE, JSON.stringify({ ...now, brandCritical: 0, ...keep }, null, 1) + '\n');
    console.log(`Baseline written: ${summary(now)}`);
    return;
  }
  const base = JSON.parse(readFileSync(BASELINE, 'utf8')) as Measurement;
  if (args.includes('--update')) {
    const next = { ...lowered(base, now), ...otherModes(base as BaselineFile) };
    writeFileSync(BASELINE, JSON.stringify(next, null, 1) + '\n');
    console.log(`Baseline lowered: ${summary(base)}  →  ${summary(next)}`);
    return;
  }
  const started = Date.now();
  const size = changedSources(SIZE_ROOTS, isSource);
  console.log(`Size, against base ${size.base.slice(0, 9)}: ${size.changes.length} touched source files (${Date.now() - started} ms).`);
  const worse = [...regressions(base, now), ...sizeRegressions(size.changes, size.removed), ...checkWebsiteThemeDebt()];
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

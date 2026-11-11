#!/usr/bin/env npx tsx
/**
 * Web design-value ratchet (#3274): apps/web/src may not gain hard-coded design values.
 *
 * The 2026-10-31 design audit counted thousands of colour literals, ~140 distinct shadows,
 * 24 easing curves, ~1000 literal durations, ~1900 literal font sizes and 550 !important
 * in apps/web/src, with nothing to stop them growing. pnpm lint:design already ratchets
 * colours and durations, but only in .ts/.tsx and only through its own rules; this counts
 * every kind below in .ts, .tsx and .css alike, comments left out (an issue number like
 * #1234 in a comment is not a colour).
 *
 * The counts as they were when this landed are in web-design-values-baseline.generated.json,
 * per file and kind. A file may not gain any kind, a file not in the baseline must have
 * none, and `--update` only ever lowers it. Use the design tokens instead
 * (design-system/tokens, the CSS custom properties they generate).
 *
 * usage:
 *   npx tsx scripts/ci/web-design-values.ts            check
 *   npx tsx scripts/ci/web-design-values.ts --update   lower the baseline to today
 *   npx tsx scripts/ci/web-design-values.ts --list     print each file's counts
 * The check also runs as a test (scripts/ci/__tests__/web-design-values.test.ts), so the
 * "Run the scripts/ci ratchets" step runs it on every pull request.
 *
 * @module scripts/ci/web-design-values
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname, join, relative, sep } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SCAN_ROOT = 'apps/web/src';
export const BASELINE = join(
  dirname(fileURLToPath(import.meta.url)),
  'web-design-values-baseline.generated.json'
);

/** A literal value written where a design token belongs. */
const VALUE_START = String.raw`(?!\s*(?:var\(|\$\{|none\b|inherit\b|initial\b|unset\b|revert\b))`;
export const KINDS = {
  /** #rgb, #rgba, #rrggbb, #rrggbbaa (not a URL fragment or `issue-#12`), and rgb()/hsl() */
  colour:
    /(?<![\w&/#-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])|\b(?:rgba?|hsla?)\(\s*[\d.]/g,
  /** a box-shadow / text-shadow value, or a drop-shadow() filter, written out */
  shadow: new RegExp(
    String.raw`(?:\b(?:box|text)-shadow|\b(?:box|text)Shadow)\s*:\s*['"\`]?${VALUE_START}[^;'"\`\n]*\d|\bdrop-shadow\(\s*[\d.-]`,
    'g'
  ),
  /** a cubic-bezier() curve written out */
  easing: /\bcubic-bezier\(/g,
  /** a time in ms or s inside a transition or animation value */
  duration: new RegExp(
    String.raw`(?:\b(?:transition|animation)(?:-duration|-delay)?|\b(?:transition|animation)(?:Duration|Delay)?)\s*:[^;\n]*?(?<![\w.-])\d*\.?\d+m?s(?![\w-])`,
    'g'
  ),
  /** a font size written out (px, rem, em, %, pt, vw) */
  fontSize: new RegExp(
    String.raw`(?:\bfont-size|\bfontSize)\s*:\s*['"\`]?${VALUE_START}\s*\d*\.?\d+(?:px|rem|em|%|pt|vw|vh)?\b`,
    'g'
  ),
  important: /!important\b/g,
} as const;
export type Kind = keyof typeof KINDS;
export const KIND_NAMES = Object.keys(KINDS) as Kind[];

export type Counts = Partial<Record<Kind, number>>;
/** Relative path → counts of each kind it has (kinds at 0 left out). */
export type Baseline = Record<string, Counts>;

/** The text with comments blanked out (strings and template literals kept). */
export function stripComments(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? text.length : end + 1;
      out += ' ';
    } else if (c === '/' && next === '/' && text[i - 1] !== ':') {
      // `://` is a URL, not a comment
      const end = text.indexOf('\n', i);
      i = end < 0 ? text.length : end - 1;
    } else if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < text.length && text[j] !== c) j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j;
    } else out += c;
  }
  return out;
}

/** How many of each kind `text` (a .ts, .tsx or .css file) holds. */
export function countValues(text: string, css = false): Counts {
  // CSS has no // comments and its quotes don't nest templates: only /* */ is stripped
  const code = css ? text.replace(/\/\*[\s\S]*?\*\//g, ' ') : stripComments(text);
  const counts: Counts = {};
  for (const kind of KIND_NAMES) {
    const n = code.match(KINDS[kind])?.length ?? 0;
    if (n > 0) counts[kind] = n;
  }
  return counts;
}

const SCANNED = /\.(?:tsx?|css)$/;
const SKIPPED =
  /(?:^|\/)(?:__tests__|__mocks__|node_modules|dist)(?:\/|$)|\.(?:test|spec|d)\.tsx?$/;

function walk(root: string, dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const rel = relative(root, path).split(sep).join('/');
    if (SKIPPED.test(rel)) continue;
    if (statSync(path).isDirectory()) walk(root, path, out);
    else if (SCANNED.test(name)) out.push(rel);
  }
}

/** Each scanned file's counts under `root` (the repo, or a fixture tree laid out like it). */
export function measure(root = REPO): Baseline {
  const files: string[] = [];
  if (existsSync(join(root, SCAN_ROOT))) walk(root, join(root, SCAN_ROOT), files);
  const out: Baseline = {};
  for (const file of files.sort()) {
    const counts = countValues(readFileSync(join(root, file), 'utf8'), file.endsWith('.css'));
    if (Object.keys(counts).length > 0) out[file] = counts;
  }
  return out;
}

/** What grew past the baseline, one line per file and kind. Empty when the change may land. */
export function regressions(baseline: Baseline, now: Baseline): string[] {
  const out: string[] = [];
  for (const [file, counts] of Object.entries(now)) {
    for (const kind of KIND_NAMES) {
      const count = counts[kind] ?? 0;
      const before = baseline[file]?.[kind] ?? 0;
      if (count > before) out.push(`${file}: ${kind} ${before} → ${count}`);
    }
  }
  return out;
}

/** The baseline lowered to today's counts; never raised, never gains a file or a kind. */
export function lowered(baseline: Baseline, now: Baseline): Baseline {
  const next: Baseline = {};
  for (const [file, counts] of Object.entries(baseline)) {
    const kept: Counts = {};
    for (const kind of KIND_NAMES) {
      const n = Math.min(counts[kind] ?? 0, now[file]?.[kind] ?? 0);
      if (n > 0) kept[kind] = n;
    }
    if (Object.keys(kept).length > 0) next[file] = kept;
  }
  return next;
}

/** Each kind summed over every file. */
export function totals(b: Baseline): Record<Kind, number> {
  const sum = Object.fromEntries(KIND_NAMES.map((k) => [k, 0])) as Record<Kind, number>;
  for (const counts of Object.values(b)) for (const k of KIND_NAMES) sum[k] += counts[k] ?? 0;
  return sum;
}

export function readBaseline(path = BASELINE): Baseline {
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Baseline) : {};
}

function write(baseline: Baseline): void {
  const sorted = Object.fromEntries(
    Object.entries(baseline).sort(([a], [b]) => a.localeCompare(b))
  );
  writeFileSync(BASELINE, `${JSON.stringify(sorted, null, 2)}\n`);
}

function main(): void {
  const args = process.argv.slice(2);
  const now = measure();
  const baseline = readBaseline();
  if (args.includes('--list')) {
    for (const [file, counts] of Object.entries(now)) console.log(file, JSON.stringify(counts));
  }
  if (args.includes('--init') || args.includes('--update')) {
    // --init only writes the first baseline; after that --update can only lower it
    write(args.includes('--init') && !existsSync(BASELINE) ? now : lowered(baseline, now));
    console.log('Baseline:', JSON.stringify(totals(readBaseline())));
    return;
  }
  const worse = regressions(baseline, now);
  console.log(`Web design values now: ${JSON.stringify(totals(now))}`);
  console.log(`Baseline:              ${JSON.stringify(totals(baseline))}`);
  if (worse.length > 0) {
    console.error(
      `❌ ${worse.length} hard-coded design value count(s) went up in apps/web/src:\n  ${worse.join('\n  ')}\n` +
        'Use a design token (a CSS custom property from design-system/tokens) instead.'
    );
    process.exit(1);
  }
  const lower = JSON.stringify(lowered(baseline, now)) !== JSON.stringify(baseline);
  console.log(
    lower
      ? '✅ No growth. Some counts dropped: run with --update to lower the baseline.'
      : '✅ No growth.'
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

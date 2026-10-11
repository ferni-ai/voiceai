/**
 * A media condition is evaluated against the viewport, so a percentage has
 * nothing to be a percentage of: `(max-width: min(768px, 100%))` is never true.
 * `(max-width: clamp(336px, 90vw, 480px))` is true only when the viewport is
 * narrower than 336px, so it never fires on a phone. A sed in f70f06fbb
 * rewrote 133 breakpoints into those forms, and the phone, tablet and desktop
 * rules behind them silently stopped applying. Breakpoints are plain lengths.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|css)$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path] : [];
  });
}

const CONDITIONS = [
  /@(?:media|container)\b([^{]*)/g, // CSS, in .css files and in TS template strings
  /matchMedia\(\s*(['"`])(.*?)\1/g, // JS media queries
];
const UNSUPPORTED = /\b(?:min|max|clamp)\(|%|\d\s*vw\b/;

/** Every media/container condition in `text` that uses math functions, % or vw. */
function badConditions(file: string, text: string): string[] {
  const hits: string[] = [];
  text.split('\n').forEach((line, index) => {
    for (const pattern of CONDITIONS) {
      for (const match of line.matchAll(pattern)) {
        const condition = match[match.length - 1] ?? '';
        if (UNSUPPORTED.test(condition)) {
          hits.push(`${relative(ROOT, file)}:${index + 1} ${condition.trim()}`);
        }
      }
    }
  });
  return hits;
}

describe('media query conditions', () => {
  it('flags the forms that never match and accepts plain lengths', () => {
    const sample = [
      '@media (max-width: min(768px, 100%)) {',
      '  @media (max-width: clamp(336px, 90vw, 480px)) {',
      "const q = window.matchMedia('(max-width: min(1024px, 100%))');",
      '@media (max-width: 768px) and (prefers-reduced-motion: reduce) {',
      "const ok = window.matchMedia('(min-width: 1200px)');",
      '  width: min(400px, 100%);',
    ].join('\n');
    expect(badConditions(join(ROOT, 'sample.ts'), sample)).toEqual([
      'sample.ts:1 (max-width: min(768px, 100%))',
      'sample.ts:2 (max-width: clamp(336px, 90vw, 480px))',
      'sample.ts:3 (max-width: min(1024px, 100%))',
    ]);
  });

  it('every breakpoint in src and index.html is a plain length', () => {
    const files = [...sourceFiles(SRC), join(ROOT, 'index.html')];
    const hits = files.flatMap((file) => badConditions(file, readFileSync(file, 'utf8')));
    expect(hits).toEqual([]);
  });
});

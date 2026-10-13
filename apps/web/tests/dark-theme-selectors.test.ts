/**
 * Dark theme selector + token guard
 *
 * The app's dark theme is `data-theme="midnight"` (see src/theme/index.ts).
 * Rules written against `[data-theme="dark"]` never match, so their dark
 * overrides never ran and panels fell back to light-theme colours: Staying in
 * Touch drew ink text on the midnight card (1.07:1) and Let's Play drew paper
 * titles on a light card (1.02:1).
 *
 * A `var(--token, #fallback)` whose token doesn't exist fails the same way: the
 * fallback is a light-theme colour, so midnight gets a light surface.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it, expect } from 'vitest';
import { THEMES } from '../src/theme/index.js';

const WEB_ROOT = join(__dirname, '..');

function filesUnder(dir: string, exts: string[]): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => exts.some((e) => f.endsWith(e)) && !f.includes('__tests__'))
    .map((f) => join(dir, f));
}

/** Returns `line: text` for every `[data-theme="dark"]` / `[data-theme='dark']` selector. */
function findDarkSelectors(source: string): string[] {
  const hits: string[] = [];
  source.split('\n').forEach((line, i) => {
    if (/\[data-theme=["']?dark["']?\]/.test(line)) hits.push(`${i + 1}: ${line.trim()}`);
  });
  return hits;
}

/** Every custom property declared in the stylesheets the app loads. */
function definedColorTokens(): Set<string> {
  const css = [
    ...filesUnder(join(WEB_ROOT, 'public', 'design-system'), ['.css']),
    ...filesUnder(join(WEB_ROOT, 'src', 'styles'), ['.css']),
  ]
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');
  return new Set([...css.matchAll(/(--color-[\w-]+)\s*:/g)].map((m) => m[1]));
}

function undefinedColorTokens(file: string, defined: Set<string>): string[] {
  const used = [...readFileSync(file, 'utf8').matchAll(/var\(\s*(--color-[\w-]+)/g)].map((m) => m[1]);
  return [...new Set(used)].filter((t) => !defined.has(t));
}

describe('dark theme selectors', () => {
  it('the dark theme is named midnight, so "dark" is not a theme', () => {
    expect(THEMES.midnight.mode).toBe('dark');
    expect(Object.keys(THEMES)).not.toContain('dark');
  });

  it('detects both quote styles (scanner sanity check)', () => {
    const fixture = 'a {}\n[data-theme="dark"] .x {}\n[data-theme=\'dark\'] .y {}\n[data-theme="midnight"] .z {}';
    expect(findDarkSelectors(fixture)).toEqual([
      '2: [data-theme="dark"] .x {}',
      "3: [data-theme='dark'] .y {}",
    ]);
  });

  it('no app style targets [data-theme="dark"]', () => {
    const files = filesUnder(join(WEB_ROOT, 'src'), ['.ts', '.css']);
    expect(files.length).toBeGreaterThan(100);
    const offenders = files.flatMap((file) =>
      findDarkSelectors(readFileSync(file, 'utf8')).map((hit) => `${relative(WEB_ROOT, file)}:${hit}`)
    );
    expect(offenders).toEqual([]);
  });
});

describe('panel colour tokens exist', () => {
  const defined = definedColorTokens();

  it('finds the theme tokens (sanity check)', () => {
    expect(defined.has('--color-text-primary')).toBe(true);
    expect(defined.has('--color-background-elevated')).toBe(true);
  });

  for (const panel of ['contact-settings', 'game-picker', 'digital-twin']) {
    it(`${panel} uses only colour tokens that are defined`, () => {
      expect(undefinedColorTokens(join(WEB_ROOT, 'src', 'ui', `${panel}.ui.ts`), defined)).toEqual([]);
    });
  }

  it('contact settings text takes its colour from tokens, not fixed ink', () => {
    const src = readFileSync(join(WEB_ROOT, 'src', 'ui', 'contact-settings.ui.ts'), 'utf8');
    const fixedInk = src.split('\n').filter((l) => /(^|[\s;{])color:\s*rgba\(44,\s*37,\s*32/.test(l));
    expect(fixedInk).toEqual([]);
  });
});

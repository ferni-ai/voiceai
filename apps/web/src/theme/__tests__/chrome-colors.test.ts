/**
 * The page background has one colour per theme: the token. On 2026-10-21 the
 * light theme painted three near-identical creams (#fafaf9 for the body and
 * theme-color, #faf8f5 for the gate) and the dark gate painted #0a0a0f after
 * midnight, because a self-referencing override erased the dark token. These
 * read the sources the browser actually uses, so a drift fails here.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHROME_MIDNIGHT, CHROME_ZEN } from '../index.js';

const web = resolve(__dirname, '../../..');
const read = (path: string): string => readFileSync(resolve(web, path), 'utf8');

interface ThemeTokens {
  themes: Record<'zen' | 'midnight', { background: { primary: string } }>;
}
const tokens = JSON.parse(read('../../design-system/tokens/colors.json')) as ThemeTokens;
const ZEN = tokens.themes.zen.background.primary;
const MIDNIGHT = tokens.themes.midnight.background.primary;

describe('page background matches the design tokens', () => {
  it('reads real token values', () => {
    expect(ZEN).toMatch(/^#[0-9a-f]{6}$/i);
    expect(MIDNIGHT).toMatch(/^#[0-9a-f]{6}$/i);
    expect(ZEN).not.toBe(MIDNIGHT);
  });

  it('paints the body and theme-color with background.primary', () => {
    expect(CHROME_ZEN).toBe(ZEN);
    expect(CHROME_MIDNIGHT).toBe(MIDNIGHT);
  });

  it('uses the same values in index.html before any module loads', () => {
    const html = read('index.html');
    expect(html).toContain(`<meta name="theme-color" content="${ZEN}" />`);
    const preBoot = html.match(/var color = theme === 'zen' \? '(#[0-9a-f]{6})' : '(#[0-9a-f]{6})';/i);
    expect(preBoot?.slice(1)).toEqual([ZEN, MIDNIGHT]);
  });

  it('falls back to the dark token where the gate and skeleton paint the page', () => {
    for (const file of ['src/ui/sign-in-gate.ui.ts', 'src/ui/skeleton.ui.ts']) {
      const fallbacks = [...read(file).matchAll(/background: var\(--color-(?:background|bg)-primary, (#[0-9a-f]{6})\)/gi)];
      expect(fallbacks.length, file).toBeGreaterThan(0);
      for (const [, hex] of fallbacks) expect(hex, file).toBe(MIDNIGHT);
    }
  });

  it('never defines a custom property from itself in the app stylesheet', () => {
    // A cycle makes the property invalid in every element it matches
    const css = read('src/styles/inline-styles.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const cycles = [...css.matchAll(/(--[\w-]+)\s*:[^;{}]*var\(\s*\1\s*[,)]/g)].map((m) => m[0]);
    expect(cycles).toEqual([]);
  });
});

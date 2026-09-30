/**
 * Text inks: brand colors made readable as text (design-system/utils/text-ink.js)
 * and the inks the token build writes into dist/tokens.css.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS module from the design system
import { contrastRatio, textInk } from '../../../../../design-system/utils/text-ink.js';

const DS = resolve(__dirname, '../../../../../design-system');
const colors = JSON.parse(readFileSync(resolve(DS, 'tokens/colors.json'), 'utf8'));

const surfacesOf = (theme: 'zen' | 'midnight'): string[] => {
  const bg = colors.themes[theme].background;
  const opaque = [bg.primary, bg.secondary, bg.tertiary, bg.elevated];
  return theme === 'zen' ? [...opaque, '#ffffff'] : opaque;
};
const minContrast = (hex: string, surfaces: string[]) =>
  Math.min(...surfaces.map((s) => contrastRatio(hex, s) as number));

describe('textInk', () => {
  it('keeps a color that already reads well', () => {
    expect(textInk('#2a2420', ['#ffffff'])).toBe('#2a2420');
  });

  it('lightens a dark brand color for dark surfaces', () => {
    const ink = textInk('#4a6741', surfacesOf('midnight'));
    expect(minContrast(ink, surfacesOf('midnight'))).toBeGreaterThanOrEqual(4.5);
    // Still green: the green channel leads
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(ink.slice(i, i + 2), 16));
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it('darkens a light brand color for light surfaces', () => {
    const ink = textInk('#b8956a', surfacesOf('zen'));
    expect(minContrast(ink, surfacesOf('zen'))).toBeGreaterThanOrEqual(4.5);
  });

  it('honors a custom target', () => {
    const ink = textInk('#b8956a', ['#ffffff'], { target: 7 });
    expect(contrastRatio(ink, '#ffffff')).toBeGreaterThanOrEqual(7);
  });
});

describe('generated tokens.css inks', () => {
  const cssPath = resolve(DS, 'dist/tokens.css');
  const css = existsSync(cssPath) ? readFileSync(cssPath, 'utf8') : '';

  /** Declarations from every block whose selector matches exactly. */
  const block = (selector: string): Record<string, string> => {
    const vars: Record<string, string> = {};
    let from = 0;
    for (;;) {
      const start = css.indexOf(`\n${selector} {`, from);
      if (start < 0) return vars;
      const body = css.slice(start, css.indexOf('}', start));
      for (const m of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
      from = start + 1;
    }
  };

  it.runIf(css)('every persona and status ink reaches WCAG AA on its theme', () => {
    const themes = {
      midnight: {
        ...block('[data-theme="midnight"]'),
        ...block(':root,\n[data-theme="midnight"]'),
      },
      zen: block('[data-theme="zen"]'),
    };
    const failures: string[] = [];
    for (const [theme, vars] of Object.entries(themes) as Array<
      ['zen' | 'midnight', Record<string, string>]
    >) {
      const inks = Object.entries(vars).filter(
        ([name]) =>
          /^--persona-[\w-]+-ink$/.test(name) ||
          name === '--persona-ink' ||
          name === '--color-accent-text' ||
          /^--color-semantic-[\w]+-text$/.test(name)
      );
      expect(inks.length, `inks found for ${theme}`).toBeGreaterThan(10);
      for (const [name, value] of inks) {
        const ratio = minContrast(value, surfacesOf(theme));
        if (ratio < 4.5) failures.push(`${theme} ${name} ${value} ${ratio.toFixed(2)}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it.runIf(css)('text on accent buttons reaches WCAG AA', () => {
    for (const theme of ['zen', 'midnight'] as const) {
      const vars = block(`[data-theme="${theme}"]`);
      const ratio = contrastRatio(
        vars['--color-text-on-accent'],
        colors.themes[theme].accent.primary
      );
      expect(ratio, theme).toBeGreaterThanOrEqual(4.5);
    }
  });
});

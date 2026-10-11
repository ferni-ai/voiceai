/**
 * Token contrast guard (WCAG AA, 4.5:1 for normal text)
 *
 * Computes contrast straight from design-system/tokens/colors.json so a token
 * edit that drops a pair below AA fails here, before it ships:
 * - every persona's onPrimary text on its primary fill (--persona-on-primary)
 * - the semantic warning colour with the theme's inverse text on a warning fill,
 *   and as warning text on the theme background
 * It also checks the generated tokens.css carries each persona's onPrimary, so
 * the build can't silently fall back to white.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const REPO_ROOT = join(__dirname, '..', '..', '..');
const AA_NORMAL_TEXT = 4.5;

interface PersonaColors {
  primary: string;
  onPrimary?: string;
}

interface ThemeColors {
  background: { primary: string };
  text: { inverse: string };
  semantic: { warning: string };
}

interface ColorTokens {
  personas: Record<string, PersonaColors | string>;
  themes: Record<string, ThemeColors>;
}

const tokens = JSON.parse(
  readFileSync(join(REPO_ROOT, 'design-system', 'tokens', 'colors.json'), 'utf8')
) as ColorTokens;

function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const personas = Object.entries(tokens.personas).filter(
  (entry): entry is [string, PersonaColors] =>
    !entry[0].startsWith('_') && typeof entry[1] === 'object'
);

describe('token contrast', () => {
  it('computes known WCAG ratios (sanity check)', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    // The old light-theme warning fill with #faf8f5 text, which failed AA.
    expect(contrast('#a67c35', '#faf8f5')).toBeLessThan(AA_NORMAL_TEXT);
  });

  it('covers every persona', () => {
    expect(personas.length).toBeGreaterThan(10);
  });

  it.each(personas)('%s: on-primary text passes AA on the primary fill', (_id, colors) => {
    expect(colors.onPrimary, 'onPrimary must be set explicitly').toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(contrast(colors.primary, colors.onPrimary ?? '')).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it.each(personas)('%s: prefers white on the fill wherever white passes', (_id, colors) => {
    if (contrast(colors.primary, '#ffffff') >= AA_NORMAL_TEXT) {
      expect(colors.onPrimary?.toLowerCase()).toBe('#ffffff');
    }
  });

  it.each(Object.entries(tokens.themes))(
    '%s: inverse text on the warning fill passes AA',
    (_name, theme) => {
      expect(contrast(theme.semantic.warning, theme.text.inverse)).toBeGreaterThanOrEqual(
        AA_NORMAL_TEXT
      );
    }
  );

  it.each(Object.entries(tokens.themes))(
    '%s: warning text on the page background passes AA',
    (_name, theme) => {
      expect(contrast(theme.semantic.warning, theme.background.primary)).toBeGreaterThanOrEqual(
        AA_NORMAL_TEXT
      );
    }
  );

  it('generated tokens.css sets --persona-on-primary from each persona onPrimary', () => {
    const css = readFileSync(
      join(REPO_ROOT, 'apps', 'web', 'public', 'design-system', 'tokens.css'),
      'utf8'
    );
    for (const [id, colors] of personas) {
      const kebab = id.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
      const block = css.match(new RegExp(`\\[data-persona="${kebab}"\\] \\{([^}]*)\\}`));
      expect(block, `no [data-persona="${kebab}"] block`).not.toBeNull();
      const onPrimary = block?.[1].match(/--persona-on-primary:\s*([^;]+);/)?.[1].trim();
      expect(onPrimary?.toLowerCase(), id).toBe(colors.onPrimary?.toLowerCase());
    }
  });
});

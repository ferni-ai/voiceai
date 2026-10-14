/**
 * Toasts on phones clear the floating menu button
 *
 * At 390px the toast sat bottom-centre at y799-828 with the full width to
 * spread into, and covered the menu button (x16-60, y774-818) by 20x19px.
 * On phones the toast container is now inset past the button on both sides.
 * jsdom has no layout, so this resolves the two rules' lengths from the CSS.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { injectMomentStyles, removeMomentStyles } from '../../src/ui/moments/styles.js';
import { STYLES as MENU_STYLES } from '../../src/ui/mobile-bottom-sheet.styles.js';

const TOKENS_PX: Record<string, number> = { '--space-sm': 8, '--space-md': 16, '--space-lg': 26 };

/** A px length, `var(--space-*, fallback)` or a `calc()` sum of those, in px. */
function px(value: string): number {
  const terms = value
    .replace(/^calc\((.*)\)$/, '$1')
    .split('+')
    .map((t) => t.trim());
  return terms.reduce((sum, term) => {
    const token = term.match(/^var\((--[\w-]+)/);
    if (token) {
      const known = TOKENS_PX[token[1]];
      if (known === undefined) throw new Error(`unknown token ${token[1]}`);
      return sum + known;
    }
    const length = term.match(/^(-?\d+(?:\.\d+)?)px$/);
    if (length) return sum + Number(length[1]);
    if (term === '0') return sum;
    throw new Error(`cannot resolve "${term}"`);
  }, 0);
}

type Scope = 'first' | 'phone' | 'all';

/**
 * Declarations of `selector`: its first rule, its rule inside the first
 * `@media (max-width: 480px)`, or all its rules merged in order.
 */
function declarations(css: string, selector: string, scope: Scope): Record<string, string> {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const from = scope === 'phone' ? source.indexOf('@media (max-width: 480px)') : 0;
  const pattern = new RegExp(`(?:^|[\\s}])${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`, 'g');
  const rules = [...source.slice(from).matchAll(pattern)].map((m) => m[1]);
  const out: Record<string, string> = {};
  for (const body of scope === 'all' ? rules : rules.slice(0, 1)) {
    for (const m of body.matchAll(/([\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  }
  return out;
}

describe('toast placement on phones', () => {
  afterEach(() => removeMomentStyles());

  const momentCss = (): string => {
    injectMomentStyles();
    return document.getElementById('ferni-moments-styles')?.textContent ?? '';
  };

  it('insets the toast past the menu button on both sides', () => {
    const menu = declarations(MENU_STYLES, '.mobile-menu-trigger', 'all');
    const menuRightEdge = px(menu.left) + px(menu.width);
    const toast = declarations(momentCss(), '.moments-container', 'phone');

    expect(toast.left, 'the phone rule insets the left edge').toBeDefined();
    expect(toast.right, 'the phone rule insets the right edge').toBeDefined();
    expect(px(toast.left)).toBeGreaterThan(menuRightEdge);
    expect(px(toast.right)).toBeGreaterThan(menuRightEdge);
  });

  it('keeps the full-width container on wider screens', () => {
    const toast = declarations(momentCss(), '.moments-container', 'first');
    expect(toast.left).toBe('0');
    expect(toast.right).toBe('0');
  });
});

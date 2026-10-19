/**
 * --color-ferni is a fill; Ferni-coloured TEXT uses --color-ferni-on-surface.
 *
 * Design audit 2026-10-18: --color-ferni (#4a6741) was used as `color:` in
 * about 45 rules. In midnight that is 2.96:1 on the page and 2.1:1 on the
 * elevated surface. It can't simply get a lighter midnight value: 22 rules and
 * the Connect gradient put white text on it as a fill (6.35:1), and no single
 * colour reads 4.5:1 both as text on #14110e and under white.
 *
 * So, like --persona-text (#1247), build.js now emits a theme-aware
 * --color-<persona>-on-surface from colors.json (textOnDark in midnight, the
 * primary in zen), and text uses it. This test keeps it that way: a new
 * `color: var(--color-ferni)` outside the allowlist fails.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(__dirname, '..', '..', '..');
const WEB_ROOT = join(REPO_ROOT, 'apps', 'web');
const TOKENS_CSS = readFileSync(join(WEB_ROOT, 'public', 'design-system', 'tokens.css'), 'utf8');

/**
 * Files allowed to use the bare fill as text, each with the reason.
 * Keep this short: every entry is a place midnight text can go unreadable.
 */
const ALLOWLIST: Record<string, string> = {
  // Standalone light-only admin page; declares its own --color-ferni and never
  // loads tokens.css, so #4a6741 on its cream background is 6:1.
  'src/pages/admin/landing-insights.html': 'light-only page with its own tokens',
};

/** `color: var(--color-ferni)` or with a fallback; not -text/-on-surface/background-color/border-color. */
const BARE_FILL_AS_TEXT = /(?:^|[^-a-zA-Z])color\s*:\s*var\(--color-ferni\s*[,)]/g;

function sourceFiles(): string[] {
  const out = [join(WEB_ROOT, 'index.html')];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.(ts|css|html)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) out.push(p);
    }
  };
  walk(join(WEB_ROOT, 'src'));
  return out;
}

/** Each offending use as `file:line`, keyed by web-relative path. */
function bareFillTextUses(): Map<string, string[]> {
  const hits = new Map<string, string[]>();
  for (const file of sourceFiles()) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(BARE_FILL_AS_TEXT)) {
      const rel = relative(WEB_ROOT, file);
      const line = src.slice(0, m.index).split('\n').length;
      hits.set(rel, [...(hits.get(rel) ?? []), `${rel}:${line}`]);
    }
  }
  return hits;
}

function declaredVars(selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  const src = TOKENS_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (
      !m[1]
        .split(',')
        .map((s) => s.trim())
        .includes(selector)
    )
      continue;
    for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[d[1]] = d[2].trim();
  }
  return out;
}
const themeVars = (theme: 'midnight' | 'zen'): Record<string, string> => ({
  ...declaredVars(':root'),
  ...declaredVars(`[data-theme="${theme}"]`),
});

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('Ferni-coloured text', () => {
  it('uses --color-ferni-on-surface, not the --color-ferni fill, outside the allowlist', () => {
    const offenders = [...bareFillTextUses()]
      .filter(([file]) => !(file in ALLOWLIST))
      .flatMap(([, lines]) => lines);
    expect(offenders, 'use var(--color-ferni-on-surface) for text').toEqual([]);
  });

  it('every allowlist entry still needs its exemption', () => {
    const uses = bareFillTextUses();
    for (const file of Object.keys(ALLOWLIST)) expect(uses.has(file), file).toBe(true);
  });

  it('the moved text uses really point at the new token', () => {
    // Guards against "fixing" the first test by deleting the colour instead.
    const count = sourceFiles()
      .map(
        (f) =>
          readFileSync(f, 'utf8').match(/color\s*:\s*var\(--color-ferni-on-surface\)/g)?.length ?? 0
      )
      .reduce((a, b) => a + b, 0);
    expect(count).toBeGreaterThanOrEqual(40);
  });

  it.each([
    ['midnight', ['#14110e', '#1e1a16', '#2a241f', '#352e28']],
    ['zen', ['#faf8f5', '#f5f2ed', '#ebe6df', '#fffdfb']],
  ] as const)('%s: --color-ferni-on-surface passes AA on every surface step', (theme, surfaces) => {
    const value = themeVars(theme)['--color-ferni-on-surface'];
    expect(value, 'defined').toMatch(/^#[0-9a-fA-F]{6}$/);
    for (const bg of surfaces) {
      expect(contrast(value, bg), `${value} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(['midnight', 'zen'] as const)(
    '%s: the --color-ferni fill still carries white text',
    (theme) => {
      const fill = themeVars(theme)['--color-ferni'];
      expect(contrast(fill, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    }
  );
});

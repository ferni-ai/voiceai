/**
 * Colour tokens the app uses must exist in both themes.
 *
 * Design audit 2026-10-18: three names the web app references hundreds of
 * times were never defined by the design system, so every use fell back to a
 * per-file literal written for the light theme (or to nothing):
 * - --color-background-subtle (143 uses): cream literals on midnight surfaces,
 *   e.g. the Ferni hub close button was a cream circle in dark.
 * - --color-background-hover (73 uses, including components/base/modal.ts and
 *   panel.ts): near-invisible black tints in midnight.
 * - --color-accent-secondary (66 uses): off-palette lime #7cb36b.
 *
 * They now come from design-system/tokens/colors.json. This test reads the
 * generated tokens.css the page loads and checks each referenced name resolves
 * in both themes to the source value, and that text on the new surfaces (and
 * the new accent as text) passes AA.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(__dirname, '..', '..', '..');
const WEB_ROOT = join(REPO_ROOT, 'apps', 'web');
const TOKENS_CSS = readFileSync(join(WEB_ROOT, 'public', 'design-system', 'tokens.css'), 'utf8');
const AA = 4.5;

type ThemeName = 'midnight' | 'zen';
const THEMES: ThemeName[] = ['midnight', 'zen'];
const NAMES = [
  '--color-background-subtle',
  '--color-background-hover',
  '--color-accent-secondary',
  '--color-ferni',
] as const;

interface ThemeColors {
  background: Record<string, string>;
  text: Record<string, string>;
  accent: Record<string, string>;
}
const colors = JSON.parse(
  readFileSync(join(REPO_ROOT, 'design-system', 'tokens', 'colors.json'), 'utf8')
) as { themes: Record<ThemeName, ThemeColors> };

/** Custom properties declared in top-level rules whose selector list includes `selector`. */
function declaredVars(css: string, selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1].split(',').map((s) => s.trim());
    if (!selectors.includes(selector)) continue;
    for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[d[1]] = d[2].trim();
  }
  return out;
}

/** What an element on <html data-theme="…"> sees: :root, then the theme block. */
function themeVars(theme: ThemeName): Record<string, string> {
  return {
    ...declaredVars(TOKENS_CSS, ':root'),
    ...declaredVars(TOKENS_CSS, `[data-theme="${theme}"]`),
  };
}

/** Resolve var() chains (no fallbacks: a fallback is exactly what this test rules out). */
function resolve(name: string, vars: Record<string, string>, depth = 0): string | undefined {
  const value = vars[name];
  if (value === undefined || depth > 10) return undefined;
  const ref = value.match(/^var\((--[\w-]+)\)$/)?.[1];
  return ref ? resolve(ref, vars, depth + 1) : value;
}

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
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Every source file under apps/web/src plus index.html, read once (the disk can be slow). */
let sources: string[] | undefined;
function allSources(): string[] {
  if (sources) return sources;
  const out: string[] = [readFileSync(join(WEB_ROOT, 'index.html'), 'utf8')];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.(ts|css|html)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name))
        out.push(readFileSync(p, 'utf8'));
    }
  };
  walk(join(WEB_ROOT, 'src'));
  return (sources = out);
}

/** How many source files reference `name` through var(). */
function referenceCount(name: string): number {
  const re = new RegExp(`var\\(${name}[,)\\s]`);
  return allSources().filter((src) => re.test(src)).length;
}

describe('colour tokens the web app references', () => {
  it.each(NAMES)('%s is referenced by the app (so defining it matters)', (name) => {
    expect(referenceCount(name)).toBeGreaterThan(0);
  });

  describe.each(THEMES)('%s', (theme) => {
    const vars = themeVars(theme);

    it.each(NAMES)('%s resolves to a colour without a fallback', (name) => {
      expect(resolve(name, vars), `${name} in ${theme}`).toMatch(HEX);
    });

    it('generated values match design-system/tokens/colors.json', () => {
      const src = colors.themes[theme];
      expect(vars['--color-background-subtle']?.toLowerCase()).toBe(
        src.background.subtle?.toLowerCase()
      );
      expect(vars['--color-background-hover']?.toLowerCase()).toBe(
        src.background.hover?.toLowerCase()
      );
      expect(vars['--color-accent-secondary']?.toLowerCase()).toBe(
        src.accent.secondary?.toLowerCase()
      );
    });

    it.each(['subtle', 'hover'])(
      'primary, secondary and muted text pass AA on background.%s',
      (step) => {
        const src = colors.themes[theme];
        for (const role of ['primary', 'secondary', 'muted']) {
          const ratio = contrast(src.text[role], src.background[step]);
          expect(
            ratio,
            `text.${role} ${src.text[role]} on ${src.background[step]}`
          ).toBeGreaterThanOrEqual(AA);
        }
      }
    );

    it('accent.secondary passes AA as text on every background step', () => {
      const src = colors.themes[theme];
      for (const step of ['primary', 'secondary', 'tertiary', 'elevated', 'subtle', 'hover']) {
        const ratio = contrast(src.accent.secondary, src.background[step]);
        expect(ratio, `${src.accent.secondary} on background.${step}`).toBeGreaterThanOrEqual(AA);
      }
    });

    it('the surface steps are steps of this theme, not the other theme’s', () => {
      // Midnight steps must stay dark and zen steps light, or text flips unreadable.
      const src = colors.themes[theme];
      const dark = theme === 'midnight';
      for (const step of ['subtle', 'hover']) {
        expect(luminance(src.background[step]) < 0.2, `background.${step}`).toBe(dark);
      }
    });
  });
});

describe('fixes that rely on the new tokens', () => {
  const read = (file: string): string => readFileSync(join(WEB_ROOT, file), 'utf8');
  const rule = (file: string, selector: string): string => {
    const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const body = read(file).match(new RegExp(`(?:^|[\\s}])${esc}\\s*\\{([^}]*)\\}`))?.[1];
    if (body === undefined) throw new Error(`no "${selector} {" rule in ${file}`);
    return body;
  };

  it('Ferni hub close button uses the theme surface tokens, not cream literals', () => {
    // A cream fallback rendered a cream circle in midnight; the hover token did not exist.
    expect(rule('src/ui/ferni-hub.ui.ts', '.ferni-hub-close')).toMatch(
      /background:\s*var\(--color-background-subtle\);/
    );
    expect(rule('src/ui/ferni-hub.ui.ts', '.ferni-hub-close:hover')).toMatch(
      /background:\s*var\(--color-background-hover\);/
    );
  });

  it.each(THEMES)('%s: your-people "Check in" badge text passes AA', (theme) => {
    // Was --nayan-primary (undefined, so #b8956a): 2.41:1 zen, 3.77:1 midnight.
    const body = rule('src/ui/your-people.ui.ts', '.yp-nudge-badge.medium');
    expect(body).toMatch(/color:\s*var\(--color-semantic-warning-text\);/);
    expect(body).toMatch(/background:\s*var\(--color-semantic-warning-tint\);/);
    const vars = themeVars(theme);
    const text = resolve('--color-semantic-warning-text', vars) ?? '';
    const surface = resolve('--color-background-elevated', vars) ?? '';
    const tint = vars['--color-semantic-warning-tint']?.match(
      /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/
    );
    expect(tint, 'warning tint is rgba').not.toBeNull();
    const [r, g, b, a] = (tint ?? []).slice(1).map(Number);
    const s = [0, 2, 4].map((i) => parseInt(surface.slice(1 + i, 3 + i), 16));
    const fill = `#${[r, g, b]
      .map((c, i) =>
        Math.round(c * a + s[i] * (1 - a))
          .toString(16)
          .padStart(2, '0')
      )
      .join('')}`;
    expect(contrast(text, fill), `${text} on ${fill}`).toBeGreaterThanOrEqual(AA);
  });

  it('milestone indicator uses brand amber tokens, not a hardcoded orange', () => {
    const src = read('src/ui/unified-indicator.ui.ts');
    expect(src).not.toMatch(/#f59e0b|#d97706/i);
    expect(rule('src/ui/unified-indicator.ui.ts', '.unified-indicator--milestone')).toMatch(
      /var\(--color-natural-warm-amber\)/
    );
  });
});

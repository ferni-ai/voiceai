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
 *
 * Overlay pairs (the gallery probe's dark-theme failures): each pair reads the
 * component's real `color` and `background` declarations and resolves them
 * through the generated tokens.css and inline-styles.css for that theme, so a
 * component that goes back to `color: white` on a light midnight fill fails.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, it, expect } from 'vitest';

const REPO_ROOT = join(__dirname, '..', '..', '..');
const WEB_ROOT = join(REPO_ROOT, 'apps', 'web');
const TOKENS_CSS = join(WEB_ROOT, 'public', 'design-system', 'tokens.css');
const AA_NORMAL_TEXT = 4.5;

interface PersonaColors {
  primary: string;
  onPrimary?: string;
}

interface ThemeColors {
  background: { primary: string };
  text: { primary: string; inverse: string; onAccent?: string };
  accent: { primary: string; hover: string };
  semantic: Record<string, string>;
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

// ---------------------------------------------------------------------------
// Resolve a component's CSS colour the way the page does, per theme.
// ---------------------------------------------------------------------------

type ThemeName = 'midnight' | 'zen';
const THEMES: ThemeName[] = ['midnight', 'zen'];
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Custom properties declared in top-level rules whose selector list includes `selector`. */
function declaredVars(css: string, selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let depth = 0;
  let start = 0;
  let head = '';
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '{') {
      if (depth === 0) {
        head = src.slice(start, i).trim();
        start = i + 1;
      }
      depth++;
    } else if (src[i] === '}') {
      depth--;
      if (depth === 0) {
        const body = src.slice(start, i);
        const selectors = head.split(',').map((s) => s.trim());
        if (!body.includes('{') && selectors.includes(selector)) {
          for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
        }
        start = i + 1;
      }
    } else if (src[i] === ';' && depth === 0) {
      start = i + 1;
    }
  }
  return out;
}

/** Variables in scope for an element under <body data-persona="ferni"> in a theme. */
function themeVars(theme: ThemeName): Record<string, string> {
  const tokensCss = readFileSync(TOKENS_CSS, 'utf8');
  const inlineCss = readFileSync(join(WEB_ROOT, 'src', 'styles', 'inline-styles.css'), 'utf8');
  const t = `[data-theme="${theme}"]`;
  return {
    // set on <html> (tokens.css loads first, inline-styles.css wins)
    ...declaredVars(tokensCss, ':root'),
    ...declaredVars(tokensCss, t),
    ...declaredVars(inlineCss, ':root'),
    ...declaredVars(inlineCss, t),
    // set on <body data-persona="ferni">, which beats anything inherited
    ...declaredVars(tokensCss, '[data-persona="ferni"]'),
    ...declaredVars(tokensCss, `${t} [data-persona="ferni"]`),
  };
}

/** Split on top-level commas only. */
function splitArgs(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  parts.push(cur.trim());
  return parts;
}

type Rgba = [number, number, number, number];

function toRgba(value: string, vars: Record<string, string>, seen = 0): Rgba {
  const v = value.trim();
  if (seen > 20) throw new Error(`var() cycle resolving ${value}`);
  const fn = v.match(/^([\w-]+)\((.*)\)$/s);
  if (fn?.[1] === 'var') {
    const [name, ...fallback] = splitArgs(fn[2]);
    if (vars[name] !== undefined) return toRgba(vars[name], vars, seen + 1);
    if (fallback.length) return toRgba(fallback.join(', '), vars, seen + 1);
    throw new Error(`${name} is not defined and has no fallback`);
  }
  if (fn?.[1] === 'rgba' || fn?.[1] === 'rgb') {
    const [r, g, b, a = '1'] = splitArgs(fn[2]).map((p) => p.trim());
    return [Number(r), Number(g), Number(b), Number(a)];
  }
  if (fn?.[1] === 'color-mix') {
    // color-mix(in srgb, X N%, Y)
    const [, first, second] = splitArgs(fn[2]);
    const pct = Number(first.match(/\s(\d+(?:\.\d+)?)%$/)?.[1] ?? 50) / 100;
    const a = toRgba(first.replace(/\s\d+(?:\.\d+)?%$/, ''), vars, seen + 1);
    const b = toRgba(second, vars, seen + 1);
    return [0, 1, 2, 3].map((i) => a[i] * pct + b[i] * (1 - pct)) as Rgba;
  }
  if (v === 'white') return [255, 255, 255, 1];
  if (v === 'black') return [0, 0, 0, 1];
  if (v === 'transparent') return [0, 0, 0, 0];
  const hex = v.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)?.[1];
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)).concat(1) as Rgba;
  }
  throw new Error(`cannot resolve colour "${value}"`);
}

function over(top: Rgba, under: Rgba): Rgba {
  const a = top[3];
  return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1) as Rgba;
}

function toHex([r, g, b]: Rgba): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

/** The declarations of the rule whose selector is exactly `selector`. */
function ruleBody(file: string, selector: string): string {
  const src = readFileSync(join(WEB_ROOT, file), 'utf8');
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const body = src.match(new RegExp(`(?:^|[\\s}])${esc}\\s*\\{([^}]*)\\}`))?.[1];
  if (body === undefined) throw new Error(`no "${selector} {" rule in ${file}`);
  return body;
}

/** The last declaration of `prop` in `body` (the one the cascade applies). */
function declaration(body: string, prop: 'color' | 'background'): string | undefined {
  const re =
    prop === 'color' ? /(?:^|[;\s])color\s*:\s*([^;]+);/g : /background(?:-color)?\s*:\s*([^;]+);/g;
  return [...body.matchAll(re)].at(-1)?.[1].trim();
}

interface OverlayPair {
  name: string;
  file: string;
  selector: string;
  /** Card surface behind the element, for transparent or translucent fills. */
  surface: string;
  /** Custom properties the component sets from script, by source regex. */
  scriptVars?: Record<string, { file: string; pattern: RegExp }>;
  /** A theme-scoped rule in the same file whose declarations override the base rule. */
  themeSelectors?: Partial<Record<ThemeName, string>>;
}

// Each failure from the overlay gallery probe (midnight, PLAN.md section 0 #6).
const OVERLAY_PAIRS: OverlayPair[] = [
  {
    name: 'error toast',
    file: 'src/ui/moments/styles.ts',
    selector: '.moment-whisper--error',
    surface: '--color-background-primary',
  },
  {
    name: 'warning toast',
    file: 'src/ui/moments/styles.ts',
    selector: '.moment-whisper--warning',
    surface: '--color-background-primary',
  },
  {
    name: 'confirm modal "Forget" button',
    file: 'src/ui/confirm-modal.ui.ts',
    selector: '.confirm-modal-btn--destructive',
    surface: '--color-background-elevated',
  },
  {
    name: 'confirm modal primary button',
    file: 'src/ui/confirm-modal.ui.ts',
    selector: '.confirm-modal-btn--confirm',
    surface: '--color-background-elevated',
  },
  {
    name: '"Allow location" button',
    file: 'src/ui/location-prompt.ui.ts',
    selector: '.ferni-location-prompt-btn--primary',
    surface: '--color-background-elevated',
  },
  {
    name: 'notification "Begin" button',
    file: 'src/ui/notifications.ui.ts',
    selector: '.notification__action',
    surface: '--color-background-elevated',
    scriptVars: {
      '--notification-icon': {
        file: 'src/ui/notifications-copy.ts',
        pattern: /ritual_reminder:\s*\{[^}]*icon:\s*'([^']+)'/,
      },
      '--notification-bg': {
        file: 'src/ui/notifications-copy.ts',
        pattern: /ritual_reminder:\s*\{[^}]*bg:\s*'([^']+)'/,
      },
    },
  },
  {
    name: 'dialog primary button',
    file: 'src/ui/overlay/dialog.styles.ts',
    selector: '.ferni-dialog__button--primary',
    surface: '--color-background-elevated',
  },
  {
    name: 'outreach persona name',
    file: 'src/ui/proactive-outreach.ui.ts',
    selector: '.proactive-outreach__persona',
    surface: '--color-background-elevated',
  },
  {
    name: 'milestone eyebrow',
    file: 'src/ui/moments/styles.ts',
    selector: '.moment-milestone__eyebrow',
    surface: '--color-background-elevated',
  },
  {
    name: 'settings chip "A little something"',
    file: 'src/ui/seeds-display.ui.ts',
    selector: '.seeds-daily-bonus-text',
    surface: '--color-background-secondary',
  },
  {
    name: 'settings chip "My Garden"',
    file: 'src/ui/seeds-display.ui.ts',
    selector: '.seeds-action-btn--primary',
    surface: '--color-background-secondary',
  },
  // Design audit 2026-10-18: midnight 2.96:1 (ink --color-text-inverse on the forest fill).
  {
    name: 'call notice "Try again" button',
    file: 'src/ui/call-status.ui.ts',
    selector: '.call-status__btn--primary',
    surface: '--color-background-primary',
  },
  // Design audit 2026-10-18: the error retry was --color-ferni text on a --color-ferni
  // fill (1.0:1 zen); in midnight the fill token was undefined (2.1:1).
  {
    name: 'wellbeing "Try again?" button',
    file: 'src/ui/wellbeing-dashboard.ui.ts',
    selector: '.wellbeing-btn',
    surface: '--color-background-elevated',
    themeSelectors: { midnight: '[data-theme="midnight"] .wellbeing-btn' },
  },
  {
    name: 'end call button',
    file: 'src/styles/inline-styles.css',
    selector: '#disconnectBtn.btn-end-call',
    surface: '--color-background-primary',
  },
];

/** Rendered text/fill colours and their contrast for one pair in one theme. */
function renderedPair(pair: OverlayPair, theme: ThemeName) {
  const vars = themeVars(theme);
  for (const [name, { file, pattern }] of Object.entries(pair.scriptVars ?? {})) {
    const value = readFileSync(join(WEB_ROOT, file), 'utf8').match(pattern)?.[1];
    if (!value) throw new Error(`${name} not found in ${file}`);
    vars[name] = value;
  }
  const themeSelector = pair.themeSelectors?.[theme];
  // Later declarations win, so the theme rule's body goes after the base rule's.
  const body =
    ruleBody(pair.file, pair.selector) + (themeSelector ? ruleBody(pair.file, themeSelector) : '');
  const surface = toRgba(`var(${pair.surface})`, vars);
  const bgDecl = declaration(body, 'background');
  const fill = bgDecl ? over(toRgba(bgDecl, vars), surface) : surface;
  const colorDecl = declaration(body, 'color');
  if (!colorDecl) throw new Error(`${pair.selector} has no color declaration`);
  const text = over(toRgba(colorDecl, vars), fill);
  const ratio = contrast(toHex(text), toHex(fill));
  return { text: toHex(text), fill: toHex(fill), ratio };
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
    const css = readFileSync(TOKENS_CSS, 'utf8');
    for (const [id, colors] of personas) {
      const kebab = id.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
      const block = css.match(new RegExp(`\\[data-persona="${kebab}"\\] \\{([^}]*)\\}`));
      expect(block, `no [data-persona="${kebab}"] block`).not.toBeNull();
      const onPrimary = block?.[1].match(/--persona-on-primary:\s*([^;]+);/)?.[1].trim();
      expect(onPrimary?.toLowerCase(), id).toBe(colors.onPrimary?.toLowerCase());
    }
  });

  // Text that sits on a theme fill: one on-colour per fill, both themes.
  const ON_FILL: [
    label: string,
    fill: (t: ThemeColors) => string,
    on: (t: ThemeColors) => string | undefined,
  ][] = [
    ['text.onAccent on accent.primary', (t) => t.accent.primary, (t) => t.text.onAccent],
    ['text.onAccent on accent.hover', (t) => t.accent.hover, (t) => t.text.onAccent],
    ['semantic.onError on semantic.error', (t) => t.semantic.error, (t) => t.semantic.onError],
    [
      'semantic.onWarning on semantic.warning',
      (t) => t.semantic.warning,
      (t) => t.semantic.onWarning,
    ],
    [
      'semantic.onSuccess on semantic.success',
      (t) => t.semantic.success,
      (t) => t.semantic.onSuccess,
    ],
    ['semantic.onInfo on semantic.info', (t) => t.semantic.info, (t) => t.semantic.onInfo],
    [
      'semantic.warningText on semantic.warningBg',
      (t) => t.semantic.warningBg,
      (t) => t.semantic.warningText,
    ],
  ];

  describe.each(THEMES)('%s fills', (name) => {
    const theme = tokens.themes[name];

    it.each(ON_FILL)('%s passes AA', (_label, fill, on) => {
      expect(on(theme), 'on-colour must be set explicitly').toMatch(HEX);
      expect(fill(theme)).toMatch(HEX);
      expect(contrast(fill(theme), on(theme) ?? '')).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    });

    it('the warning banner fill is a surface of this theme, not a light tint in dark', () => {
      // Primary text must read on it, so it can't be #fef3cd under paper text in midnight.
      expect(theme.semantic.warningBg).toMatch(HEX);
      expect(contrast(theme.semantic.warningBg, theme.text.primary)).toBeGreaterThanOrEqual(
        AA_NORMAL_TEXT
      );
    });

    it('generated tokens.css carries every on-colour for this theme', () => {
      const vars = declaredVars(readFileSync(TOKENS_CSS, 'utf8'), `[data-theme="${name}"]`);
      const expected: Record<string, string | undefined> = {
        '--color-text-on-accent': theme.text.onAccent,
        '--color-semantic-on-error': theme.semantic.onError,
        '--color-semantic-on-warning': theme.semantic.onWarning,
        '--color-semantic-on-success': theme.semantic.onSuccess,
        '--color-semantic-on-info': theme.semantic.onInfo,
        '--color-semantic-warning-bg': theme.semantic.warningBg,
        '--color-semantic-warning-text': theme.semantic.warningText,
      };
      for (const [cssVar, value] of Object.entries(expected)) {
        expect(value, `${cssVar} source token`).toMatch(HEX);
        expect(vars[cssVar]?.toLowerCase(), cssVar).toBe(value?.toLowerCase());
      }
    });
  });

  it('wellbeing error retry takes its colours from .wellbeing-btn, not an inline colour', () => {
    // An inline `color:` beats the class pair; it was --color-ferni on a --color-ferni fill.
    const src = readFileSync(join(WEB_ROOT, 'src/ui/wellbeing-dashboard.ui.ts'), 'utf8');
    const retry = src.match(
      /<button[^>]*class="wellbeing-btn"[^>]*>\$\{t\('wellbeing\.tryAgain'\)\}/
    )?.[0];
    expect(retry, 'retry button markup').toBeDefined();
    expect(retry).not.toMatch(/style="[^"]*(?:^|[;\s"])color\s*:/);
  });

  const rendered: string[] = [];

  describe.each(THEMES)('%s overlays as rendered', (theme) => {
    it.each(OVERLAY_PAIRS.map((p) => [p.name, p] as const))('%s passes AA', (_name, pair) => {
      const { text, fill, ratio } = renderedPair(pair, theme);
      rendered.push(`| ${theme} | ${pair.name} | ${text} on ${fill} | ${ratio.toFixed(2)}:1 |`);
      expect(ratio, `${pair.selector}: ${text} on ${fill}`).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    });
  });

  afterAll(() => {
    // CONTRAST_REPORT=1 prints the rendered pairs as a markdown table.
    if (process.env.CONTRAST_REPORT === '1') {
      process.stdout.write(
        `\n| theme | pair | text on fill | ratio |\n|---|---|---|---|\n${rendered.join('\n')}\n`
      );
    }
  });
});

/**
 * Design audit 2026-10-18, second batch: text pairs that sat just under AA.
 *
 * Each case reads the component's real CSS rule, resolves its colours through
 * the generated tokens.css for the theme (and persona where the fill is a
 * persona colour), and checks 4.5:1 on the surface it renders on. Opacity on
 * the text's own rule fails the test outright: the audit's misses were mostly
 * muted tokens dimmed further with `opacity`.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB = join(__dirname, '..');
const TOKENS = readFileSync(join(WEB, 'public', 'design-system', 'tokens.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  ''
);
const AA = 4.5;
type Theme = 'midnight' | 'zen';
const THEMES: Theme[] = ['midnight', 'zen'];

const read = (file: string): string => readFileSync(join(WEB, file), 'utf8');

/** Custom properties from TOP-LEVEL rules only: @media blocks (high contrast, forced colours) don't apply. */
function declaredVars(selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  let depth = 0;
  let start = 0;
  let head = '';
  for (let i = 0; i < TOKENS.length; i++) {
    const ch = TOKENS[i];
    if (ch === '{') {
      if (depth === 0) {
        head = TOKENS.slice(start, i).trim();
        start = i + 1;
      }
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const body = TOKENS.slice(start, i);
        if (
          !body.includes('{') &&
          head
            .split(',')
            .map((x) => x.trim())
            .includes(selector)
        ) {
          for (const d of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[d[1]] = d[2].trim();
        }
        start = i + 1;
      }
    } else if (ch === ';' && depth === 0) start = i + 1;
  }
  return out;
}

/** Variables for an element under <html data-theme> and an ancestor with data-persona. */
function vars(theme: Theme, persona = 'ferni'): Record<string, string> {
  return {
    ...declaredVars(':root'),
    ...declaredVars(`[data-theme="${theme}"]`),
    ...declaredVars(`[data-persona="${persona}"]`),
    ...declaredVars(`[data-theme="${theme}"] [data-persona="${persona}"]`),
  };
}

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
function rgba(value: string, v: Record<string, string>, depth = 0): Rgba {
  const s = value.trim();
  if (depth > 20) throw new Error(`cycle at ${value}`);
  const fn = s.match(/^([\w-]+)\((.*)\)$/s);
  if (fn?.[1] === 'var') {
    const [name, ...fb] = splitArgs(fn[2]);
    if (v[name] !== undefined) return rgba(v[name], v, depth + 1);
    if (fb.length) return rgba(fb.join(', '), v, depth + 1);
    throw new Error(`${name} undefined, no fallback`);
  }
  if (fn?.[1] === 'rgba' || fn?.[1] === 'rgb') {
    const [r, g, b, a = '1'] = splitArgs(fn[2]);
    return [Number(r), Number(g), Number(b), Number(a)];
  }
  if (s === 'white') return [255, 255, 255, 1];
  const hex = s.match(/^#([0-9a-fA-F]{6})$/)?.[1];
  if (hex) return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).concat(1) as Rgba;
  throw new Error(`cannot resolve "${value}"`);
}
const over = (top: Rgba, under: Rgba): Rgba =>
  [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1) as Rgba;
function lum([r, g, b]: Rgba): number {
  const c = [r, g, b].map((x) => {
    const y = x / 255;
    return y <= 0.03928 ? y / 12.92 : ((y + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a: Rgba, b: Rgba): number => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** Declarations of the rule whose selector is exactly `selector` (last rule wins per property). */
function rule(file: string, selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const bodies = [...read(file).matchAll(new RegExp(`(?:^|[\\s}])${esc}\\s*\\{([^}]*)\\}`, 'g'))];
  if (!bodies.length) throw new Error(`no "${selector} {" in ${file}`);
  return bodies.map((m) => m[1]).join(';');
}
function decl(body: string, prop: 'color' | 'background' | 'opacity'): string | undefined {
  const re =
    prop === 'color'
      ? /(?:^|[;\s])color\s*:\s*([^;]+);/g
      : prop === 'background'
        ? /background(?:-color)?\s*:\s*([^;]+);/g
        : /(?:^|[;\s])opacity\s*:\s*([^;]+);/g;
  return [...`${body};`.matchAll(re)].at(-1)?.[1].trim();
}

interface Pair {
  name: string;
  file: string;
  selector: string;
  /** Rule applied on top in midnight, if the component has one. */
  midnight?: string;
  surface: string;
  persona?: string;
  /** Must still pass at this opacity (the element sits in a card that fades in). */
  atOpacity?: number;
}

const PAIRS: Pair[] = [
  // was white on lime #7cb36b in midnight, 2.46:1
  {
    name: 'history favourite star',
    file: 'src/ui/conversation-history.ui.ts',
    selector: '.history__favorite-badge',
    midnight: '[data-theme="midnight"] .history__favorite-badge',
    surface: '--color-background-elevated',
  },
  // "MA": white on maya's #a67a6a, 3.72:1
  {
    name: 'history persona initials (maya)',
    file: 'src/ui/conversation-history.ui.ts',
    selector: '.history__session-persona',
    surface: '--color-background-elevated',
    persona: 'maya',
  },
  {
    name: 'history persona initials (ferni)',
    file: 'src/ui/conversation-history.ui.ts',
    selector: '.history__session-persona',
    surface: '--color-background-elevated',
  },
  // muted at opacity .7: 3.06:1 zen, 3.2:1 midnight
  {
    name: 'outreach empty subtext',
    file: 'src/ui/outreach-schedule.ui.ts',
    selector: '.outreach-schedule-empty-subtext',
    surface: '--color-background-elevated',
  },
  // midnight's tab colour rule outranked the active one: #cfc3b4 on #4a6741, 3.66:1
  {
    name: 'notifications active tab',
    file: 'src/ui/notification-settings.ui.ts',
    selector: '.notif-settings__tab--active',
    surface: '--color-background-elevated',
  },
  // muted on the active option tint, 3.99:1 midnight
  {
    name: 'theme description',
    file: 'src/ui/theme-language-settings.ui.ts',
    selector: '.theme-language-settings__theme-desc',
    surface: '--color-background-elevated',
  },
  {
    name: 'language English name',
    file: 'src/ui/theme-language-settings.ui.ts',
    selector: '.theme-language-settings__language-english',
    surface: '--color-background-elevated',
  },
  // muted, dimmed by its container, 4.25:1 midnight
  {
    name: 'billing footer note',
    file: 'src/ui/manage-subscription.ui.ts',
    selector: '.manage-sub__footer-note',
    surface: '--color-background-elevated',
    atOpacity: 0.89, // where the audit caught .manage-sub__card's fade; at rest muted was 4.92:1
  },
  // persona-primary / lime at opacity .85: 4.43:1 zen, 4.35:1 midnight
  {
    name: '"Good morning" eyebrow',
    file: 'src/ui/settings-menu.ui.ts',
    selector: '.settings-menu__header-eyebrow',
    surface: '--color-background-elevated',
  },
];

/** The option tint the theme and language rows sit on when selected. */
const ACTIVE_TINT: Record<string, string> = {
  'theme description': 'var(--color-accent-subtle)',
  'language English name': 'var(--color-accent-subtle)',
};

describe.each(THEMES)('%s', (theme) => {
  it.each(PAIRS.map((p) => [p.name, p] as const))('%s passes AA', (_n, pair) => {
    const v = vars(theme, pair.persona);
    let body = rule(pair.file, pair.selector);
    if (theme === 'midnight' && pair.midnight) body += `;${rule(pair.file, pair.midnight)}`;
    expect(
      decl(body, 'opacity'),
      `${pair.selector} must not dim its text with opacity`
    ).toBeUndefined();
    let fill = rgba(`var(${pair.surface})`, v);
    if (ACTIVE_TINT[pair.name]) fill = over(rgba(ACTIVE_TINT[pair.name], v), fill);
    const bg = decl(body, 'background');
    if (bg) fill = over(rgba(bg, v), fill);
    const color = decl(body, 'color');
    expect(color, `${pair.selector} color`).toBeDefined();
    const text = rgba(color ?? '', v);
    text[3] *= pair.atOpacity ?? 1;
    const r = ratio(over(text, fill), fill);
    expect(r, `${pair.name} in ${theme}`).toBeGreaterThanOrEqual(AA);
  });

  it('game difficulty labels pass AA on the hovered card', () => {
    // "easy" was --color-success: 4.12:1 on the zen card hover (#ebe6df)
    const src = read('src/ui/game-picker.ui.ts');
    const block = src.match(/difficultyColors[^{]*\{([^}]*)\}/)?.[1] ?? '';
    const colours = [...block.matchAll(/(\w+):\s*'([^']+)'/g)].map((m) => [m[1], m[2]] as const);
    expect(colours.map(([k]) => k).sort()).toEqual(['easy', 'hard', 'medium']);
    const v = vars(theme);
    for (const surface of ['--color-background-elevated', '--color-background-tertiary']) {
      const bg = rgba(`var(${surface})`, v);
      for (const [level, colour] of colours) {
        expect(ratio(rgba(colour, v), bg), `${level} on ${surface}`).toBeGreaterThanOrEqual(AA);
      }
    }
  });

  it('"Poor connection" uses the error colour at full strength', () => {
    // The warning pulse faded the whole pill to 0.7, taking the label to 3.95:1 in zen.
    const src = read('src/ui/connection-quality.ui.ts');
    const pulsed = src.match(/([^{}]+)\{\s*animation:\s*quality-pulse/)?.[1].trim() ?? '';
    expect(pulsed, 'pulse targets the bars, not the pill').toMatch(/\.connection-quality__bars$/);
    const v = vars(theme);
    const err = rgba('var(--color-semantic-error)', v);
    expect(ratio(err, rgba('var(--color-background-elevated)', v))).toBeGreaterThanOrEqual(AA);
  });
});

describe('notifications tabs in midnight', () => {
  it('the midnight tab colour rule does not override the active tab', () => {
    // `[data-theme="midnight"] .notif-settings__tab` outranks `.notif-settings__tab--active`,
    // which put #cfc3b4 on the #4a6741 fill (3.66:1).
    const src = read('src/ui/notification-settings.ui.ts');
    const colourRules = [
      ...src.matchAll(
        /(\[data-theme="midnight"\] \.notif-settings__tab[^{,]*)\{[^}]*(?:^|[;\s])color\s*:/gm
      ),
    ].map((m) => m[1].trim());
    expect(colourRules.length).toBeGreaterThan(0);
    for (const sel of colourRules)
      expect(sel).toMatch(/:not\(\.notif-settings__tab--active\)|--active/);
  });
});

describe('language list', () => {
  it('shows plain text, not flag emojis', () => {
    const regionalIndicator = /[\u{1F1E6}-\u{1F1FF}]/u;
    expect(read('src/i18n/index.ts')).not.toMatch(regionalIndicator);
    for (const file of ['src/ui/settings-menu.ui.ts', 'src/ui/theme-language-settings.ui.ts']) {
      const src = read(file);
      expect(src, file).not.toMatch(/\.flag\b/);
      expect(src, file).toMatch(/__language-tag" aria-hidden="true">\$\{/);
    }
  });
});

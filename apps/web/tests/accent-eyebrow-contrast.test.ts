/**
 * Accent, eyebrow and persona-fill contrast (midnight)
 *
 * Three ways midnight text fell under WCAG AA in the 2026-10-12 visual hunt:
 * - `color: white` on an accent fill. Midnight's accent is a light sage
 *   (#8eae7a), so white on it is 2.47:1. --color-text-on-accent is the ink the
 *   token set chose for that fill (7.6:1).
 * - Eyebrow labels coloured with --persona-primary / --color-ferni, a dark
 *   green that stays #4a6741 in midnight: 1.95-2.1:1 on the #352e28 card.
 *   --persona-text is the persona colour for text, with a midnight override.
 * - Long-id persona blocks (`maya-santos`, ...) in inline-styles.css set a
 *   fill but no --persona-on-primary, so light fills inherited Ferni's white.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it, expect } from 'vitest';

const WEB_ROOT = join(__dirname, '..');
const read = (rel: string): string => readFileSync(join(WEB_ROOT, rel), 'utf8');
const AA = 4.5;

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

/** `{ selector-list: body }` for every flat rule; `${...}` interpolations masked out. */
function rules(source: string): { head: string; body: string; line: number }[] {
  const src = source.replace(/\$\{[^{}]*\}/g, (m) => '_'.repeat(m.length));
  const out: { head: string; body: string; line: number }[] = [];
  // A flat rule is a `{` whose next brace is `}`; its head runs back to the previous brace.
  let last = -1;
  let headStart = 0;
  let line = 1;
  let openLine = 1;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '\n') line++;
    else if (ch === '{') {
      headStart = last + 1;
      last = i;
      openLine = line;
    } else if (ch === '}') {
      if (src[last] === '{') {
        out.push({
          head: src.slice(headStart, last).replace(/\/\*[\s\S]*?\*\//g, '').trim(),
          body: src.slice(last + 1, i),
          line: openLine,
        });
      }
      last = i;
    }
  }
  return out;
}

function vars(source: string, selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rules(source)) {
    if (!r.head.split(',').map((s) => s.trim()).includes(selector)) continue;
    for (const m of r.body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  }
  return out;
}

/** Resolves `var(--x, fallback)` chains down to a #rrggbb hex. */
function resolve(value: string, scope: Record<string, string>, depth = 0): string {
  const v = value.trim();
  if (depth > 20) throw new Error(`cycle resolving ${value}`);
  const m = v.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/s);
  if (m) {
    if (scope[m[1]] !== undefined) return resolve(scope[m[1]], scope, depth + 1);
    if (m[2]) return resolve(m[2], scope, depth + 1);
    throw new Error(`${m[1]} is not defined`);
  }
  if (v === 'white') return '#ffffff';
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  throw new Error(`cannot resolve "${value}"`);
}

const tokensCss = read('public/design-system/tokens.css');
const inlineCss = read('src/styles/inline-styles.css');

/** What an element under <html data-theme="midnight"><body data-persona="ferni"> sees. */
const midnight: Record<string, string> = {
  ...vars(tokensCss, ':root'),
  ...vars(tokensCss, '[data-theme="midnight"]'),
  ...vars(inlineCss, ':root'),
  ...vars(tokensCss, '[data-persona="ferni"]'),
  ...vars(tokensCss, '[data-theme="midnight"] [data-persona="ferni"]'),
};

function colorOf(file: string, selector: string): string {
  const rule = rules(read(file)).find((r) => r.head.split(',').map((s) => s.trim()).includes(selector));
  const decl = rule?.body.match(/(?:^|[;\s])color\s*:\s*([^;]+);/)?.[1];
  if (!decl) throw new Error(`no color for ${selector} in ${file}`);
  return decl.trim();
}

const ACCENT_FILL = /background(?:-color)?\s*:\s*var\(--color-accent(?:-primary)?\s*[,)]/;
const WHITE_TEXT = /(?:^|[;{\s])color\s*:\s*(?:white|#fff\b|#ffffff\b)/i;

function whiteOnAccent(file: string): string[] {
  return rules(readFileSync(file, 'utf8'))
    .filter((r) => ACCENT_FILL.test(r.body) && WHITE_TEXT.test(r.body))
    .map((r) => `${relative(WEB_ROOT, file)}:${r.line} ${r.head.split('\n').pop()?.trim()}`);
}

describe('text on accent fills', () => {
  it('flags white text on an accent fill (scanner sanity check)', () => {
    const fixture = `.a { background: var(--color-accent-primary, #2d5a3d); color: white; }
.b { background: var(--color-accent-subtle); color: white; }
.c { background: var(--color-accent, #3d5a45); padding: \${GAP}px; color: #fff; }`;
    const found = rules(fixture).filter((r) => ACCENT_FILL.test(r.body) && WHITE_TEXT.test(r.body));
    expect(found.map((r) => r.head)).toEqual(['.a', '.c']);
  });

  it('midnight accent needs dark text: white fails AA, the on-accent token passes', () => {
    const accent = resolve('var(--color-accent-primary)', midnight);
    expect(contrast('#ffffff', accent)).toBeLessThan(AA);
    expect(contrast(resolve('var(--color-text-on-accent)', midnight), accent)).toBeGreaterThanOrEqual(AA);
  });

  it('no app rule paints white text on an accent fill', () => {
    const files = readdirSync(join(WEB_ROOT, 'src'), { recursive: true, encoding: 'utf8' })
      .filter((f) => /\.(ts|css)$/.test(f) && !f.includes('__tests__'))
      .map((f) => join(WEB_ROOT, 'src', f));
    expect(files.length).toBeGreaterThan(100);
    expect(files.flatMap(whiteOnAccent)).toEqual([]);
  });
});

describe('eyebrow labels in midnight', () => {
  const card = resolve('var(--color-background-elevated)', midnight);
  const LABELS: [file: string, selector: string][] = [
    ['src/ui/manage-subscription.ui.ts', '.manage-sub__eyebrow'],
    ['src/ui/vibe-controller.ui.ts', '.vibe-header__eyebrow'],
    ['src/ui/household-manager.ui.ts', '.household-modal__eyebrow'],
    ['src/ui/family-identities.ui.ts', '.family-modal__eyebrow'],
    ['src/ui/your-people.ui.ts', '.yp-eyebrow'],
    ['src/ui/your-people.ui.ts', '.yp-nudges-header'],
    ['src/ui/personalize.ui.ts', '.personalize-item-status.equipped'],
    ['src/ui/ferni-fund.styles.ts', '.ferni-fund-stat-value'],
  ];

  it.each(LABELS)('%s %s passes AA on the midnight card', (file, selector) => {
    expect(contrast(resolve(colorOf(file, selector), midnight), card)).toBeGreaterThanOrEqual(AA);
  });
});

describe('persona fills', () => {
  const fillBlocks = rules(inlineCss).filter(
    (r) => /^\[data-persona='[\w-]+'\]/.test(r.head) && /--persona-primary\s*:/.test(r.body)
  );

  it('finds the long-id persona blocks (sanity check)', () => {
    expect(fillBlocks.map((r) => r.head).join(' ')).toContain("[data-persona='maya-santos']");
  });

  it.each(fillBlocks.map((r) => [r.head.split(',')[0].trim(), r] as const))(
    '%s text on its own fill passes AA',
    (_head, block) => {
      // Ferni's white is what a block without its own on-primary inherits from <body>.
      const scope = { ...midnight, ...vars(inlineCss, block.head.split(',')[0].trim()) };
      const fill = resolve('var(--persona-primary)', scope);
      expect(contrast(resolve('var(--persona-on-primary)', scope), fill)).toBeGreaterThanOrEqual(AA);
    }
  );

  it('unlock-progress initials sit on the persona fill in its on-primary colour', () => {
    const avatar = rules(read('src/ui/marketplace/styles/team.ts')).find((r) => r.head === '.team-progress-avatar');
    expect(avatar?.body).toMatch(/background\s*:\s*var\(--persona-primary\)/);
    expect(avatar?.body).toMatch(/(?:^|[;\s])color\s*:\s*var\(--persona-on-primary\)/);
  });
});

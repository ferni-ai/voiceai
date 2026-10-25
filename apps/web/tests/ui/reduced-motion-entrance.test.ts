/**
 * Reduce Motion must never hide the home screen.
 *
 * Design audit 2026-10-18: with "Reduce Motion" on, the Connect button had a
 * computed opacity of 0. `.app-loaded .entrance-controls { opacity: 0 }` starts
 * the controls hidden and lets the entrance animation reveal them; the
 * reduced-motion block turned that animation off and set `opacity: 1` on the
 * plain `.entrance-controls` selector, which loses to `.app-loaded …` on
 * specificity. Nothing revealed the button.
 *
 * jsdom can't evaluate media queries or run animations, so this test runs the
 * cascade itself over the real stylesheets, in the order index.html loads them:
 * for each entrance element it finds every rule that matches, keeps the ones
 * whose media applies, and picks the winning `opacity` and `animation` by
 * importance, specificity and order. Under reduced motion every entrance
 * element must end up animation-free and fully opaque.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB = resolve(__dirname, '../..');
// Load order from index.html: tokens.css first, inline-styles.css later.
const SHEETS = ['public/design-system/tokens.css', 'src/styles/inline-styles.css'];

interface Rule {
  selectors: string[];
  decls: Array<{ prop: string; value: string; important: boolean }>;
  media: string | null;
  order: number;
}

/** Style rules of a stylesheet, with the @media prelude each sits under. */
function parseRules(css: string, startOrder: number): Rule[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: Rule[] = [];
  let order = startOrder;
  const walk = (text: string, media: string | null): void => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf('{', i);
      if (open < 0) return;
      const prelude = text.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      for (; j < text.length && depth > 0; j++) {
        if (text[j] === '{') depth++;
        else if (text[j] === '}') depth--;
      }
      const body = text.slice(open + 1, j - 1);
      i = j;
      if (prelude.startsWith('@media')) {
        walk(body, prelude.slice('@media'.length).trim());
      } else if (!prelude.startsWith('@')) {
        const decls = body
          .split(';')
          .map((d) => d.trim())
          .filter((d) => d.includes(':'))
          .map((d) => {
            const k = d.indexOf(':');
            const raw = d.slice(k + 1).trim();
            return {
              prop: d.slice(0, k).trim().toLowerCase(),
              value: raw.replace(/\s*!important$/i, '').trim(),
              important: /!important$/i.test(raw),
            };
          });
        out.push({
          selectors: prelude.split(',').map((s) => s.trim()),
          decls,
          media,
          order: order++,
        });
      }
      // @keyframes, @font-face, @supports … are skipped
    }
  };
  walk(src, null);
  return out;
}

interface Node {
  tag: string;
  id?: string;
  classes: string[];
}

/** Matches one compound selector (tag, #id, .class only) against a node. */
function matchesCompound(compound: string, node: Node): boolean | null {
  if (/[:[\]>+~*]/.test(compound)) return null; // outside this simulator; not counted
  const tag = compound.match(/^[a-z][\w-]*/i)?.[0];
  if (tag && tag.toLowerCase() !== node.tag) return false;
  for (const m of compound.matchAll(/#([\w-]+)/g)) if (node.id !== m[1]) return false;
  for (const m of compound.matchAll(/\.([\w-]+)/g)) if (!node.classes.includes(m[1])) return false;
  return true;
}

/** Descendant-combinator selector match against an ancestor chain (target last). */
function matches(selector: string, chain: Node[]): boolean {
  const parts = selector.split(/\s+/).filter(Boolean);
  if (parts.some((p) => matchesCompound(p, chain[0]) === null)) return false;
  if (!matchesCompound(parts[parts.length - 1], chain[chain.length - 1])) return false;
  let at = chain.length - 2;
  for (let p = parts.length - 2; p >= 0; p--) {
    while (at >= 0 && !matchesCompound(parts[p], chain[at])) at--;
    if (at < 0) return false;
    at--;
  }
  return true;
}

function specificity(selector: string): [number, number, number] {
  const ids = (selector.match(/#[\w-]+/g) ?? []).length;
  const classes = (selector.match(/\.[\w-]+/g) ?? []).length;
  const tags = selector.split(/\s+/).filter((p) => /^[a-z]/i.test(p)).length;
  return [ids, classes, tags];
}

function mediaApplies(media: string | null, reducedMotion: boolean): boolean {
  if (media === null) return true;
  if (/prefers-reduced-motion:\s*reduce/.test(media)) return reducedMotion;
  if (/prefers-reduced-motion:\s*no-preference/.test(media)) return !reducedMotion;
  return false; // viewport, contrast, print …: not part of this scenario
}

const ALL_RULES = (() => {
  let order = 0;
  return SHEETS.flatMap((file) => {
    const rules = parseRules(readFileSync(resolve(WEB, file), 'utf8'), order);
    order += rules.length;
    return rules;
  });
})();

/** Lexicographic compare: importance, then specificity (a, b, c), then source order. */
function compareKeys(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/** The declared value of `prop` that wins the cascade for the element at the end of `chain`. */
function winning(chain: Node[], prop: string, reducedMotion: boolean): string | undefined {
  let best: { value: string; key: number[] } | undefined;
  for (const rule of ALL_RULES) {
    if (!mediaApplies(rule.media, reducedMotion)) continue;
    const matched = rule.selectors.filter((s) => matches(s, chain));
    if (!matched.length) continue;
    const spec = matched
      .map(specificity)
      .sort((a, b) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2])[0];
    for (const d of rule.decls) {
      if (d.prop !== prop) continue;
      const key = [d.important ? 1 : 0, ...spec, rule.order];
      const wins = !best || compareKeys(key, best.key) > 0;
      if (wins) best = { value: d.value, key };
    }
  }
  return best?.value;
}

const html: Node = { tag: 'html', classes: [] };
const body: Node = { tag: 'body', classes: ['app-loaded'] };
const main: Node = { tag: 'main', classes: ['coach-container'] };

// The entrance elements as index.html marks them up, under <body class="app-loaded">.
const ENTRANCE: Array<[name: string, chain: Node[]]> = [
  ['avatar', [html, body, main, { tag: 'div', classes: ['avatar-container', 'entrance-avatar'] }]],
  [
    'persona name',
    [html, body, main, { tag: 'h1', id: 'personaName', classes: ['entrance-name'] }],
  ],
  [
    'subtitle',
    [html, body, main, { tag: 'p', id: 'personaSubtitle', classes: ['entrance-subtitle'] }],
  ],
  ['roster', [html, body, main, { tag: 'div', id: 'teamRoster', classes: ['entrance-roster'] }]],
  [
    'roster avatar',
    [
      html,
      body,
      main,
      { tag: 'div', id: 'teamRoster', classes: ['entrance-roster'] },
      { tag: 'button', classes: ['team-member'] },
    ],
  ],
  [
    'waveform',
    [html, body, main, { tag: 'div', id: 'waveformContainer', classes: ['entrance-waveform'] }],
  ],
  [
    'controls (Connect)',
    [html, body, main, { tag: 'div', classes: ['controls-row', 'entrance-controls'] }],
  ],
  ['helper text', [html, body, main, { tag: 'p', id: 'helperText', classes: ['entrance-helper'] }]],
];

describe('cascade simulator (sanity)', () => {
  it('reproduces the original bug shape: with motion on, the controls start hidden and an animation reveals them', () => {
    const controls = ENTRANCE.find(([n]) => n.startsWith('controls'))![1];
    expect(winning(controls, 'opacity', false)).toBe('0');
    expect(winning(controls, 'animation', false)).toMatch(/entranceSlideUp/);
  });
});

describe('entrance elements under prefers-reduced-motion: reduce', () => {
  it.each(ENTRANCE)('%s: no entrance animation and visible', (_name, chain) => {
    expect(winning(chain, 'animation', true)).toBe('none');
    const opacity = winning(chain, 'opacity', true);
    // Undefined means nothing sets it (initial value 1). The idle waveform's
    // deliberate 0.8 dim (#waveformContainer) is visible; the bug was 0.
    if (opacity !== undefined) expect(Number(opacity)).toBeGreaterThanOrEqual(0.8);
  });
});

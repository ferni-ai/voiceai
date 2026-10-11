/**
 * Touch input size guard
 *
 * iOS Safari zooms into a focused field whose font size is under 16px, and
 * with pinch zoom enabled the page stays zoomed. src/styles/touch-input-size.css
 * puts a 16px floor under every text field on a coarse pointer. These tests
 * check the floor exists and is loaded, and that its :not() list names every
 * field styled larger than 16px, so the floor never shrinks one.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const WEB_ROOT = join(__dirname, '..');
const SRC = join(WEB_ROOT, 'src');
const STYLESHEET = 'src/styles/touch-input-size.css';
const IOS_NO_ZOOM_PX = 16;

const css = readFileSync(join(WEB_ROOT, STYLESHEET), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The body of the `@media (pointer: coarse)` block, or '' when it is missing. */
function coarseBlock(source: string): string {
  const start = source.search(/@media\s*\(pointer:\s*coarse\)\s*\{/);
  if (start < 0) return '';
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(open + 1, i);
  }
  return '';
}

/** Top-level selectors of a selector list (commas inside :not() don't split). */
function splitSelectors(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of list) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(current.trim());
      current = '';
    } else current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

function toPx(value: string): number | null {
  const v = value.trim();
  const textToken = v.match(/^var\(--text-(\w+)/);
  // Upper end of each fluid --text-* clamp (inline-styles.css), the largest it renders.
  const tokenMax: Record<string, number> = {
    '2xs': 11,
    xs: 12,
    sm: 14,
    base: 16,
    md: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
  };
  if (textToken) return tokenMax[textToken[1]] ?? null;
  const unit = v.match(/^([\d.]+)(px|rem|em)\b/);
  if (!unit) return null;
  return unit[2] === 'px' ? Number(unit[1]) : Number(unit[1]) * 16;
}

function sourceFiles(): Array<{ path: string; text: string }> {
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.(ts|css)$/.test(f))
    .map((f) => ({
      path: f,
      // Drop ${...} template expressions so their braces don't break rule parsing.
      text: readFileSync(join(SRC, f), 'utf8').replace(/\$\{[^{}]*\}/g, 'X'),
    }));
}

/** Every innermost `selector { body }` rule, in one linear pass (a regex backtracks badly on big files). */
function rules(text: string): Array<{ selector: string; body: string }> {
  const out: Array<{ selector: string; body: string }> = [];
  for (const chunk of text.split('}')) {
    const open = chunk.lastIndexOf('{');
    if (open < 0) continue;
    const head = chunk.slice(0, open);
    const selector = head.slice(Math.max(head.lastIndexOf('{'), head.lastIndexOf(';')) + 1).trim();
    out.push({ selector, body: chunk.slice(open + 1) });
  }
  return out;
}

/** Classes given font sizes over 16px that are applied to an <input>, <textarea> or <select>. */
function largeFieldClasses(): string[] {
  const files = sourceFiles();
  const fieldClasses = new Set<string>();
  for (const { text } of files) {
    for (const tag of text.matchAll(/<(?:input|textarea|select)\b[^>]*?class="([^"]*)"/g)) {
      tag[1].split(/\s+/).forEach((c) => c && fieldClasses.add(c));
    }
  }
  const large = new Set<string>();
  for (const { text } of files) {
    for (const rule of rules(text)) {
      const size = rule.body.match(/(?:^|[;\s])font-size:\s*([^;]+);/);
      const px = size ? toPx(size[1]) : null;
      if (px === null || px <= IOS_NO_ZOOM_PX) continue;
      for (const selector of rule.selector.split(',')) {
        const last = selector.trim().match(/\.([\w-]+)$/);
        if (last && fieldClasses.has(last[1])) large.add(last[1]);
      }
    }
  }
  return [...large].sort();
}

describe('touch input size (iOS focus zoom)', () => {
  const block = coarseBlock(css);
  const rule = block.match(/([^{}]+)\{([^{}]*)\}/);
  const selectors = rule ? splitSelectors(rule[1]) : [];
  const inputSelector = selectors.find((s) => s.startsWith('input')) ?? '';

  it('is loaded by index.html', () => {
    const html = readFileSync(join(WEB_ROOT, 'index.html'), 'utf8');
    expect(html).toContain(`<link rel="stylesheet" href="/${STYLESHEET}" />`);
  });

  it('sets text fields to at least 16px on a coarse pointer, over component styles', () => {
    expect(block, 'no @media (pointer: coarse) block').not.toBe('');
    const size = rule?.[2].match(/font-size:\s*([^;!]+)\s*!important/);
    expect(size, 'font-size must be !important to beat component class selectors').not.toBeNull();
    expect(toPx(size?.[1] ?? '')).toBeGreaterThanOrEqual(IOS_NO_ZOOM_PX);
    expect(selectors.some((s) => s.startsWith('input'))).toBe(true);
    expect(selectors).toContain('textarea');
    expect(selectors).toContain('select');
  });

  it('still covers text-like inputs', () => {
    for (const type of [
      'text',
      'search',
      'email',
      'password',
      'tel',
      'url',
      'number',
      'date',
      'time',
    ]) {
      expect(inputSelector).not.toContain(`[type='${type}']`);
    }
  });

  it('finds the large fields it must leave alone (scanner sanity check)', () => {
    expect(largeFieldClasses()).toContain('rb-input--lg');
  });

  it('excludes every field styled larger than 16px, so the floor never shrinks it', () => {
    const missing = largeFieldClasses().filter((cls) => !inputSelector.includes(`.${cls}`));
    expect(missing).toEqual([]);
  });
});

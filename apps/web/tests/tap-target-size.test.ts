/**
 * Tap target size guard
 *
 * src/styles/tap-target-size.css gives small controls a 44x44px touch target
 * on a coarse pointer (WCAG 2.5.5, Apple HIG). At 390px the visual hunt
 * measured confirm-modal buttons 37px tall, onboarding buttons 40px, the
 * journey indicator 40x40, personalize chips 18px and Your People chips 28px.
 * These tests check the floor exists, is loaded, covers each of those
 * controls, and that every selector it names is still a real component class.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const WEB_ROOT = join(__dirname, '..');
const STYLESHEET = 'src/styles/tap-target-size.css';
const MIN_TARGET_PX = 44;

const css = existsSync(join(WEB_ROOT, STYLESHEET))
  ? readFileSync(join(WEB_ROOT, STYLESHEET), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  : '';

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

/** Declarations that apply to `selector` inside the coarse-pointer block. */
function declarationsFor(selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of coarseBlock(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!m[1].split(',').map((s) => s.trim()).includes(selector)) continue;
    for (const d of m[2].matchAll(/([\w-]+)\s*:\s*([^;]+);/g)) out[d[1]] = d[2].trim();
  }
  return out;
}

/** Smallest px a `max(100%, Npx)` / `Npx` size can be. */
function floorPx(value: string | undefined): number {
  const px = value?.match(/(\d+(?:\.\d+)?)px/);
  return px ? Number(px[1]) : 0;
}

describe('tap target size', () => {
  it('is loaded by the app shell', () => {
    expect(readFileSync(join(WEB_ROOT, 'index.html'), 'utf8')).toContain(`href="/${STYLESHEET}"`);
  });

  it.each(['.confirm-modal-btn', '.onboarding__btn', '.personalize-category-btn', '.yp-filter'])(
    '%s is at least 44x44 on a coarse pointer',
    (selector) => {
      const d = declarationsFor(selector);
      expect(floorPx(d['min-height'])).toBeGreaterThanOrEqual(MIN_TARGET_PX);
      expect(floorPx(d['min-width'])).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    }
  );

  it('the journey indicator keeps its size but gets a 44x44 hit area', () => {
    const d = declarationsFor('.unified-indicator::after');
    expect(d.content).toBe("''");
    expect(d.position).toBe('absolute');
    expect(floorPx(d.width)).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    expect(floorPx(d.height)).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    expect(declarationsFor('.unified-indicator')).toEqual({});
  });

  it('names only classes that a component still styles', () => {
    const classes = [...new Set([...coarseBlock(css).matchAll(/\.([\w-]+)/g)].map((m) => m[1]))];
    expect(classes.length).toBeGreaterThan(0);
    const src = readdirSync(join(WEB_ROOT, 'src', 'ui'), { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.ts'))
      .map((f) => readFileSync(join(WEB_ROOT, 'src', 'ui', f), 'utf8'))
      .join('\n');
    expect(classes.filter((c) => !new RegExp(`\\.${c}[\\s{,:.]`).test(src))).toEqual([]);
  });
});

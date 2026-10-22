/**
 * Tap target size guard
 *
 * src/styles/tap-target-size.css gives small controls a 48x48px touch target
 * on a coarse pointer (Material 48dp; the Android app wraps this web app). The
 * 2026-10-20 mobile web audit measured 69 controls under 48, the worst 14px
 * tall. These tests check the floor exists, is loaded, reaches 48 for each
 * control by one of its three methods (grow, hit box, inline padding), and
 * that every selector it names is still a real component class.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const WEB_ROOT = join(__dirname, '..');
const STYLESHEET = 'src/styles/tap-target-size.css';
const MIN_TARGET_PX = 48;

const css = existsSync(join(WEB_ROOT, STYLESHEET))
  ? readFileSync(join(WEB_ROOT, STYLESHEET), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  : '';

/** Buttons that grow to the floor. */
const GROWN = [
  '.confirm-modal-btn',
  '.onboarding__btn',
  '.personalize-category-btn',
  '.yp-filter',
  '.memory-lane-modal__tab',
  '.data-export__format-btn',
  '.data-export__btn',
  '.settings-menu__section-header',
  '.call-status__btn',
  '.waiting-screen__btn',
  '.moment-milestone__button',
  '.ferni-hub-problem-action',
  '.after-call-close',
  '.data-export__close',
  '.ferni-hub-close',
  '.ferni-modal__close',
  '.memory-lane-modal__close',
  '.moment-milestone__close',
  '.personalize-close',
  '.your-story__close',
  '.theme-language-settings__close',
];

/** Controls that keep their look and get a ::after hit box; the first two are already positioned. */
const ALREADY_POSITIONED = ['.unified-indicator', '.mobile-menu-trigger'];
const HIT_BOXED = [
  ...ALREADY_POSITIONED,
  '.settings-menu__close',
  '.team-member-card__action',
  '.personalize-item-action',
  '.after-call-support',
  '.data-export__delete-account',
  '.offline-banner__retry',
];

/** Links inside a sentence that get vertical padding. */
const INLINE_LINKS = ['.sign-in-gate-footer a', '.data-export__privacy-link'];

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

/** Declarations that apply to `selector` inside the coarse-pointer block (later rules win). */
function declarationsFor(selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of coarseBlock(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!m[1].split(',').map((s) => s.trim()).includes(selector)) continue;
    for (const d of m[2].matchAll(/([\w-]+)\s*:\s*([^;]+);/g)) out[d[1]] = d[2].trim();
  }
  return out;
}

/** Smallest px a `max(100%, Npx)` / `Npx` / `Npx !important` size can be. */
function floorPx(value: string | undefined): number {
  const px = value?.match(/(\d+(?:\.\d+)?)px/);
  return px ? Number(px[1]) : 0;
}

describe('tap target size', () => {
  it('is loaded by the app shell', () => {
    expect(readFileSync(join(WEB_ROOT, 'index.html'), 'utf8')).toContain(`href="/${STYLESHEET}"`);
  });

  it.each(GROWN)('%s grows to at least 48x48 on a coarse pointer, over component minimums', (selector) => {
    const d = declarationsFor(selector);
    expect(floorPx(d['min-height'])).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    expect(floorPx(d['min-width'])).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    // Components inject their own 44px minimums after this sheet.
    expect(d['min-height']).toMatch(/!important$/);
    expect(d['min-width']).toMatch(/!important$/);
  });

  it.each(HIT_BOXED)('%s keeps its size but gets a 48x48 hit box', (selector) => {
    const d = declarationsFor(`${selector}::after`);
    expect(d.content).toBe("''");
    expect(d.position).toBe('absolute');
    expect(floorPx(d.width)).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    expect(floorPx(d.height)).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    const host = declarationsFor(selector);
    expect(host['min-width']).toBeUndefined();
    expect(host['min-height']).toBeUndefined();
    if (ALREADY_POSITIONED.includes(selector)) expect(host.position).toBeUndefined();
    else expect(host.position).toBe('relative');
  });

  it.each(INLINE_LINKS)('%s gets a 48px tall hit area without moving the text', (selector) => {
    const d = declarationsFor(selector);
    const pad = d.padding?.match(/^calc\(\(\s*(\d+)px\s*-\s*1em\s*\)\s*\/\s*2\)\s+(.+)$/);
    expect(pad, `padding was ${d.padding}`).not.toBeNull();
    expect(Number(pad![1])).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    // Inline padding is cancelled by an equal negative margin; vertical margin stays 0.
    expect(d.margin).toBe(`0 calc(-1 * ${pad![2]})`);
    expect(d.position).toBe('relative');
  });

  it('the export checkbox row (its label) is at least 48px tall', () => {
    expect(floorPx(declarationsFor('.data-export__category')['min-height'])).toBeGreaterThanOrEqual(MIN_TARGET_PX);
  });

  it('sets no size under the floor anywhere in the coarse block', () => {
    const sizes = [...coarseBlock(css).matchAll(/(?:min-)?(?:width|height)\s*:\s*([^;]+);/g)].map((m) => m[1]);
    expect(sizes.length).toBeGreaterThan(0);
    expect(sizes.filter((v) => floorPx(v) < MIN_TARGET_PX)).toEqual([]);
  });

  it('names only classes that a component still styles', () => {
    const classes = [...new Set([...coarseBlock(css).matchAll(/\.([\w-]+)/g)].map((m) => m[1]))];
    expect(classes.length).toBeGreaterThan(0);
    const src = ['ui', 'components']
      .flatMap((dir) =>
        readdirSync(join(WEB_ROOT, 'src', dir), { recursive: true, encoding: 'utf8' })
          .filter((f) => f.endsWith('.ts'))
          .map((f) => readFileSync(join(WEB_ROOT, 'src', dir, f), 'utf8'))
      )
      .join('\n');
    expect(classes.filter((c) => !new RegExp(`\\.${c}[\\s{,:.]`).test(src))).toEqual([]);
  });
});

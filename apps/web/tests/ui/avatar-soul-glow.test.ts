/**
 * Avatar soul halo and grain: one engine per property.
 *
 * - The halo pulse used to tween an uninitialised `--pulse-scale` with GSAP,
 *   so it strobed from ~0 to 1.05. It is now a CSS animation on the `scale`
 *   property that starts at 1.
 * - setGlowBleed animated width/height (a layout per frame) and wrote a
 *   transform that dropped the pulse. It now animates scale and opacity only.
 * - GSAP and the CSS grainBreath loop both drove the grain's
 *   background-position; the GSAP tween is gone.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface TweenCall {
  method: 'to' | 'set' | 'fromTo';
  target: unknown;
  vars: Record<string, unknown>;
}
const calls: TweenCall[] = [];

function timeline(): Record<string, unknown> {
  const tl: Record<string, unknown> = {};
  for (const method of ['to', 'set', 'fromTo'] as const) {
    tl[method] = (target: unknown, vars: Record<string, unknown>, more?: unknown) => {
      const last = method === 'fromTo' ? (more as Record<string, unknown>) : vars;
      calls.push({ method, target, vars: last });
      return tl;
    };
  }
  tl.kill = vi.fn();
  return tl;
}

vi.mock('../../src/utils/gsap-setup.js', () => {
  const root = timeline();
  return { gsap: { ...root, timeline, killTweensOf: vi.fn() } };
});
vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../src/services/soul-stats.service.js', () => ({
  soulStatsService: new Proxy({}, { get: () => vi.fn() }),
}));
vi.mock('../../src/ui/ferni-expressions.ui.js', () => ({
  ferniExpressions: new Proxy({}, { get: () => vi.fn() }),
}));

function setReducedMotion(reduced: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: reduced && query.includes('reduce'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

const glow = (): HTMLElement => document.querySelector('.soul-glow-bleed') as HTMLElement;
const grain = (): HTMLElement => document.querySelector('.soul-grain-overlay') as HTMLElement;
const css = (): string => document.getElementById('avatar-soul-styles')?.textContent ?? '';
const tweensOf = (el: Element): TweenCall[] => calls.filter((c) => c.target === el);

/** The body of the first CSS rule whose selector is exactly `selector`. */
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css());
  return match ? match[1] : '';
}

let soul: typeof import('../../src/ui/avatar-soul.ui.js');

beforeEach(async () => {
  vi.resetModules();
  calls.length = 0;
  setReducedMotion(false);
  document.head.innerHTML = '';
  document.body.innerHTML = `
    <div class="avatar-container"><div id="coachAvatar"></div></div>`;
  soul = await import('../../src/ui/avatar-soul.ui.js');
  soul.initAvatarSoul();
});

afterEach(() => {
  soul.disposeAvatarSoul();
});

describe('halo pulse', () => {
  it('is never a GSAP tween of --pulse-scale (it started from an unset value, ~0)', () => {
    const pulseTweens = calls.filter((c) => '--pulse-scale' in c.vars);
    expect(pulseTweens).toHaveLength(0);
  });

  it('is a CSS animation on scale, from 1 to 1.05', () => {
    expect(ruleBody('.soul-glow-bleed')).toMatch(/animation:\s*soulGlowPulse\b[^;]*infinite/);
    const keyframes = /@keyframes soulGlowPulse\s*\{([\s\S]*?)\n\s*\}/.exec(css())?.[1] ?? '';
    expect(keyframes).toMatch(/from\s*\{\s*scale:\s*1;\s*\}/);
    expect(keyframes).toMatch(/to\s*\{\s*scale:\s*1\.05;\s*\}/);
    // The pulse no longer rides on transform, so a transform write can't drop it
    expect(ruleBody('.soul-glow-bleed')).not.toMatch(/transform:/);
  });

  it('stops under prefers-reduced-motion', () => {
    const reduced = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*)/.exec(css())?.[1] ?? '';
    expect(reduced).toMatch(/\.soul-glow-bleed\s*\{[^}]*animation:\s*none/);
  });
});

describe('setGlowBleed', () => {
  it('animates scale and opacity only, never width or height', () => {
    calls.length = 0;
    soul.setGlowBleed(0.8);
    const animated = tweensOf(glow()).filter((c) => c.method === 'to');
    expect(animated.length).toBeGreaterThan(0);
    for (const tween of animated) {
      expect(Object.keys(tween.vars)).not.toContain('width');
      expect(Object.keys(tween.vars)).not.toContain('height');
      expect(Object.keys(tween.vars)).not.toContain('background');
    }
    const settle = animated[animated.length - 1].vars;
    expect(settle.opacity).toBeCloseTo(0.3 + 0.8 * 0.4);
  });

  it('sizes the halo by scale: radius (40 + 50 x amount) out of 90', () => {
    calls.length = 0;
    soul.setGlowBleed(0);
    const neutral = tweensOf(glow()).filter((c) => c.method === 'to').pop()?.vars;
    expect(neutral?.scale).toBeCloseTo(40 / 90);
    calls.length = 0;
    soul.setGlowBleed(1);
    const full = tweensOf(glow()).filter((c) => c.method === 'to').pop()?.vars;
    expect(full?.scale).toBeCloseTo(1);
  });
});

describe('grain overlay', () => {
  it('has no GSAP tween; the CSS grainBreath loop is its one engine', () => {
    expect(grain()).not.toBeNull();
    expect(tweensOf(grain())).toHaveLength(0);
    expect(calls.filter((c) => 'backgroundPosition' in c.vars)).toHaveLength(0);
    expect(ruleBody('.soul-grain-overlay')).toMatch(/animation:\s*grainBreath/);
  });
});

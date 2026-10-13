/**
 * Motion honours prefers-reduced-motion.
 *
 * Before: the avatar's squash-and-stretch breathing (presence.ui.ts) looped
 * forever under reduced motion, and nine UI modules called element.animate()
 * with no reduced-motion check.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { safeAnimate, toReducedMotionKeyframes } from '../../src/config/animation-constants.js';

function setReducedMotion(reduce: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

const animate = vi.fn(() => ({ cancel: vi.fn(), finished: Promise.resolve() }) as unknown as Animation);

beforeEach(() => {
  animate.mockClear();
  Element.prototype.animate = animate as unknown as Element['animate'];
});

afterEach(() => setReducedMotion(false));

describe('toReducedMotionKeyframes', () => {
  it('pins motion to the final frame and keeps the opacity fade', () => {
    const frames = toReducedMotionKeyframes([
      { opacity: 0, transform: 'translateY(100%)' },
      { opacity: 1, transform: 'translateY(0)' },
    ]);

    expect(frames).toEqual([
      { opacity: 0, transform: 'translateY(0)' },
      { opacity: 1, transform: 'translateY(0)' },
    ]);
  });
});

describe('safeAnimate', () => {
  it('passes animations through untouched without a reduced-motion preference', () => {
    setReducedMotion(false);
    const el = document.createElement('div');
    const keyframes = [{ transform: 'scale(1)' }, { transform: 'scale(1.1)' }];

    safeAnimate(el, keyframes, { duration: 500, iterations: Infinity });

    expect(animate).toHaveBeenCalledWith(keyframes, { duration: 500, iterations: Infinity });
  });

  it('turns a motion-only loop into an instant, single settle under reduced motion', () => {
    setReducedMotion(true);
    const el = document.createElement('div');

    safeAnimate(el, [{ transform: 'scale(1)' }, { transform: 'scale(1.1)' }, { transform: 'scale(1)' }], {
      duration: 5000,
      iterations: Infinity,
      fill: 'both',
    });

    expect(animate).toHaveBeenCalledWith(
      [{ transform: 'scale(1)' }, { transform: 'scale(1)' }, { transform: 'scale(1)' }],
      { duration: 0, iterations: 1, fill: 'both' }
    );
  });

  it('keeps a fade, at its duration, under reduced motion', () => {
    setReducedMotion(true);
    const el = document.createElement('div');

    safeAnimate(el, [{ opacity: 0, transform: 'scale(0.95)' }, { opacity: 1, transform: 'scale(1)' }], 300);

    expect(animate).toHaveBeenCalledWith(
      [{ opacity: 0, transform: 'scale(1)' }, { opacity: 1, transform: 'scale(1)' }],
      { duration: 300, iterations: 1 }
    );
  });
});

describe('avatar breathing (presence.ui.ts)', () => {
  it('does not loop the squash-and-stretch under reduced motion', async () => {
    setReducedMotion(true);
    vi.resetModules();
    document.body.innerHTML = '<div class="avatar-container"><div id="coachAvatar"></div></div>';
    const { initPresenceUI } = await import('../../src/ui/presence.ui.js');

    initPresenceUI();

    const container = document.querySelector('.avatar-container');
    const breathing = animate.mock.contexts
      .map((ctx, i) => ({ ctx, options: animate.mock.calls[i]?.[1] as KeyframeAnimationOptions | undefined }))
      .filter(({ ctx }) => ctx === container);
    expect(breathing.length).toBeGreaterThan(0);
    for (const { options } of breathing) {
      expect(options?.iterations).not.toBe(Infinity);
    }
  });
});

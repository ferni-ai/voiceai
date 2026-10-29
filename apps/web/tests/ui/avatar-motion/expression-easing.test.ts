import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MOTION_FLAG_KEYS } from '../../../src/config/motion-flags.js';

interface RecordedTween {
  target: unknown;
  vars: { ease?: string; duration?: number; scaleY?: number; attr?: { d: string } };
  position: unknown;
}

const tweens: RecordedTween[] = [];
const calls: Array<() => void> = [];

vi.mock('../../../src/utils/gsap-setup.js', () => {
  const timeline = () => {
    const tl = {
      to(target: unknown, vars: RecordedTween['vars'], position?: unknown) {
        tweens.push({ target, vars, position });
        return tl;
      },
      call(fn: () => void) {
        calls.push(fn);
        return tl;
      },
      kill() {},
    };
    return tl;
  };
  return { gsap: { timeline, to: vi.fn(), set: vi.fn(), killTweensOf: vi.fn() } };
});

import {
  expressionMotion,
  expressionWeight,
  getMoodBaseline,
  holdReturnTarget,
  noteExpressionSet,
  setMoodBaseline,
} from '../../../src/ui/avatar-motion/expression-easing.js';

function setReducedMotion(reduce: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: reduce && query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
}

function lidTweens(): RecordedTween[] {
  return tweens.filter((t) => t.vars.attr !== undefined);
}

describe('expression-easing (pure)', () => {
  beforeEach(() => setMoodBaseline('neutral'));

  it('classifies heavy, light and neutral expressions', () => {
    expect(expressionWeight('sad')).toBe('heavy');
    expect(expressionWeight('holdingSpace')).toBe('heavy');
    expect(expressionWeight('celebrating')).toBe('light');
    expect(expressionWeight('curious')).toBe('neutral');
  });

  it('flag off keeps the legacy elastic motion for every expression', () => {
    for (const expr of ['sad', 'happy', 'curious']) {
      expect(expressionMotion(expr, 300, false, true)).toEqual({
        ease: 'elastic.out(1, 0.7)',
        durationMs: 300,
        delayMs: 50,
        anticipate: true,
      });
    }
  });

  it('heavy expressions glide with sine.inOut, 600-900 ms, no anticipation', () => {
    expect(expressionMotion('sad', 300, true, false)).toEqual({
      ease: 'sine.inOut',
      durationMs: 600,
      delayMs: 0,
      anticipate: false,
    });
    expect(expressionMotion('worried', 2000, true, false).durationMs).toBe(900);
  });

  it('light expressions keep the spring, neutral ones ease out without overshoot', () => {
    expect(expressionMotion('happy', 300, true, false)).toMatchObject({
      ease: 'elastic.out(1, 0.7)',
      anticipate: true,
    });
    expect(expressionMotion('curious', 300, true, false)).toEqual({
      ease: 'power2.out',
      durationMs: 300,
      delayMs: 0,
      anticipate: false,
    });
  });

  it('reduced motion turns every expression into a 150 ms crossfade', () => {
    for (const expr of ['sad', 'celebrating', 'curious']) {
      expect(expressionMotion(expr, 800, true, true)).toEqual({
        ease: 'power1.out',
        durationMs: 150,
        delayMs: 0,
        anticipate: false,
      });
    }
  });

  it('only resting moods set without a hold become the baseline', () => {
    noteExpressionSet('warm', 0);
    expect(getMoodBaseline()).toBe('warm');
    noteExpressionSet('surprised', 0);
    expect(getMoodBaseline()).toBe('warm');
    noteExpressionSet('sad', 1500);
    expect(getMoodBaseline()).toBe('warm');
  });

  it('hold return target is the baseline with the flag on, neutral with it off', () => {
    const known = { neutral: 1, warm: 1 };
    setMoodBaseline('warm');
    expect(holdReturnTarget('neutral', known, true)).toBe('warm');
    expect(holdReturnTarget('neutral', known, false)).toBe('neutral');
    setMoodBaseline('unknown-mood');
    expect(holdReturnTarget('neutral', known, true)).toBe('neutral');
  });
});

describe('ferni-expressions setExpression with ferni:weighted-easing', () => {
  async function freshExpressions() {
    vi.resetModules();
    tweens.length = 0;
    calls.length = 0;
    document.body.innerHTML = '<div id="coach"><div id="coachAvatar"></div></div>';
    return import('../../../src/ui/ferni-expressions.ui.js');
  }

  beforeEach(() => setReducedMotion(false));

  it('flag off: sad bounces in with elastic after the squeeze (legacy)', async () => {
    const fx = await freshExpressions();
    fx.setExpression('sad', 300);
    const lids = lidTweens();
    expect(lids).toHaveLength(2);
    expect(lids.every((t) => t.vars.ease === 'elastic.out(1, 0.7)')).toBe(true);
    expect(tweens.some((t) => t.vars.scaleY === 0.95)).toBe(true);
  });

  it('flag on: sad glides with sine.inOut and no squeeze', async () => {
    localStorage.setItem(MOTION_FLAG_KEYS.weightedEasing, 'true');
    const fx = await freshExpressions();
    fx.setExpression('sad', 300);
    const lids = lidTweens();
    expect(lids.every((t) => t.vars.ease === 'sine.inOut')).toBe(true);
    expect(lids[0]?.vars.duration).toBeCloseTo(0.6);
    expect(tweens.some((t) => t.vars.scaleY === 0.95)).toBe(false);
  });

  it('flag on + reduced motion: a 150 ms crossfade', async () => {
    localStorage.setItem(MOTION_FLAG_KEYS.weightedEasing, 'true');
    setReducedMotion(true);
    const fx = await freshExpressions();
    fx.setExpression('celebrating', 600);
    const lids = lidTweens();
    expect(lids.every((t) => t.vars.ease === 'power1.out')).toBe(true);
    expect(lids[0]?.vars.duration).toBeCloseTo(0.15);
  });

  it('flag on: a held reaction settles back to the mood baseline', async () => {
    localStorage.setItem(MOTION_FLAG_KEYS.weightedEasing, 'true');
    const fx = await freshExpressions();
    fx.setExpression('warm', 300);
    fx.setExpression('surprised', 300, 1000);
    expect(calls).toHaveLength(1);
    calls[0]?.();
    expect(fx.getExpression()).toBe('warm');
  });

  it('flag off: a held reaction snaps back to neutral', async () => {
    const fx = await freshExpressions();
    fx.setExpression('warm', 300);
    fx.setExpression('surprised', 300, 1000);
    calls[0]?.();
    expect(fx.getExpression()).toBe('neutral');
  });
});

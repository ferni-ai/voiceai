/**
 * Expressions timed by feeling, measured on the real GSAP tween (motion P6, T2 "C").
 *
 * The clock is driven by hand (gsap.updateRoot), one 60 fps frame at a time, and
 * every frame reads the lid `d` the browser would paint. Covers: each feeling's
 * duration, zero overshoot for the heavy feelings, reduced motion, a retarget
 * inside 34 ms, the body posture, and one writer of the lid paths
 * while the voice (ferni:lid-blend) owns them.
 */

import { gsap } from 'gsap';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DURATION } from '../../../src/config/animation-constants.js';
import { MOTION_FLAG_KEYS } from '../../../src/config/motion-flags.js';
import { DOME_POSES, domePaths } from '../../../src/ui/face/dome-poses.js';

vi.mock('../../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

type Expressions = typeof import('../../../src/ui/ferni-expressions.ui.js');
type Feeling = keyof typeof DOME_POSES;

const FRAME_S = 1 / 60;
let clock = 0;
let rafQueue: FrameRequestCallback[] = [];

/** One display frame: GSAP renders first, then any rAF writer (the speaking system). */
function frame(): void {
  clock += FRAME_S;
  gsap.updateRoot(clock);
  const pending = rafQueue;
  rafQueue = [];
  pending.forEach((cb) => cb(clock * 1000));
}

function frames(count: number): void {
  for (let i = 0; i < count; i++) frame();
}

function framesFor(ms: number): number {
  return Math.ceil(ms / 1000 / FRAME_S);
}

const numbers = (d: string | null): number[] => (d ?? '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
const lid = (which: 'top' | 'bottom'): SVGPathElement =>
  document.querySelector(`.avatar-lid-overlay .lid-${which}`) as SVGPathElement;
const shown = (): number[] => [...numbers(lid('top').getAttribute('d')), ...numbers(lid('bottom').getAttribute('d'))];
const target = (feeling: Feeling): number[] => {
  const p = domePaths(DOME_POSES[feeling]);
  return [...numbers(p.top), ...numbers(p.bottom)];
};
const atTarget = (feeling: Feeling): boolean =>
  shown().every((v, i) => Math.abs(v - (target(feeling)[i] ?? NaN)) < 0.01);

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

async function mountFace(flags: Array<keyof typeof MOTION_FLAG_KEYS>): Promise<Expressions> {
  for (const flag of flags) localStorage.setItem(MOTION_FLAG_KEYS[flag], 'true');
  document.body.innerHTML = `
    <div id="coach">
      <div class="avatar-container">
        <div id="avatarRing"></div>
        <div id="coachAvatar"></div>
      </div>
    </div>`;
  const fx = await import('../../../src/ui/ferni-expressions.ui.js');
  fx.initFerniExpressions();
  return fx;
}

/** Settle on `from`, then set `to` and record every frame until it has long arrived. */
function transition(fx: Expressions, from: Feeling, to: Feeling) {
  fx.setExpression(from);
  frames(framesFor(1200));
  const start = shown();
  fx.setExpression(to);
  const samples: number[][] = [];
  for (let i = 0; i < framesFor(1200); i++) {
    frame();
    samples.push(shown());
  }
  const end = target(to);
  const overshoot = Math.max(
    ...samples.flatMap((s) =>
      s.map((v, i) => {
        const lo = Math.min(start[i] ?? v, end[i] ?? v);
        const hi = Math.max(start[i] ?? v, end[i] ?? v);
        return Math.max(lo - v, v - hi, 0);
      })
    )
  );
  const lastMove = samples.findLastIndex((s, f) => s.some((v, i) => v !== (samples[f - 1] ?? start)[i]));
  const arrived = samples.at(-1)?.every((v, i) => Math.abs(v - (end[i] ?? NaN)) < 1e-6) ?? false;
  return { overshoot, arrived, durationMs: (lastMove + 1) * FRAME_S * 1000 };
}

beforeEach(() => {
  vi.resetModules();
  (window as unknown as { gsap: typeof gsap }).gsap = gsap;
  gsap.ticker.remove(gsap.updateRoot);
  gsap.globalTimeline.clear();
  clock = gsap.globalTimeline.time();
  rafQueue = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => rafQueue.push(cb));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  setReducedMotion(false);
});

afterEach(async () => {
  const fx = await import('../../../src/ui/ferni-expressions.ui.js');
  fx.dispose();
  gsap.globalTimeline.clear();
  gsap.ticker.add(gsap.updateRoot);
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('expressions timed by feeling (weightedEasing on)', () => {
  it.each([
    ['happy', 'neutral', DURATION.EXPRESSION_LIGHT],
    ['delighted', 'sad', DURATION.EXPRESSION_LIGHT],
    ['sad', 'happy', DURATION.EXPRESSION_HEAVY],
    ['worried', 'neutral', DURATION.EXPRESSION_HEAVY],
    ['empathetic', 'happy', DURATION.EXPRESSION_HEAVY],
    ['attentive', 'happy', DURATION.SLOWEST],
  ] as const)('%s (from %s) arrives in %i ms without overshoot', async (to, from, ms) => {
    const fx = await mountFace(['weightedEasing']);
    const { overshoot, arrived, durationMs } = transition(fx, from, to);
    expect(arrived).toBe(true);
    expect(overshoot).toBeLessThan(1e-6);
    expect(Math.abs(durationMs - ms)).toBeLessThanOrEqual(FRAME_S * 1000);
  });

  it('a retarget moves the lids within 34 ms, even out of a 900 ms heavy tween', async () => {
    const fx = await mountFace(['weightedEasing']);
    for (const [first, second] of [
      ['sad', 'happy'],
      ['happy', 'worried'],
    ] as const) {
      fx.setExpression(first);
      frames(framesFor(200));
      const before = shown();
      fx.setExpression(second);
      frames(2); // 33.3 ms
      expect(shown(), `${first} -> ${second}`).not.toEqual(before);
    }
  });

  it('the body lifts 1.5 px for a light feeling and sinks 1.5 px for a heavy one, never further', async () => {
    const transforms: string[] = [];
    const record = (keyframes: Keyframe[]) => transforms.push(String(keyframes[0]?.transform));
    // jsdom has no Web Animations; the posture layer only needs animate + setKeyframes
    Object.defineProperty(Element.prototype, 'animate', {
      configurable: true,
      value: (keyframes: Keyframe[]) => {
        record(keyframes);
        return { cancel: vi.fn(), effect: { setKeyframes: record } };
      },
    });
    const fx = await mountFace(['weightedEasing']);
    fx.setExpression('happy');
    frames(framesFor(500));
    expect(transforms.at(-1)).toBe('translateY(-1.5px)');
    fx.setExpression('sad');
    frames(framesFor(1000));
    expect(transforms.at(-1)).toBe('translateY(1.5px)');
    const ys = transforms.map((t) => Number(/translateY\((-?[\d.e-]+)px\)/.exec(t)?.[1]));
    expect(Math.max(...ys.map(Math.abs))).toBeLessThanOrEqual(1.5);
    delete (Element.prototype as Partial<Element>).animate;
  });
});

describe('weightedEasing off (the default)', () => {
  it('keeps the legacy elastic bounce, which overshoots, and never moves the body', async () => {
    const animate = vi.fn();
    Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
    const fx = await mountFace([]);
    const { overshoot, arrived } = transition(fx, 'neutral', 'sad');
    expect(arrived).toBe(true);
    expect(overshoot).toBeGreaterThan(0.01);
    expect(animate).not.toHaveBeenCalled();
    delete (Element.prototype as Partial<Element>).animate;
  });
});

describe('reduced motion with weightedEasing on', () => {
  it('every change lands in 150 ms with no overshoot', async () => {
    setReducedMotion(true);
    const fx = await mountFace(['weightedEasing']);
    for (const [from, to] of [
      ['neutral', 'sad'],
      ['sad', 'happy'],
    ] as const) {
      const { overshoot, arrived, durationMs } = transition(fx, from, to);
      expect(arrived, `${from} -> ${to}`).toBe(true);
      expect(overshoot, `${from} -> ${to}`).toBeLessThan(1e-6);
      expect(durationMs, `${from} -> ${to}`).toBeLessThanOrEqual(150 + FRAME_S * 1000);
    }
  });
});

describe('one owner of the lid paths', () => {
  it('while the voice owns the lids, every frame has exactly one write of each lid d, across an expression change', async () => {
    const fx = await mountFace(['weightedEasing', 'lidBlend']);
    const writes = { top: 0, bottom: 0 };
    for (const which of ['top', 'bottom'] as const) {
      const el = lid(which);
      const original = el.setAttribute.bind(el);
      el.setAttribute = (name: string, value: string) => {
        if (name === 'd') writes[which]++;
        original(name, value);
      };
    }
    const { speakingSystem } = await import('../../../src/ui/speaking-system.ui.js');
    speakingSystem.init();
    fx.setExpression('happy');
    frames(6); // the happy tween is mid-flight when the voice starts
    speakingSystem.start();
    speakingSystem.updateVolume(0.6);
    const perFrame: Array<[number, number]> = [];
    for (let i = 0; i < 90; i++) {
      if (i === 20) fx.setExpression('sad'); // mid-speech
      writes.top = 0;
      writes.bottom = 0;
      frame();
      perFrame.push([writes.top, writes.bottom]);
    }
    expect(perFrame.filter(([top, bottom]) => top !== 1 || bottom !== 1)).toEqual([]);
    // The voice eased the top lid onto sad itself
    expect(numbers(lid('top').getAttribute('d'))).toEqual(
      numbers(domePaths(DOME_POSES.sad).top).map((v) => expect.closeTo(v, 1))
    );

    speakingSystem.stop();
    frames(300);
    expect(atTarget('sad')).toBe(true);
    writes.top = 0;
    fx.setExpression('happy');
    frames(framesFor(400));
    expect(writes.top).toBeGreaterThan(5); // the expression tween owns the lids again
    expect(atTarget('happy')).toBe(true);
  });
});

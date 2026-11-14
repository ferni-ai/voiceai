/**
 * The crisis hold covers the avatar soul's own gaze motion, not only the
 * delight switches (fe 2026-11-12, #3787 r2): no micro-saccades, and no glance
 * away from the contemplation micro-expression or the superhuman observation.
 * Each row runs a simulated 30 s (or fires the cue) once with no crisis, where
 * the motion must play, and once during the hold, where it must not.
 *
 * Protective mode is the one exception (Seth 2026-11-12, via fe): while held
 * its lean-in plays once, slowly, with no overshoot, and eases back only when
 * the hold ends. Its comfort pulse rings stay still while held.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface TweenCall {
  target: unknown;
  vars: Record<string, unknown>;
}
const calls: TweenCall[] = [];

function timeline(): Record<string, unknown> {
  const tl: Record<string, unknown> = {};
  for (const method of ['to', 'set', 'fromTo'] as const) {
    tl[method] = (target: unknown, vars: Record<string, unknown>, more?: unknown) => {
      calls.push({ target, vars: method === 'fromTo' ? (more as Record<string, unknown>) : vars });
      return tl;
    };
  }
  tl.kill = vi.fn();
  return tl;
}

vi.mock('../../src/utils/gsap-setup.js', () => {
  const root = timeline();
  return { gsap: { ...root, timeline, killTweensOf: vi.fn(), isTweening: () => false } };
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

const avatar = (): HTMLElement | null => document.getElementById('coachAvatar');
/** The soul's micro-saccades: a quick x/y move of the avatar, no tilt. */
const saccades = (): number =>
  calls.filter(
    (c) =>
      c.target === avatar() && 'x' in c.vars && !('rotation' in c.vars) && c.vars.duration === 0.05
  ).length;
/** The soul's glance away: an x/y move with a tilt. */
const glances = (): number =>
  calls.filter((c) => c.target === avatar() && 'y' in c.vars && 'rotation' in c.vars).length;

const container = (): Element | null => document.querySelector('.avatar-container');
/** Protective mode drawing the avatar closer, and easing it back. */
const leans = (): TweenCall[] =>
  calls.filter((c) => c.target === container() && c.vars.scale === 1.03);
const leanBacks = (): TweenCall[] =>
  calls.filter((c) => c.target === container() && c.vars.scale === 1);
/** The comfort pulse: its rings growing outward, and the pulse fading out. */
const pulseRings = (): number => calls.filter((c) => c.vars.scale === 2.5).length;
const pulseStops = (): number =>
  calls.filter(
    (c) =>
      c.target instanceof Element &&
      c.target.classList.contains('soul-comfort-pulse') &&
      c.vars.opacity === 0
  ).length;

/**
 * The scale a tween shows at 101 points along its ease, with gsap's real eases.
 * The app's gsap is the CDN global (gsap-setup.ts), so the eases come from the npm package.
 */
async function sampledScales(tween: TweenCall, from: number): Promise<number[]> {
  const { gsap } = await import('gsap');
  const ease = gsap.parseEase(tween.vars.ease as string);
  const to = tween.vars.scale as number;
  return Array.from({ length: 101 }, (_, i) => from + (to - from) * ease(i / 100));
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
}

async function initSoul() {
  const soul = await import('../../src/ui/avatar-soul.ui.js');
  soul.initAvatarSoul();
  calls.length = 0;
  return soul;
}

async function hold(): Promise<void> {
  (await import('../../src/ui/face/crisis-face-hold.js')).holdCrisisFace();
}

let reduceMotion = false;

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  calls.length = 0;
  reduceMotion = false;
  window.matchMedia = ((query: string) => ({
    matches: reduceMotion && query === '(prefers-reduced-motion: reduce)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  document.body.innerHTML = '<div class="avatar-container"><div id="coachAvatar"></div></div>';
});

afterEach(async () => {
  (await import('../../src/ui/avatar-soul.ui.js')).disposeAvatarSoul();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('avatar soul micro-saccades', () => {
  it('control, no hold: the avatar saccades over 30 s', async () => {
    await initSoul();
    vi.advanceTimersByTime(30_000);
    expect(saccades()).toBeGreaterThanOrEqual(5); // one every 2-5 s
  });

  it('held: 0 saccades over 30 s', async () => {
    await initSoul();
    await hold();
    vi.advanceTimersByTime(30_000);
    expect(saccades()).toBe(0);
  });
});

describe('the contemplation micro-expression glance', () => {
  async function contemplate(): Promise<void> {
    const { playMicroExpression } = await import('../../src/eq/capabilities/micro-expressions.js');
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.01); // past its probability check
    playMicroExpression('contemplation');
    random.mockRestore();
    await settle();
  }

  it('control, no hold: Ferni glances away', async () => {
    await initSoul();
    await contemplate();
    expect(glances()).toBeGreaterThan(0);
  });

  it('held: 0 glances', async () => {
    await initSoul();
    await hold();
    await contemplate();
    expect(glances()).toBe(0);
  });
});

describe('the superhuman observation glance', () => {
  async function observe(): Promise<void> {
    const { handleBetterThanHumanSignal } =
      await import('../../src/eq/bridge/humanization-bridge.js');
    handleBetterThanHumanSignal({
      signalType: 'superhuman_observation',
      intensity: 0.8,
      observationType: 'pattern',
      observationContent: 'a fictional pattern',
    } as unknown as Parameters<typeof handleBetterThanHumanSignal>[0]);
    await settle();
  }

  it('control, no hold: Ferni glances away as if recalling', async () => {
    await initSoul();
    await observe();
    expect(glances()).toBeGreaterThan(0);
  });

  it('held: 0 glances', async () => {
    await initSoul();
    await hold();
    await observe();
    expect(glances()).toBe(0);
  });
});

describe('protective lean (Seth 2026-11-12: once per hold, slow, no overshoot)', () => {
  it('control, no hold: protective mode leans in, and back when it ends', async () => {
    const soul = await initSoul();
    soul.enterProtectiveMode();
    soul.exitProtectiveMode();
    expect(leans()).toHaveLength(1);
    expect(leanBacks()).toHaveLength(1);
  });

  it('held: one slow lean-in, never past 1.03 and always moving inward', async () => {
    const soul = await initSoul();
    await hold();
    soul.enterProtectiveMode();
    expect(leans()).toHaveLength(1);
    const [lean] = leans();
    expect(lean?.vars.duration as number).toBeGreaterThanOrEqual(0.8);
    const scales = await sampledScales(lean as TweenCall, 1);
    expect(Math.max(...scales)).toBeLessThanOrEqual(1.03 + 1e-9);
    expect(scales.every((s, i) => i === 0 || s >= (scales[i - 1] as number) - 1e-9)).toBe(true);
    expect(scales.at(-1)).toBeCloseTo(1.03, 6);
  });

  it('held: a second concern gives no second lean, and the lean stays put', async () => {
    const soul = await initSoul();
    await hold();
    soul.enterProtectiveMode();
    soul.exitProtectiveMode(); // the concern resolved
    soul.enterProtectiveMode(); // a second concern, same hold
    expect(leans()).toHaveLength(1);
    expect(leanBacks()).toHaveLength(0);
  });

  it('the hold ending (the call ends) eases the lean back, slowly', async () => {
    const soul = await initSoul();
    await hold();
    soul.enterProtectiveMode();
    expect(leanBacks()).toHaveLength(0);
    (await import('../../src/app/call-end.js')).onCallEnded();
    expect(leanBacks()).toHaveLength(1);
    expect(leanBacks()[0]?.vars.duration as number).toBeGreaterThanOrEqual(0.8);
  });

  it('reduced motion: no lean, held or not', async () => {
    reduceMotion = true;
    const soul = await initSoul();
    soul.enterProtectiveMode();
    soul.exitProtectiveMode();
    await hold();
    soul.enterProtectiveMode();
    expect(leans()).toHaveLength(0);
  });
});

describe('protective mode comfort pulse (blocked while held, lead default 2026-11-12)', () => {
  it('control, no hold: the pulse rings grow outward', async () => {
    const soul = await initSoul();
    soul.enterProtectiveMode();
    expect(pulseRings()).toBeGreaterThan(0);
  });

  it('held: 0 pulse rings', async () => {
    const soul = await initSoul();
    await hold();
    soul.enterProtectiveMode();
    expect(pulseRings()).toBe(0);
  });

  it('a hold that starts mid-pulse stops the pulse', async () => {
    const soul = await initSoul();
    soul.enterProtectiveMode();
    expect(pulseStops()).toBe(0);
    await hold();
    expect(pulseStops()).toBe(1);
  });

  it('reduced motion: 0 pulse rings', async () => {
    reduceMotion = true;
    const soul = await initSoul();
    soul.startComfortPulse();
    expect(pulseRings()).toBe(0);
  });
});

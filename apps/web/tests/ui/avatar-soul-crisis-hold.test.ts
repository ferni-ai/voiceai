/**
 * The crisis hold covers the avatar soul's own gaze motion, not only the
 * delight switches (fe 2026-11-12, #3787 r2): no micro-saccades, and no glance
 * away from the contemplation micro-expression or the superhuman observation.
 * Each row runs a simulated 30 s (or fires the cue) once with no crisis, where
 * the motion must play, and once during the hold, where it must not.
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

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  calls.length = 0;
  window.matchMedia = ((query: string) => ({
    matches: false,
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

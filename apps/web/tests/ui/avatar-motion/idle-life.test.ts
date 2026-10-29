/**
 * Idle life (behind ferni:idle-life, off by default): the ring's breath is
 * locked 1.5 s behind the body's (avatar-lamp's scale loop), the eyes drift at most 2 px every 8-15 s, and the upbeat
 * personas glance aside every 12-25 s (250 ms out, 600 ms hold). Only while
 * idle, never under reduced motion. Off: nothing changes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AT_USER, LOOK_AWAY, type GazePoint } from '../../../src/ui/avatar-motion/gaze.js';
import {
  createIdleLife,
  DRIFT_MAX_MS,
  DRIFT_MIN_MS,
  DRIFT_PX,
  GLANCE_HOLD_MS,
  GLANCE_MAX_GAP_MS,
  GLANCE_MIN_GAP_MS,
  GLANCE_OUT_MS,
  glanceFrames,
  IDLE_LIFE_ATTR,
  RING_BREATH_NAME,
  RING_LAG_MS,
  ringBreathFor,
  type IdleLifeDeps,
} from '../../../src/ui/avatar-motion/idle-life.js';

vi.mock('../../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

/** Small seeded PRNG (mulberry32) so runs are repeatable. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Harness {
  deps: IdleLifeDeps;
  drifts: { at: number; to: GazePoint; ms: number }[];
  glances: number[];
  advance: (ms: number) => void;
  state: { idle: boolean; glances: boolean; reduced: boolean };
}

function harness(seed = 3): Harness {
  let clock = 0;
  let timers: { due: number; fn: () => void }[] = [];
  const drifts: Harness['drifts'] = [];
  const glances: number[] = [];
  const state = { idle: true, glances: false, reduced: false };
  const deps: IdleLifeDeps = {
    drift: (to, ms) => drifts.push({ at: clock, to, ms }),
    glance: () => glances.push(clock),
    idle: () => state.idle,
    glances: () => state.glances,
    reducedMotion: () => state.reduced,
    random: seeded(seed),
    schedule: (fn, ms) => {
      const timer = { due: clock + ms, fn };
      timers.push(timer);
      return () => {
        timers = timers.filter((t) => t !== timer);
      };
    },
  };
  const advance = (ms: number): void => {
    const end = clock + ms;
    for (;;) {
      const next = timers.filter((t) => t.due <= end).sort((a, b) => a.due - b.due)[0];
      if (!next) break;
      timers = timers.filter((t) => t !== next);
      clock = next.due;
      next.fn();
    }
    clock = end;
  };
  return { deps, drifts, glances, advance, state };
}

describe('createIdleLife', () => {
  it('drifts the eyes at most 2 px, a new point every 8-15 s', () => {
    const h = harness();
    createIdleLife(h.deps).start();
    h.advance(5 * 60_000);
    expect(h.drifts.length).toBeGreaterThanOrEqual(20);
    for (const d of h.drifts) {
      expect(Math.hypot(d.to.x, d.to.y)).toBeLessThanOrEqual(DRIFT_PX);
      expect(d.ms).toBeGreaterThanOrEqual(8000);
      expect(d.ms).toBeLessThanOrEqual(15_000);
    }
    const legs = h.drifts.slice(1).map((d, i) => d.at - h.drifts[i]!.at);
    expect(new Set(legs).size).toBeGreaterThan(legs.length / 2); // not a fixed cycle
    expect(new Set(h.drifts.map((d) => `${d.to.x},${d.to.y}`)).size).toBeGreaterThan(10);
    expect(DRIFT_MIN_MS).toBe(8000);
    expect(DRIFT_MAX_MS).toBe(15_000);
  });

  it('returns the eyes to rest while someone holds the turn', () => {
    const h = harness();
    h.state.idle = false;
    createIdleLife(h.deps).start();
    h.advance(60_000);
    expect(h.drifts.length).toBeGreaterThan(0);
    expect(h.drifts.every((d) => d.to === AT_USER)).toBe(true);
  });

  it('glances every 12-25 s for an upbeat persona, never for the others', () => {
    const calm = harness();
    createIdleLife(calm.deps).start();
    calm.advance(5 * 60_000);
    expect(calm.glances).toHaveLength(0);

    const upbeat = harness();
    upbeat.state.glances = true;
    createIdleLife(upbeat.deps).start();
    upbeat.advance(5 * 60_000);
    expect(upbeat.glances.length).toBeGreaterThanOrEqual(12);
    const gaps = [
      upbeat.glances[0]!,
      ...upbeat.glances.slice(1).map((t, i) => t - upbeat.glances[i]!),
    ];
    for (const g of gaps) {
      expect(g).toBeGreaterThanOrEqual(GLANCE_MIN_GAP_MS);
      expect(g).toBeLessThanOrEqual(GLANCE_MAX_GAP_MS);
    }
  });

  it('does not glance in a turn', () => {
    const h = harness();
    h.state.glances = true;
    h.state.idle = false;
    createIdleLife(h.deps).start();
    h.advance(5 * 60_000);
    expect(h.glances).toHaveLength(0);
  });

  it('under reduced motion: no drift and no glance, only an instant rest', () => {
    const h = harness();
    h.state.glances = true;
    h.state.reduced = true;
    createIdleLife(h.deps).start();
    h.advance(5 * 60_000);
    expect(h.glances).toHaveLength(0);
    expect(h.drifts.length).toBeGreaterThan(0);
    expect(h.drifts.every((d) => d.ms === 0 && d.to === AT_USER)).toBe(true);
  });

  it('stops cleanly', () => {
    const h = harness();
    h.state.glances = true;
    const life = createIdleLife(h.deps);
    life.start();
    life.stop();
    const drifts = h.drifts.length;
    h.advance(5 * 60_000);
    expect(h.drifts).toHaveLength(drifts);
    expect(h.glances).toHaveLength(0);
  });
});

describe('glanceFrames', () => {
  it('goes out in 250 ms, holds 600 ms, comes back', () => {
    const frames = glanceFrames();
    const total = 2 * GLANCE_OUT_MS + GLANCE_HOLD_MS;
    expect(GLANCE_OUT_MS).toBe(250);
    expect(GLANCE_HOLD_MS).toBe(600);
    expect(Number(frames[1]!.offset) * total).toBe(250);
    expect((Number(frames[2]!.offset) - Number(frames[1]!.offset)) * total).toBe(600);
    expect(frames[1]!.translate).toBe(`${LOOK_AWAY.x}px ${LOOK_AWAY.y}px`);
    expect(frames[0]!.translate).toBe(frames[3]!.translate);
  });
});

describe('ringBreathFor', () => {
  it('trails the body breath by 1.5 s, one ring breath per body breath', () => {
    expect(RING_LAG_MS).toBe(1500);
    // avatar-lamp: 2.8 s each way, alternating, so a 5.6 s breath.
    expect(ringBreathFor({ startTime: 1000, duration: 2800, alternate: true })).toEqual({
      startTime: 2500,
      duration: 5600,
    });
    expect(ringBreathFor({ startTime: 0, duration: 6000, alternate: false })).toEqual({
      startTime: 1500,
      duration: 6000,
    });
  });
});

// ============================================================================
// DOM wiring
// ============================================================================

const FLAG = 'ferni:idle-life';
const REDUCED = '(prefers-reduced-motion: reduce)';
let eyeAnimations: KeyframeAnimationOptions[] = [];
/** What `getAnimations()` returns per element id. */
let running: Map<string, unknown[]>;

/** avatar-lamp's breath: 2.8 s each way on `scale`, started at 1 s. */
const lampBreath = (): unknown => ({
  startTime: 1000,
  effect: {
    getKeyframes: () => [{ scale: '1 1' }, { scale: '1.025 1.035' }],
    getTiming: () => ({ iterations: Infinity, duration: 2800, direction: 'alternate' }),
  },
});

/** The ring's CSS breath, as the browser hands it out. */
function ringBreath(): { startTime: number; updateTiming: ReturnType<typeof vi.fn> } & object {
  const updateTiming = vi.fn();
  return {
    animationName: RING_BREATH_NAME,
    startTime: 0,
    updateTiming,
    effect: { getKeyframes: () => [], getTiming: () => ({}), updateTiming },
  };
}

function setReducedMotion(reduced: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: query === REDUCED ? reduced : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

describe('initIdleLife', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    localStorage.clear();
    eyeAnimations = [];
    running = new Map();
    Element.prototype.getAnimations = function getAnimations(this: Element): Animation[] {
      return (running.get(this.id) ?? []) as Animation[];
    };
    setReducedMotion(false);
    document.body.innerHTML = `
      <div id="coach" class="is-connected">
        <div id="avatarRing"></div>
        <div id="coachAvatar"><svg id="avatarEyes" class="avatar-eyes"></svg></div>
      </div>`;
    Element.prototype.animate = function animate(
      this: Element,
      _keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
      options?: number | KeyframeAnimationOptions
    ): Animation {
      if (this.id === 'avatarEyes') eyeAnimations.push(options as KeyframeAnimationOptions);
      return { cancel: vi.fn() } as unknown as Animation;
    };
  });

  afterEach(async () => {
    (await import('../../../src/ui/avatar-motion/idle-life.js')).disposeIdleLife();
    vi.useRealTimers();
  });

  const glances = (): KeyframeAnimationOptions[] =>
    eyeAnimations.filter((o) => o.duration === 2 * GLANCE_OUT_MS + GLANCE_HOLD_MS);

  it('with the switch off: no attribute, the ring untouched, nothing moves', async () => {
    const ring = ringBreath();
    running.set('coachAvatar', [lampBreath()]);
    running.set('avatarRing', [ring]);
    const m = await import('../../../src/ui/avatar-motion/idle-life.js');
    expect(m.initIdleLife()).toBe(false);
    expect(document.getElementById('coach')!.hasAttribute(IDLE_LIFE_ATTR)).toBe(false);
    vi.advanceTimersByTime(60_000);
    expect(eyeAnimations).toHaveLength(0);
    expect(ring.startTime).toBe(0);
    expect(ring.updateTiming).not.toHaveBeenCalled();
  });

  it("locks the ring's breath 1.5 s behind the body's, and again after a turn change", async () => {
    localStorage.setItem(FLAG, 'on');
    const ring = ringBreath();
    running.set('coachAvatar', [lampBreath()]);
    running.set('avatarRing', [ring]);
    const m = await import('../../../src/ui/avatar-motion/idle-life.js');
    m.initIdleLife();
    expect(ring.startTime).toBe(1000 + 1500);
    expect(ring.updateTiming).toHaveBeenCalledWith({ duration: 5600 });

    // Speaking and back: CSS starts the ring's breath afresh, out of step.
    const fresh = ringBreath();
    running.set('avatarRing', [fresh]);
    document.getElementById('coach')!.classList.add('is-speaking');
    document.getElementById('coach')!.classList.remove('is-speaking');
    await Promise.resolve(); // mutation observers run as a microtask
    expect(fresh.startTime).toBe(2500);
  });

  it('with it on: drifts the eyes, stacked on the gaze', async () => {
    localStorage.setItem(FLAG, 'on');
    const m = await import('../../../src/ui/avatar-motion/idle-life.js');
    expect(m.initIdleLife()).toBe(true);
    expect(document.getElementById('coach')!.hasAttribute(IDLE_LIFE_ATTR)).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(eyeAnimations.length).toBeGreaterThanOrEqual(4);
    expect(eyeAnimations.every((o) => o.composite === 'add')).toBe(true);
    expect(glances()).toHaveLength(0); // Ferni does not glance
  });

  it('Peter, upbeat, also glances', async () => {
    localStorage.setItem(FLAG, 'on');
    const { appState } = await import('../../../src/state/app.state.js');
    const { getPersona } = await import('../../../src/config/personas.js');
    appState.set('activePersona', getPersona('peter-john'));
    const m = await import('../../../src/ui/avatar-motion/idle-life.js');
    m.initIdleLife();
    vi.advanceTimersByTime(60_000);
    expect(glances().length).toBeGreaterThanOrEqual(2);
    appState.set('activePersona', getPersona('ferni'));
  });

  it('under reduced motion nothing moves and the ring is left alone', async () => {
    localStorage.setItem(FLAG, 'on');
    setReducedMotion(true);
    const ring = ringBreath();
    running.set('coachAvatar', [lampBreath()]);
    running.set('avatarRing', [ring]);
    const m = await import('../../../src/ui/avatar-motion/idle-life.js');
    m.initIdleLife();
    vi.advanceTimersByTime(60_000);
    expect(eyeAnimations).toHaveLength(0);
    expect(ring.startTime).toBe(0);
  });

  it('releases the avatar on dispose', async () => {
    localStorage.setItem(FLAG, 'on');
    const m = await import('../../../src/ui/avatar-motion/idle-life.js');
    m.initIdleLife();
    m.disposeIdleLife();
    eyeAnimations = [];
    expect(document.getElementById('coach')!.hasAttribute(IDLE_LIFE_ATTR)).toBe(false);
    vi.advanceTimersByTime(60_000);
    expect(eyeAnimations).toHaveLength(0);
  });
});

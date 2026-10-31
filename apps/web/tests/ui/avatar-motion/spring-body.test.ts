/**
 * Spring body (behind ferni:spring-body, off by default): the avatar
 * anticipates, the eyes lead the body, kicks stay within 5% squash, the loop
 * sleeps at rest, reduced motion gets a tiny pulse instead, and style.transform
 * is never written.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MOTION_FLAG_KEYS } from '../../../src/config/motion-flags.js';

vi.mock('../../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import {
  SPRING_BODY_TURN_EVENT,
  createSpringBody,
  disposeSpringBody,
  initSpringBody,
  type SpringBody,
} from '../../../src/ui/avatar-motion/spring-body.js';

interface Recorded {
  transforms: string[];
  animate: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
}

/** jsdom has no Web Animations: record what the spring body would show. */
function stubAnimate(el: Element): Recorded {
  const rec: Recorded = { transforms: [], animate: vi.fn(), cancel: vi.fn() };
  const take = (frames: Keyframe[]) => {
    const t = frames.find((f) => typeof f.transform === 'string')?.transform;
    if (typeof t === 'string') rec.transforms.push(t);
  };
  rec.animate.mockImplementation((frames: Keyframe[]) => {
    take(frames);
    return { effect: { setKeyframes: take }, cancel: rec.cancel };
  });
  Object.defineProperty(el, 'animate', { value: rec.animate, configurable: true });
  return rec;
}

function scaleY(t: string): number {
  const m = /scale\(([-\d.e]+), ([-\d.e]+)\)/.exec(t);
  return m ? Number(m[2]) : 1;
}
function scaleX(t: string): number {
  const m = /scale\(([-\d.e]+), ([-\d.e]+)\)/.exec(t);
  return m ? Number(m[1]) : 1;
}
function lastSy(rec: Recorded): number {
  return rec.transforms.length ? scaleY(rec.transforms[rec.transforms.length - 1]) : 1;
}

function fakeClock() {
  let t = 0;
  let nextId = 1;
  const frames = new Map<number, () => void>();
  const timers: { at: number; fn: () => void }[] = [];
  return {
    now: () => t,
    raf: (cb: () => void) => {
      frames.set(nextId, cb);
      return nextId++;
    },
    caf: vi.fn((id: number) => void frames.delete(id)),
    schedule: (fn: () => void, ms: number) => void timers.push({ at: t + ms, fn }),
    get pendingFrames() {
      return frames.size;
    },
    advance(ms: number, onFrame?: () => void) {
      const end = t + ms;
      while (t < end) {
        t = Math.min(end, t + 1000 / 60);
        for (const timer of timers.filter((x) => x.at <= t)) {
          timers.splice(timers.indexOf(timer), 1);
          timer.fn();
        }
        const due = [...frames.entries()];
        frames.clear();
        for (const [, cb] of due) cb();
        onFrame?.();
      }
    },
  };
}

function setup(reduced = false) {
  const body = document.createElement('div');
  const eyes = document.createElement('div');
  body.appendChild(eyes);
  const bodyRec = stubAnimate(body);
  const eyesRec = stubAnimate(eyes);
  const clock = fakeClock();
  const spring: SpringBody = createSpringBody({
    body,
    eyes,
    reducedMotion: () => reduced,
    now: clock.now,
    raf: clock.raf,
    caf: clock.caf,
    schedule: clock.schedule,
  });
  return { body, eyes, bodyRec, eyesRec, clock, spring };
}

describe('initSpringBody', () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<div id="coach"><div class="avatar-container"><div id="coachAvatar"><svg class="avatar-eyes"></svg></div></div></div>';
  });
  afterEach(() => {
    disposeSpringBody();
    localStorage.clear();
  });

  it('flag off: does not start and a turn event animates nothing', () => {
    const rec = stubAnimate(document.querySelector('.avatar-container')!);
    expect(initSpringBody()).toBe(false);
    window.dispatchEvent(new CustomEvent(SPRING_BODY_TURN_EVENT, { detail: { speaker: 'ferni' } }));
    expect(rec.animate).not.toHaveBeenCalled();
  });

  it('flag on: starts on the avatar and reacts to turn events', async () => {
    localStorage.setItem(MOTION_FLAG_KEYS.springBody, 'true');
    const eyesRec = stubAnimate(document.querySelector('.avatar-eyes')!);
    stubAnimate(document.querySelector('.avatar-container')!);
    expect(initSpringBody()).toBe(true);
    window.dispatchEvent(new CustomEvent(SPRING_BODY_TURN_EVENT, { detail: { speaker: 'ferni' } }));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(eyesRec.animate).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ composite: 'add', fill: 'both' })
    );
  });
});

describe('createSpringBody', () => {
  it('the eyes move before the body, by the lead', () => {
    const { bodyRec, eyesRec, clock, spring } = setup();
    spring.turn('user');
    clock.advance(50);
    expect(lastSy(eyesRec)).toBeGreaterThan(1);
    expect(lastSy(bodyRec)).toBe(1);
    clock.advance(200);
    expect(lastSy(bodyRec)).toBeGreaterThan(1);
  });

  it('before Ferni speaks the body dips first, then springs up past rest', () => {
    const { bodyRec, clock, spring } = setup();
    spring.turn('ferni');
    const seen: number[] = [];
    clock.advance(1500, () => seen.push(lastSy(bodyRec)));
    const firstDip = seen.findIndex((s) => s < 0.99);
    const firstRise = seen.findIndex((s) => s > 1.001);
    expect(firstDip).toBeGreaterThanOrEqual(0);
    expect(firstRise).toBeGreaterThan(firstDip);
  });

  it('never deforms past 5% and keeps volume, even across a laugh burst', () => {
    const { bodyRec, eyesRec, clock, spring } = setup();
    for (let i = 0; i < 4; i++) spring.kick('laugh');
    clock.advance(2000);
    const all = [...bodyRec.transforms, ...eyesRec.transforms];
    expect(Math.max(...bodyRec.transforms.map(scaleY))).toBeGreaterThan(1.01);
    for (const t of all) {
      expect(Math.abs(scaleY(t) - 1)).toBeLessThanOrEqual(0.05 + 1e-9);
      expect(scaleX(t) * scaleY(t)).toBeCloseTo(1, 9);
    }
  });

  it('stops the frame loop once everything is at rest', () => {
    const { bodyRec, clock, spring } = setup();
    spring.kick('nod');
    clock.advance(100);
    expect(clock.pendingFrames).toBe(1);
    clock.advance(3000);
    expect(clock.pendingFrames).toBe(0);
    expect(lastSy(bodyRec)).toBe(1);
  });

  it('reduced motion: no squash, one short pulse per kick, turns do nothing', () => {
    const { bodyRec, eyesRec, clock, spring } = setup(true);
    spring.turn('ferni');
    clock.advance(500);
    expect(bodyRec.animate).not.toHaveBeenCalled();
    spring.kick('laugh');
    clock.advance(500);
    expect(bodyRec.animate).toHaveBeenCalledTimes(1);
    expect(bodyRec.animate.mock.calls[0][1]).toMatchObject({ duration: 200 });
    expect(bodyRec.transforms.every((t) => !/scale\([^)]*,/.test(t))).toBe(true);
    expect(eyesRec.animate).not.toHaveBeenCalled();
    expect(clock.pendingFrames).toBe(0);
  });

  it('dispose cancels the loop, the animations and pending moves', () => {
    const { bodyRec, eyesRec, clock, spring } = setup();
    spring.turn('ferni');
    clock.advance(30);
    spring.dispose();
    expect(clock.caf).toHaveBeenCalled();
    expect(eyesRec.cancel).toHaveBeenCalled();
    expect(bodyRec.cancel).toHaveBeenCalled();
    const written = bodyRec.transforms.length;
    clock.advance(1000);
    expect(bodyRec.transforms.length).toBe(written);
    expect(bodyRec.transforms.every((t) => scaleY(t) === 1)).toBe(true);
    expect(clock.pendingFrames).toBe(0);
  });

  it('never writes style.transform', () => {
    const { body, eyes, clock, spring } = setup();
    body.style.transform = 'scaleY(1.02)';
    spring.turn('ferni');
    spring.kick('laugh');
    clock.advance(1500, () => {
      expect(body.style.transform).toBe('scaleY(1.02)');
      expect(eyes.style.transform).toBe('');
    });
  });
});

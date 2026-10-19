/**
 * The shake easter egg must not fire for a phone held still (the "constant
 * chime" on phones, 2026-10-18): gravity alone summed past the old threshold
 * at a normal hand angle, so the surprise chimed every 2 s all session.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GRAVITY,
  SHAKE_COOLDOWN_MS,
  createShakeDetector,
  movement,
  type MotionSample,
} from '../../src/ui/shake-detector.js';

const play = vi.hoisted(() => vi.fn());
vi.mock('../../src/ui/sound.ui.js', () => ({ soundUI: { play }, play }));

/** Gravity as the phone reads it, held at this pitch and roll, not moving. */
function resting(pitchDeg: number, rollDeg: number): MotionSample {
  const p = (pitchDeg * Math.PI) / 180;
  const r = (rollDeg * Math.PI) / 180;
  return {
    acceleration: { x: 0, y: 0, z: 0 },
    accelerationIncludingGravity: {
      x: GRAVITY * Math.sin(r) * Math.cos(p),
      y: GRAVITY * Math.sin(p),
      z: GRAVITY * Math.cos(p) * Math.cos(r),
    },
  };
}

/** A hard shake along x: the movement swings ±20 m/s² on top of gravity. */
function shaking(i: number): MotionSample {
  const a = i % 2 === 0 ? 20 : -20;
  return {
    acceleration: { x: a, y: 0, z: 0 },
    accelerationIncludingGravity: { x: a, y: GRAVITY, z: 0 },
  };
}

/** Feed `ms` of 60 Hz motion events; returns how many shakes were reported. */
function feed(ms: number, sample: (i: number) => MotionSample, clock: { t: number }): number {
  const detector = createShakeDetector(() => clock.t);
  let shakes = 0;
  for (let i = 0; clock.t < ms; i++, clock.t += 16) if (detector.onMotion(sample(i))) shakes++;
  return shakes;
}

describe('shake detector', () => {
  it.each([
    [45, 20],
    [30, 30],
    [35, 45],
    [60, 25],
  ])('never fires for a phone held still at pitch %i, roll %i', (pitch, roll) => {
    const still = resting(pitch, roll);
    expect(feed(60_000, () => still, { t: 0 })).toBe(0);
  });

  it('ignores gravity when the device gives only accelerationIncludingGravity', () => {
    const { accelerationIncludingGravity } = resting(45, 20);
    expect(movement({ accelerationIncludingGravity })).toBeLessThan(0.01);
    expect(feed(60_000, () => ({ accelerationIncludingGravity }), { t: 0 })).toBe(0);
  });

  it('fires once for a real shake', () => {
    expect(feed(1500, shaking, { t: 0 })).toBe(1);
  });

  it('fires at most once per cooldown while the shaking goes on', () => {
    expect(feed(SHAKE_COOLDOWN_MS * 2 - 1000, shaking, { t: 0 })).toBe(2);
  });
});

describe('shake easter egg wiring (easter-eggs.ui)', () => {
  let dispose: (() => void) | null = null;

  beforeEach(() => {
    play.mockClear();
    vi.resetModules(); // a fresh detector (and cooldown) per test
    vi.useFakeTimers();
    // jsdom has no DeviceMotionEvent: give the page Android's (no permission prompt).
    vi.stubGlobal('DeviceMotionEvent', class extends Event {});
  });
  afterEach(() => {
    dispose?.();
    dispose = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function startEasterEggs(): Promise<void> {
    const eggs = await import('../../src/ui/easter-eggs.ui.js');
    eggs.initEasterEggsUI();
    dispose = eggs.dispose;
    document.dispatchEvent(new MouseEvent('click')); // the first tap attaches devicemotion
    await vi.advanceTimersByTimeAsync(0);
  }

  it('plays the chime for a real shake outside a call', async () => {
    await startEasterEggs();
    for (let i = 0; i < 100; i++) {
      motion(shaking(i));
      await vi.advanceTimersByTimeAsync(16);
    }
    expect(play).toHaveBeenCalledWith('celebrate');
  });

  function motion(sample: MotionSample): void {
    window.dispatchEvent(Object.assign(new Event('devicemotion'), sample));
  }

  it('plays no chime for a phone held still for 20 s', async () => {
    await startEasterEggs();
    const still = resting(45, 20);
    for (let t = 0; t < 20_000; t += 16) {
      motion(still);
      await vi.advanceTimersByTimeAsync(16);
    }
    expect(play).not.toHaveBeenCalledWith('celebrate');
  });

  it('plays no chime for a shake during a call', async () => {
    await startEasterEggs();
    const { setConnectionState } = await import('../../src/state/app.state.js');
    setConnectionState('connected');
    for (let i = 0; i < 100; i++) {
      motion(shaking(i));
      await vi.advanceTimersByTimeAsync(16);
    }
    expect(play).not.toHaveBeenCalledWith('celebrate');
    setConnectionState('disconnected');
  });
});

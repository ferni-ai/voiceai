/**
 * Lid blend (behind ferni:lid-blend, off by default): emotion shapes the
 * window, voice opens it. The speaking lid opens from the current
 * expression's paths instead of neutral, smoothing follows the direction the
 * volume moves, and the level is a gated time-domain RMS. Also covers the
 * lid-overlay selector fix (`.avatar-lid-overlay`, not `.ferni-lid-overlay`).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DOME_POSES,
  bottomDomePath,
  domePaths,
  quadraticHalves,
} from '../../../src/ui/face/dome-poses.js';

vi.mock('../../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const FLAG = 'ferni:lid-blend';
const HAPPY = domePaths(DOME_POSES.happy);
const SAD = domePaths(DOME_POSES.sad);
const HAPPY_TOP = HAPPY.top;
const HAPPY_BOTTOM = HAPPY.bottom; // the old Q 50,85

let frames: FrameRequestCallback[] = [];
function flushFrames(count = 1): void {
  for (let i = 0; i < count; i++) {
    const pending = frames;
    frames = [];
    pending.forEach((cb) => cb(performance.now()));
  }
}

/** The five control y values of `M0 y C x p1 x p2 50 m C x p3 x p4 100 y Z`. */
function controls(d: string | null | undefined): number[] {
  const n = (d ?? '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  return [3, 5, 7, 9, 11].map((i) => n[i] ?? NaN);
}
/**
 * The old `Q 50,k` control this dome equals: the join sits halfway between the edge
 * and k. NaN unless all five controls agree with that symmetric split-Q dome.
 */
function controlY(d: string | null | undefined): number {
  const edge = (d ?? '').startsWith('M0 100') ? 100 : 0;
  const join = controls(d)[2];
  const k = 2 * join - edge;
  const depth = edge === 100 ? 100 - join : join; // negative: bowed outside the head
  const expected = edge === 100 ? bottomDomePath(quadraticHalves(depth, depth, depth)) : null;
  if (expected && controls(expected).some((v, i) => Math.abs(v - controls(d)[i]) > 0.011)) {
    return NaN;
  }
  return k;
}

const lidTop = (): SVGPathElement =>
  document.querySelector('.avatar-lid-overlay .lid-top') as SVGPathElement;
const lidBottom = (): SVGPathElement =>
  document.querySelector('.avatar-lid-overlay .lid-bottom') as SVGPathElement;

/** Mount the avatar, create the real lid overlay, set "happy" and stop its GSAP tween at the target. */
async function mountHappyAvatar(): Promise<void> {
  document.body.innerHTML = `
    <div id="coach">
      <div class="avatar-container">
        <div id="avatarRing"></div>
        <div id="coachAvatar"></div>
      </div>
    </div>`;
  const { gsap } = await import('gsap');
  // Production loads GSAP from the CDN as window.gsap; gsap-setup reads it at import.
  (window as unknown as { gsap: typeof gsap }).gsap = gsap;
  const expressions = await import('../../../src/ui/ferni-expressions.ui.js');
  expressions.initFerniExpressions();
  expressions.setExpression('happy');
  gsap.globalTimeline.clear();
  lidTop().setAttribute('d', HAPPY_TOP);
  lidBottom().setAttribute('d', HAPPY_BOTTOM);
}

beforeEach(() => {
  vi.resetModules();
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('computeGatedRms (exported from audio.service)', () => {
  it('reads silence and sub-gate hiss as zero', async () => {
    const { computeGatedRms } = await import('../../../src/services/audio.service.js');
    expect(computeGatedRms(new Uint8Array(256).fill(128))).toBe(0);
    const hiss = Uint8Array.from({ length: 256 }, (_, i) => (i % 2 === 0 ? 129 : 127));
    expect(computeGatedRms(hiss)).toBe(0);
    expect(computeGatedRms(new Uint8Array(0))).toBe(0);
  });

  it('rises with loudness and clamps at 1', async () => {
    const { computeGatedRms } = await import('../../../src/services/audio.service.js');
    const wave = (amplitude: number) =>
      Uint8Array.from({ length: 256 }, (_, i) =>
        Math.round(128 + amplitude * Math.sin((i / 256) * 8 * Math.PI))
      );
    const quiet = computeGatedRms(wave(10));
    const loud = computeGatedRms(wave(40));
    expect(quiet).toBeGreaterThan(0);
    expect(loud).toBeGreaterThan(quiet);
    expect(computeGatedRms(wave(127))).toBe(1);
  });

  it('getRmsVolume is null until an analyser is attached', async () => {
    const { audioService } = await import('../../../src/services/audio.service.js');
    expect(audioService.getRmsVolume()).toBeNull();
  });
});

describe('lid-blend helpers', () => {
  it('is off by default', async () => {
    const m = await import('../../../src/ui/avatar-motion/lid-blend.js');
    expect(m.isLidBlendEnabled()).toBe(false);
    localStorage.setItem(FLAG, 'true');
    expect(m.isLidBlendEnabled()).toBe(true);
  });

  it('smooths with attack on a rise and release on a fall', async () => {
    const { smoothByDirection } = await import('../../../src/ui/avatar-motion/lid-blend.js');
    expect(smoothByDirection(0, 1, 0.25, 0.08)).toBeCloseTo(0.25);
    expect(smoothByDirection(1, 0, 0.25, 0.08)).toBeCloseTo(0.92);
  });

  it('opens the bottom dome exactly as the old Q lift did, never past the floor', async () => {
    const m = await import('../../../src/ui/avatar-motion/lid-blend.js');
    const open = (d: string, v: number) => m.formatLidPath(m.openBottomLid(m.parseLidPath(d), v));
    // In old Q control terms: neutral 110 opens to 70, happy 85 to 65 at half volume, floor 62.
    expect(controlY(open(m.NEUTRAL_LID_PATHS.bottom, 1))).toBeCloseTo(70, 1);
    expect(controlY(open(m.NEUTRAL_LID_PATHS.bottom, 0))).toBeCloseTo(110, 1);
    expect(controlY(open(HAPPY_BOTTOM, 0.5))).toBeCloseTo(65, 1);
    expect(controlY(open(HAPPY_BOTTOM, 1))).toBeCloseTo(m.LID_OPEN_FLOOR, 1);
    expect(open(HAPPY_BOTTOM, 0)).toBe(HAPPY_BOTTOM);
  });

  it('lifts all five bottom controls, each clamped at its own floor', async () => {
    const m = await import('../../../src/ui/avatar-motion/lid-blend.js');
    // left eye's half deep (Q 25,70 → 50,85), right half shallow (Q 75,95 → 100,100)
    const asymmetric = bottomDomePath(quadraticHalves(30, 15, 5));
    const before = controls(asymmetric);
    const after = controls(m.formatLidPath(m.openBottomLid(m.parseLidPath(asymmetric), 0.5)));
    const weights = [1 / 3, 1 / 2, 1 / 2, 1 / 2, 1 / 3];
    const expected = before.map((y, i) => {
      const floor = 100 - (100 - m.LID_OPEN_FLOOR) * weights[i];
      return y <= floor ? y : Math.max(floor, y - 0.5 * m.LID_OPEN_RANGE * weights[i]);
    });
    // [80, 75, 85, 91.67, 96.67]: two already past their floor, the join clamps, the right half lifts
    expect(expected.map((v) => Math.round(v * 100) / 100)).toEqual([80, 75, 81, 81.67, 90]);
    after.forEach((y, i) => expect(y).toBeCloseTo(expected[i], 1));
  });

  it('halfway from happy to sad, all five control points of both lids are halfway', async () => {
    const m = await import('../../../src/ui/avatar-motion/lid-blend.js');
    for (const lid of ['top', 'bottom'] as const) {
      const eased = m.formatLidPath(
        m.easeLidPath(m.parseLidPath(HAPPY[lid]), m.parseLidPath(SAD[lid]), 0.5)
      );
      const happy = controls(HAPPY[lid]);
      const sad = controls(SAD[lid]);
      controls(eased).forEach((y, i) => expect(y).toBeCloseTo((happy[i] + sad[i]) / 2, 1));
    }
  });

  it('eases between shapes that share a template and snaps only for a foreign shape', async () => {
    const m = await import('../../../src/ui/avatar-motion/lid-blend.js');
    const from = m.parseLidPath(m.NEUTRAL_LID_PATHS.top);
    const eased = m.easeLidPath(from, m.parseLidPath(HAPPY_TOP), 0.5);
    expect(controlY(m.formatLidPath(eased))).toBeCloseTo((-10 + 25) / 2, 1); // Q -10 → 25
    const foreign = 'M 0,0 Q 30,20 60,5 Q 80,-5 100,0 L 100,0 L 0,0 Z';
    expect(m.formatLidPath(m.easeLidPath(from, m.parseLidPath(foreign), 0.5))).toBe(foreign);
  });
});

describe('speaking system lid layer', () => {
  it('with the flag on: the voice opens the current expression, not neutral', async () => {
    localStorage.setItem(FLAG, 'true');
    await mountHappyAvatar();
    const { speakingSystem } = await import('../../../src/ui/speaking-system.ui.js');
    speakingSystem.init();
    speakingSystem.start();
    speakingSystem.updateVolume(1);
    flushFrames(30);
    expect(lidTop().getAttribute('d')).toBe(HAPPY_TOP);
    const opened = controlY(lidBottom().getAttribute('d'));
    expect(opened).toBeLessThan(85);
    expect(opened).toBeGreaterThanOrEqual(61.99);
  });

  it('with the flag on: the lids settle on the expression when speech ends', async () => {
    localStorage.setItem(FLAG, 'true');
    await mountHappyAvatar();
    const { speakingSystem } = await import('../../../src/ui/speaking-system.ui.js');
    speakingSystem.init();
    speakingSystem.start();
    speakingSystem.updateVolume(1);
    flushFrames(10);
    speakingSystem.stop();
    flushFrames(200);
    expect(lidTop().getAttribute('d')).toBe(HAPPY_TOP);
    expect(lidBottom().getAttribute('d')).toBe(HAPPY_BOTTOM);
  });

  it('with the flag on: a dip in volume mid-speech releases slowly', async () => {
    localStorage.setItem(FLAG, 'true');
    await mountHappyAvatar();
    const { speakingSystem } = await import('../../../src/ui/speaking-system.ui.js');
    speakingSystem.init();
    speakingSystem.start();
    speakingSystem.updateVolume(1);
    flushFrames(40);
    const peak = speakingSystem.currentVolume;
    speakingSystem.updateVolume(0);
    flushFrames(1);
    // Release (0.08) keeps 92 % after one frame; the old speaking-attack path kept 75 %.
    expect(speakingSystem.currentVolume).toBeCloseTo(peak * 0.92, 3);
  });

  it('with the flag on: the level comes from the gated RMS, so FFT noise does not open the lid', async () => {
    localStorage.setItem(FLAG, 'true');
    await mountHappyAvatar();
    const { audioService } = await import('../../../src/services/audio.service.js');
    vi.spyOn(audioService, 'getRmsVolume').mockReturnValue(0);
    const { speakingSystem } = await import('../../../src/ui/speaking-system.ui.js');
    speakingSystem.init();
    speakingSystem.start();
    speakingSystem.updateVolume(0.6);
    flushFrames(10);
    expect(speakingSystem.currentVolume).toBe(0);
    expect(controlY(lidBottom().getAttribute('d'))).toBeCloseTo(85, 1);
  });

  it('with the flag off: the speaking system leaves the expression lids alone', async () => {
    await mountHappyAvatar();
    const { speakingSystem } = await import('../../../src/ui/speaking-system.ui.js');
    speakingSystem.init();
    speakingSystem.start();
    speakingSystem.updateVolume(1);
    flushFrames(30);
    expect(speakingSystem.currentVolume).toBeGreaterThan(0.5);
    expect(lidTop().getAttribute('d')).toBe(HAPPY_TOP);
    expect(lidBottom().getAttribute('d')).toBe(HAPPY_BOTTOM);
  });
});

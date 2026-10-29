/**
 * Lid blend (behind ferni:lid-blend, off by default): emotion shapes the
 * window, voice opens it. The speaking lid opens from the current
 * expression's paths instead of neutral, smoothing follows the direction the
 * volume moves, and the level is a gated time-domain RMS. Also covers the
 * lid-overlay selector fix (`.avatar-lid-overlay`, not `.ferni-lid-overlay`).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOME_POSES, domePaths } from '../../../src/ui/face/dome-poses.js';

vi.mock('../../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const FLAG = 'ferni:lid-blend';
const HAPPY = domePaths(DOME_POSES.happy);
const SAD = domePaths(DOME_POSES.sad);
const HAPPY_TOP = HAPPY.top;
const HAPPY_BOTTOM = HAPPY.bottom; // control y 90 (old Q 85)

let frames: FrameRequestCallback[] = [];
function flushFrames(count = 1): void {
  for (let i = 0; i < count; i++) {
    const pending = frames;
    frames = [];
    pending.forEach((cb) => cb(performance.now()));
  }
}

/** Both control points' y (left eye, right eye) in `M x y C x1 y1 x2 y2 x y Z`. */
function controls(d: string | null | undefined): [number, number] {
  const n = (d ?? '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  return [n[3] ?? NaN, n[5] ?? NaN];
}
/** The control y when both eyes agree; NaN otherwise. */
function controlY(d: string | null | undefined): number {
  const [left, right] = controls(d);
  return left === right ? left : NaN;
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

  it('opens both bottom controls from the given shape, never above the floor', async () => {
    const m = await import('../../../src/ui/avatar-motion/lid-blend.js');
    const open = (d: string, v: number) => m.formatLidPath(m.openBottomLid(m.parseLidPath(d), v));
    // Same opening as the old Q lids: Q 110→70, 85→65, floor 62 are cubic 106.67→80, 90→76.67, 74.67.
    expect(controlY(open(m.NEUTRAL_LID_PATHS.bottom, 1))).toBeCloseTo(80, 1);
    expect(controlY(open(m.NEUTRAL_LID_PATHS.bottom, 0))).toBeCloseTo(106.67, 1);
    expect(controlY(open(HAPPY_BOTTOM, 0.5))).toBeCloseTo(76.67, 1);
    expect(m.LID_OPEN_FLOOR).toBeCloseTo(74.67, 1);
    expect(controlY(open(HAPPY_BOTTOM, 1))).toBeCloseTo(m.LID_OPEN_FLOOR, 1);
    expect(open(HAPPY_BOTTOM, 0)).toBe(HAPPY_BOTTOM);
  });

  it("lifts both eyes' bottom controls (index 5 as well as 3), each clamped at the floor", async () => {
    const m = await import('../../../src/ui/avatar-motion/lid-blend.js');
    const asymmetric = 'M0 100C33.33 96 66.67 86 100 100Z';
    const [left, right] = controls(
      m.formatLidPath(m.openBottomLid(m.parseLidPath(asymmetric), 0.5))
    );
    expect(left).toBeCloseTo(96 - 0.5 * m.LID_OPEN_RANGE, 1); // 82.67
    expect(right).toBeCloseTo(m.LID_OPEN_FLOOR, 1); // 86 - 13.33 = 72.67, held at 74.67
    // a symmetric pose opens evenly
    expect(controls(m.formatLidPath(m.openBottomLid(m.parseLidPath(HAPPY_BOTTOM), 0.5)))).toEqual([
      76.67, 76.67,
    ]);
  });

  it('halfway from happy to sad, both control points of both lids are halfway', async () => {
    const m = await import('../../../src/ui/avatar-motion/lid-blend.js');
    for (const lid of ['top', 'bottom'] as const) {
      const eased = m.formatLidPath(
        m.easeLidPath(m.parseLidPath(HAPPY[lid]), m.parseLidPath(SAD[lid]), 0.5)
      );
      const [hl, hr] = controls(HAPPY[lid]);
      const [sl, sr] = controls(SAD[lid]);
      const [el, er] = controls(eased);
      expect(el).toBeCloseTo((hl + sl) / 2, 1);
      expect(er).toBeCloseTo((hr + sr) / 2, 1);
    }
  });

  it('eases between shapes that share a template and snaps only for a foreign shape', async () => {
    const m = await import('../../../src/ui/avatar-motion/lid-blend.js');
    const from = m.parseLidPath(m.NEUTRAL_LID_PATHS.top);
    const eased = m.easeLidPath(from, m.parseLidPath(HAPPY_TOP), 0.5);
    expect(controlY(m.formatLidPath(eased))).toBeCloseTo((-6.67 + 16.67) / 2, 1);
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
    expect(opened).toBeLessThan(90);
    expect(opened).toBeGreaterThanOrEqual(74.66);
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
    expect(controlY(lidBottom().getAttribute('d'))).toBe(90);
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

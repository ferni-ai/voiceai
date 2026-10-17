/**
 * The face renderer draws faces with HTML layers moved by the Web Animations
 * API (no SVG geometry, no per-frame JS). jsdom has no element.animate, so a
 * stub records each animation the compositor would play.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFaceRenderer } from '../src/ui/face/face-renderer';

interface Played {
  el: Element;
  keyframes: Keyframe[];
  duration: number;
}
let played: Played[] = [];

beforeEach(() => {
  played = [];
  document.body.innerHTML = '<div id="coachAvatar"></div>';
  Element.prototype.animate = function (keyframes: Keyframe[], opts?: KeyframeAnimationOptions) {
    played.push({ el: this, keyframes, duration: Number(opts?.duration ?? 0) });
    return {
      playState: 'finished',
      finished: new Promise(() => undefined),
      cancel: () => undefined,
      commitStyles: () => undefined,
    } as unknown as Animation;
  } as typeof Element.prototype.animate;
});
afterEach(() => {
  document.body.innerHTML = '';
});

const root = (): HTMLElement => document.getElementById('coachAvatar') as HTMLElement;
const last = (cls: string): Played | undefined =>
  [...played].reverse().find((p) => (p.el as HTMLElement).classList.contains(cls));

describe('createFaceRenderer', () => {
  it('draws two eyes, each with its own lids, plus a smile crease under each', () => {
    createFaceRenderer(root());
    expect(root().querySelectorAll('.face-eye')).toHaveLength(2);
    expect(root().querySelectorAll('.face-eye .face-lid-top')).toHaveLength(2);
    expect(root().querySelectorAll('.face-eye .face-lid-arch')).toHaveLength(2);
    expect(root().querySelectorAll('.face-crease')).toHaveLength(2);
  });

  it('rebuilding (a hot reload) does not leave a second face behind', () => {
    createFaceRenderer(root());
    createFaceRenderer(root());
    expect(root().querySelectorAll('.face-layer')).toHaveLength(1);
  });

  it('happy lifts the arch in (the ^ ^) and shows the crease', () => {
    createFaceRenderer(root()).show('happy');
    expect(last('face-lid-arch')?.keyframes[1]).toEqual({
      transform: 'translateY(-45.0%)',
      opacity: 1,
    });
    expect(last('face-crease')?.keyframes[1]).toEqual({ opacity: 0.5 });
  });

  it('resting brings the upper lids most of the way down', () => {
    createFaceRenderer(root()).show('resting');
    expect(last('face-lid-top')?.keyframes[1]).toEqual({ transform: 'translateY(58.5%)' });
  });

  it('only animates transform and opacity, which the compositor can play', () => {
    const r = createFaceRenderer(root());
    r.show('happy');
    r.show('surprised');
    for (const p of played)
      for (const k of p.keyframes)
        for (const prop of Object.keys(k))
          expect(['transform', 'opacity', 'offset']).toContain(prop);
  });

  it('the next face starts where the last one came to rest', () => {
    const r = createFaceRenderer(root());
    r.show('happy');
    r.show('neutral');
    const leftArch = root().querySelector('.face-lid-arch');
    const arch = played.filter((p) => p.el === leftArch);
    expect(arch).toHaveLength(2);
    expect(arch[1].keyframes[0]).toEqual(arch[0].keyframes[1]);
    expect(arch[1].keyframes[0]).toEqual({ transform: 'translateY(-45.0%)', opacity: 1 });
  });

  it('a spring for a normal change, and no motion when asked for an instant change', () => {
    const r = createFaceRenderer(root());
    r.show('happy');
    expect(last('face-eye')?.duration).toBeGreaterThan(0);
    r.show('neutral', { instant: true });
    expect(last('face-eye')?.duration).toBe(0);
  });

  it('destroy removes the face', () => {
    createFaceRenderer(root()).destroy();
    expect(root().querySelector('.face-layer')).toBeNull();
  });
});

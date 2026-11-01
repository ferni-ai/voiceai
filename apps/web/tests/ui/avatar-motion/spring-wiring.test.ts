/**
 * Spring body wiring (behind ferni:spring-body, off by default): its transform
 * goes through a compositor transform layer that adds to breathing and the
 * body pulse instead of being hidden by them, and it follows turn events in
 * both speaker vocabularies.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MOTION_FLAG_KEYS } from '../../../src/config/motion-flags.js';

vi.mock('../../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { addTransformLayer } from '../../../src/ui/avatar-motion/compositor.js';
import {
  SPRING_BODY_TURN_EVENT,
  disposeSpringBody,
  initSpringBody,
  springTurnFrom,
} from '../../../src/ui/avatar-motion/spring-body.js';

interface FakeAnimation {
  playState: string;
  cancel: ReturnType<typeof vi.fn>;
  effect: {
    composite: CompositeOperation;
    frames: Keyframe[];
    setKeyframes(frames: Keyframe[]): void;
    getKeyframes(): Keyframe[];
    getTiming(): { fill: string };
  };
}

/** jsdom has no Web Animations: a tiny model of an element's animation list. */
function fakeElement() {
  const el = document.createElement('div');
  const list: FakeAnimation[] = [];
  const make = (frames: Keyframe[], composite: CompositeOperation): FakeAnimation => {
    const anim: FakeAnimation = {
      playState: 'running',
      cancel: vi.fn(() => {
        anim.playState = 'idle';
        list.splice(list.indexOf(anim), 1);
      }),
      effect: {
        composite,
        frames,
        setKeyframes(next) {
          this.frames = next;
        },
        getKeyframes() {
          return this.frames;
        },
        getTiming: () => ({ fill: 'both' }),
      },
    };
    list.push(anim);
    return anim;
  };
  const animate = vi.fn((frames: Keyframe[], opts: KeyframeAnimationOptions) =>
    make(frames, opts.composite ?? 'replace')
  );
  Object.defineProperty(el, 'animate', { value: animate, configurable: true });
  Object.defineProperty(el, 'getAnimations', { value: () => [...list], configurable: true });
  return { el, list, animate, make };
}

const transformOf = (a: FakeAnimation | undefined): unknown => a?.effect.frames[0]?.transform;

describe('compositor transform layer', () => {
  it('adds on top with one long-lived animation and updates it in place', () => {
    const { el, animate, list } = fakeElement();
    const layer = addTransformLayer(el);
    layer.set('scale(1.01)');
    layer.set('scale(1.02)');
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ composite: 'add', fill: 'both' })
    );
    expect(transformOf(list[0])).toBe('scale(1.02)');
    expect(el.style.transform).toBe('');
  });

  it('moves back on top when a later replace-mode transform would hide it', () => {
    const { el, animate, list, make } = fakeElement();
    const layer = addTransformLayer(el);
    layer.set('scale(1.01)');
    const breathing = make([{ transform: 'scale(1)' }], 'replace'); // breathing restart, flag off
    layer.set('scale(1.02)');
    expect(animate).toHaveBeenCalledTimes(2);
    expect(list.at(-1)?.effect.composite).toBe('add');
    expect(transformOf(list.at(-1))).toBe('scale(1.02)');
    expect(list).toContain(breathing); // the other owner's animation is left alone
    expect(list.filter((a) => a.effect.composite === 'add')).toHaveLength(1);
  });

  it('stays put under later additive animations (breathing with the compositor on)', () => {
    const { el, animate, make } = fakeElement();
    const layer = addTransformLayer(el);
    layer.set('scale(1.01)');
    make([{ transform: 'scale(1)' }], 'add');
    make([{ opacity: 0.5 }], 'replace');
    layer.set('scale(1.02)');
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it('comes back after someone else cancels every animation on the element', () => {
    const { el, animate, list } = fakeElement();
    const layer = addTransformLayer(el);
    layer.set('scale(1.01)');
    [...list].forEach((a) => a.cancel());
    layer.set('scale(1.02)');
    expect(animate).toHaveBeenCalledTimes(2);
    expect(transformOf(list[0])).toBe('scale(1.02)');
  });

  it('dispose cancels its animation', () => {
    const { el, list } = fakeElement();
    const layer = addTransformLayer(el);
    layer.set('scale(1.01)');
    layer.dispose();
    expect(list).toHaveLength(0);
  });
});

describe('spring body turn vocabulary', () => {
  it('accepts the turn driver names and the avatar contract names', () => {
    expect(springTurnFrom('ferni')).toBe('ferni');
    expect(springTurnFrom('speaking')).toBe('ferni');
    expect(springTurnFrom('user')).toBe('user');
    expect(springTurnFrom('listening')).toBe('user');
    expect(springTurnFrom('thinking')).toBe('thinking');
    expect(springTurnFrom('none')).toBe('none');
    expect(springTurnFrom('idle')).toBe('none');
    expect(springTurnFrom('toString')).toBeNull();
    expect(springTurnFrom(undefined)).toBeNull();
  });
});

describe('spring body on the compositor layer', () => {
  let body: ReturnType<typeof fakeElement>;

  beforeEach(() => {
    document.body.innerHTML = '<div id="coach"></div>';
    body = fakeElement();
    body.el.className = 'avatar-container';
    document.getElementById('coach')?.appendChild(body.el);
  });
  afterEach(() => {
    disposeSpringBody();
    localStorage.clear();
  });

  const turn = (speaker: string): boolean =>
    window.dispatchEvent(new CustomEvent(SPRING_BODY_TURN_EVENT, { detail: { speaker } }));
  const settle = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

  it('flag off: a turn event in either vocabulary animates nothing', async () => {
    expect(initSpringBody()).toBe(false);
    turn('speaking');
    turn('ferni');
    await settle(60);
    expect(body.animate).not.toHaveBeenCalled();
  });

  it('flag on: a contract-name turn moves the body, additively and on top of breathing', async () => {
    localStorage.setItem(MOTION_FLAG_KEYS.springBody, 'true');
    body.make([{ transform: 'scale(1)' }], 'replace'); // breathing, compositor off
    expect(initSpringBody()).toBe(true);
    turn('listening');
    await settle(60);
    body.make([{ transform: 'scale(1.001)' }], 'replace'); // breathing restarts mid-move
    await settle(60);
    expect(body.list.at(-1)?.effect.composite).toBe('add');
    expect(body.list.filter((a) => a.effect.composite === 'add')).toHaveLength(1);
    expect(body.el.style.transform).toBe('');
  });
});

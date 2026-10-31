/**
 * Turn gestures (ferni:turn-gestures, only with ferni:avatar-turns): an
 * anticipation inhale into speaking, a held thinking pose with slower breath,
 * and a settle plus blink when Ferni stops. Every gesture composites with
 * `add`, nothing moves under reduced motion, and with either flag off no turn
 * event moves the avatar.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MOTION_FLAG_KEYS } from '../../../src/config/motion-flags.js';

vi.mock('../../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import {
  AVATAR_TURN_EVENT,
  BLINK_KEYFRAMES,
  INHALE_MS,
  THINKING_BREATH_RATE,
  anticipationKeyframes,
  createTurnGestures,
  disposeTurnGestures,
  gesturesFor,
  initTurnGestures,
  phaseFrom,
  type TurnGesturesDeps,
} from '../../../src/ui/avatar-motion/turn-gestures.js';

interface Played {
  target: 'body' | 'eyes';
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  animation: FakeAnimation;
}

class FakeAnimation {
  cancelled = false;
  reversed = false;
  playbackRate = 1;
  onfinish: (() => void) | null = null;
  constructor(public iterations = 1) {}
  get effect(): { getTiming: () => { iterations: number } } {
    return { getTiming: () => ({ iterations: this.iterations }) };
  }
  cancel(): void {
    this.cancelled = true;
  }
  reverse(): void {
    this.reversed = true;
  }
  updatePlaybackRate(rate: number): void {
    this.playbackRate = rate;
  }
}

let played: Played[] = [];
let breathing: FakeAnimation;
let reduced = false;

function fakeElement(target: 'body' | 'eyes'): Element {
  return {
    animate: (keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
      const animation = new FakeAnimation();
      played.push({ target, keyframes, options, animation });
      return animation;
    },
  } as unknown as Element;
}

function makeDeps(): TurnGesturesDeps {
  const body = fakeElement('body');
  const eyes = fakeElement('eyes');
  const breath = { getAnimations: () => [breathing] } as unknown as Element;
  return {
    targets: { body: () => body, eyes: () => eyes, breath: () => breath },
    reducedMotion: () => reduced,
  };
}

function turn(speaker: string): void {
  window.dispatchEvent(new CustomEvent(AVATAR_TURN_EVENT, { detail: { speaker } }));
}

beforeEach(() => {
  played = [];
  breathing = new FakeAnimation(Infinity);
  reduced = false;
  localStorage.clear();
});

afterEach(() => {
  disposeTurnGestures();
  localStorage.clear();
});

describe('turn transitions', () => {
  it('reads both speaker vocabularies', () => {
    expect(phaseFrom('speaking')).toBe('speaking');
    expect(phaseFrom('ferni')).toBe('speaking');
    expect(phaseFrom('listening')).toBe('listening');
    expect(phaseFrom('user')).toBe('listening');
    expect(phaseFrom('thinking')).toBe('thinking');
    expect(phaseFrom('none')).toBe('listening');
    expect(phaseFrom('shouting')).toBeNull();
  });

  it('maps each change to its gestures', () => {
    expect(gesturesFor('thinking', 'speaking')).toEqual(['release-think', 'anticipate']);
    expect(gesturesFor('listening', 'thinking')).toEqual(['think']);
    expect(gesturesFor('speaking', 'listening')).toEqual(['settle-blink']);
    expect(gesturesFor('thinking', 'listening')).toEqual(['release-think']);
    expect(gesturesFor('speaking', 'speaking')).toEqual([]);
  });
});

describe('gestures', () => {
  it('inhales before speaking: lift and stretch inside 120-180 ms, then settles to rest', () => {
    expect(INHALE_MS).toBeGreaterThanOrEqual(120);
    expect(INHALE_MS).toBeLessThanOrEqual(180);
    const gestures = createTurnGestures(makeDeps());
    gestures.handle('thinking');
    played = [];
    gestures.handle('speaking');

    const body = played.find((p) => p.target === 'body');
    expect(body?.keyframes).toEqual(anticipationKeyframes().body);
    expect(body?.keyframes[1]?.transform).toBe('translateY(-2px) scaleY(1.015)');
    expect(body?.keyframes.at(-1)?.transform).toBe('translateY(0px) scaleY(1)');
    expect(played.find((p) => p.target === 'eyes')?.keyframes[1]?.transform).toBe('scaleY(1.06)');
    expect(played.every((p) => p.options.composite === 'add')).toBe(true);
  });

  it('holds the thinking pose with slower breath, then eases it back when speech starts', () => {
    const gestures = createTurnGestures(makeDeps());
    gestures.handle('listening');
    gestures.handle('thinking');

    const pose = played.filter((p) => p.options.fill === 'forwards');
    expect(pose.map((p) => p.target).sort()).toEqual(['body', 'eyes']);
    expect(pose.every((p) => p.options.composite === 'add')).toBe(true);
    expect(pose.find((p) => p.target === 'eyes')?.keyframes[1]?.transform).toBe(
      'translate(1.5px, -2px)'
    );
    expect(breathing.playbackRate).toBe(THINKING_BREATH_RATE);

    gestures.handle('speaking');
    expect(pose.every((p) => p.animation.reversed)).toBe(true);
    pose.forEach((p) => p.animation.onfinish?.());
    expect(pose.every((p) => p.animation.cancelled)).toBe(true);
    expect(breathing.playbackRate).toBe(1);
  });

  it('settles and blinks when Ferni stops, also when the next turn is nobody (none)', () => {
    const gestures = createTurnGestures(makeDeps());
    gestures.handle('ferni');
    played = [];
    gestures.handle('none');
    expect(played.find((p) => p.target === 'eyes')?.keyframes).toEqual(BLINK_KEYFRAMES);
  });

  it('settles and blinks the eyes (not the body) when Ferni stops speaking', () => {
    const gestures = createTurnGestures(makeDeps());
    gestures.handle('speaking');
    played = [];
    gestures.handle('listening');

    const blink = played.find((p) => p.target === 'eyes');
    expect(blink?.keyframes).toEqual(BLINK_KEYFRAMES);
    expect(played.find((p) => p.target === 'body')?.keyframes[1]?.transform).toBe(
      'translateY(1px) scaleY(0.993)'
    );
    expect(played.some((p) => p.target === 'body' && p.keyframes === BLINK_KEYFRAMES)).toBe(false);
  });

  it('plays nothing under reduced motion, but still releases a held pose', () => {
    const gestures = createTurnGestures(makeDeps());
    gestures.handle('thinking');
    const pose = [...played];
    reduced = true;
    played = [];
    gestures.handle('speaking');
    gestures.handle('listening');
    expect(played).toEqual([]);
    expect(pose.every((p) => p.animation.reversed)).toBe(true);
    expect(breathing.playbackRate).toBe(1);
  });

  it('reset drops a held pose at once', () => {
    const gestures = createTurnGestures(makeDeps());
    gestures.handle('thinking');
    gestures.reset();
    expect(played.every((p) => p.animation.cancelled)).toBe(true);
    expect(breathing.playbackRate).toBe(1);
  });
});

describe('flags', () => {
  it('follows ferni:avatar-turn events when both flags are on', () => {
    localStorage.setItem(MOTION_FLAG_KEYS.turnGestures, 'true');
    expect(initTurnGestures(true, makeDeps())).toBe(true);
    turn('thinking');
    turn('speaking');
    expect(played.some((p) => p.keyframes[1]?.transform === 'translateY(-2px) scaleY(1.015)')).toBe(
      true
    );
  });

  it('stays still when ferni:turn-gestures is off', () => {
    expect(initTurnGestures(true, makeDeps())).toBe(false);
    turn('thinking');
    turn('speaking');
    expect(played).toEqual([]);
  });

  it('stays still when the turn driver (ferni:avatar-turns) is off', () => {
    localStorage.setItem(MOTION_FLAG_KEYS.turnGestures, 'true');
    expect(initTurnGestures(false, makeDeps())).toBe(false);
    turn('thinking');
    turn('speaking');
    expect(played).toEqual([]);
  });

  it('drops the thinking pose when the call ends', () => {
    localStorage.setItem(MOTION_FLAG_KEYS.turnGestures, 'true');
    initTurnGestures(true, makeDeps());
    turn('thinking');
    document.dispatchEvent(new Event('ferni:disconnected'));
    expect(played.every((p) => p.animation.cancelled)).toBe(true);
  });
});

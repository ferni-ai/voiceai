/**
 * Avatar compositor (on by default; ferni:avatar-compositor = 'off' is the
 * kill switch): one writer per animated property. Breathing composites with
 * `add` so the speaking body pulse shows, the speaking system is the only
 * writer of the container's transform (the presence voice-pulse loop is gone,
 * and with it a getComputedStyle read every frame), the coach ring writer
 * stands down, and the body pulse stays within +8 %. Speaking-system body and
 * halo hold still under prefers-reduced-motion in both flag states.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../src/services/relationship-stage.service.js', () => ({
  relationshipStageService: { onSubtitleChange: () => () => undefined },
}));

const FLAG = 'ferni:avatar-compositor';
/** Set the kill switch for the 'off' cases; 'on' is the default. */
function setFlag(on: boolean): void {
  if (!on) localStorage.setItem(FLAG, 'off');
}
const REDUCED = '(prefers-reduced-motion: reduce)';

let frames: FrameRequestCallback[] = [];
function flushFrames(count = 1): void {
  for (let i = 0; i < count; i++) {
    const pending = frames;
    frames = [];
    pending.forEach((cb) => cb(performance.now()));
  }
}

function setReducedMotion(reduced: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: query === REDUCED ? reduced : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

function mountAvatar(): void {
  document.body.innerHTML = `
    <div id="coach">
      <div class="avatar-container">
        <div id="avatarRing"></div>
        <div id="coachAvatar"><span id="avatarText"></span></div>
        <svg class="avatar-lid-overlay"><path class="lid-top"></path><path class="lid-bottom"></path></svg>
      </div>
      <div id="personaName"></div><div id="personaSubtitle"></div><div id="statusIndicator"></div>
    </div>`;
}

interface AnimateCall {
  element: Element;
  options: KeyframeAnimationOptions | number | undefined;
}
let animateCalls: AnimateCall[] = [];

beforeEach(() => {
  vi.resetModules();
  frames = [];
  animateCalls = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  Element.prototype.animate = function animate(
    this: Element,
    _keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
    options?: number | KeyframeAnimationOptions
  ): Animation {
    animateCalls.push({ element: this, options });
    return { cancel: vi.fn(), onfinish: null } as unknown as Animation;
  };
  setReducedMotion(false);
  mountAvatar();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  document.getElementById('avatar-compositor-styles')?.remove();
});

const container = (): HTMLElement => document.querySelector('.avatar-container') as HTMLElement;
const ring = (): HTMLElement => document.getElementById('avatarRing') as HTMLElement;

function scaleYOf(transform: string): number {
  const match = /scaleY\(([\d.]+)\)/.exec(transform);
  return match ? Number(match[1]) : NaN;
}

describe('compositor flag helpers', () => {
  it('is on by default: breathing adds', async () => {
    const m = await import('../../src/ui/avatar-motion/compositor.js');
    expect(m.isAvatarCompositorEnabled()).toBe(true);
    expect(m.breathingComposite()).toBe('add');
  });

  it.each(['off', 'false'])('the kill switch %s: breathing replaces and the container is not claimed', async (value) => {
    localStorage.setItem(FLAG, value);
    const m = await import('../../src/ui/avatar-motion/compositor.js');
    expect(m.isAvatarCompositorEnabled()).toBe(false);
    expect(m.breathingComposite()).toBe('replace');
    expect(m.claimAvatarContainer(container())).toBe(false);
    expect(container().hasAttribute(m.COMPOSITOR_ATTR)).toBe(false);
    expect(document.getElementById('avatar-compositor-styles')).toBeNull();
  });

  it('with the flag on: breathing adds, the container is claimed and the CSS loop is switched off', async () => {
    const m = await import('../../src/ui/avatar-motion/compositor.js');
    expect(m.breathingComposite()).toBe('add');
    expect(m.claimAvatarContainer(container())).toBe(true);
    expect(container().hasAttribute(m.COMPOSITOR_ATTR)).toBe(true);
    const css = document.getElementById('avatar-compositor-styles')?.textContent ?? '';
    expect(css).toContain(`#coach.is-speaking .avatar-container[${m.COMPOSITOR_ATTR}]`);
    expect(css).toContain('animation: none');
  });

  it('cancels only finished, forward-filled, replace-mode transform animations', async () => {
    const m = await import('../../src/ui/avatar-motion/compositor.js');
    const fake = (playState: string, composite: string, fill: string, prop: string) => ({
      playState,
      cancel: vi.fn(),
      effect: {
        composite,
        getTiming: () => ({ fill }),
        getKeyframes: () => [{ [prop]: 'x' }],
      },
    });
    const stale = fake('finished', 'replace', 'forwards', 'transform');
    const running = fake('running', 'replace', 'forwards', 'transform');
    const additive = fake('finished', 'add', 'forwards', 'transform');
    const noFill = fake('finished', 'replace', 'none', 'transform');
    const filter = fake('finished', 'replace', 'forwards', 'filter');
    const el = document.createElement('div');
    (el as unknown as { getAnimations: () => unknown[] }).getAnimations = () => [
      stale,
      running,
      additive,
      noFill,
      filter,
    ];
    expect(m.releaseStaleTransformFills(el)).toBe(1);
    expect(stale.cancel).toHaveBeenCalledTimes(1);
    [running, additive, noFill, filter].forEach((a) => expect(a.cancel).not.toHaveBeenCalled());
  });
});

describe('speaking system body pulse', () => {
  it.each([
    ['off', false],
    ['on', true],
  ])('with the flag %s: writes the inline pulse capped at +8%%', async (_label, on) => {
    setFlag(on);
    const { speakingSystem } = await import('../../src/ui/speaking-system.ui.js');
    speakingSystem.init();
    speakingSystem.start();
    speakingSystem.updateVolume(5); // clamped to 1
    flushFrames(60);
    const scaleY = scaleYOf(container().style.transform);
    expect(scaleY).toBeGreaterThan(1.07);
    expect(scaleY).toBeLessThanOrEqual(1.08);
    expect(container().hasAttribute('data-avatar-compositor')).toBe(on);
    expect(ring().style.transform).toMatch(/^scale\(1\.01/);
  });

  it.each([
    ['off', false],
    ['on', true],
  ])(
    'with the flag %s and reduced motion: body and halo hold still, the lid still opens',
    async (_label, on) => {
      setFlag(on);
      localStorage.setItem('ferni:lid-blend', 'true'); // the lid mouth runs only under lid-blend
      setReducedMotion(true);
      const { speakingSystem } = await import('../../src/ui/speaking-system.ui.js');
      speakingSystem.init();
      speakingSystem.start();
      speakingSystem.updateVolume(1);
      flushFrames(30);
      expect(container().style.transform).toBe('');
      expect(ring().style.transform).toBe('');
      const waves = document.querySelectorAll<HTMLElement>('.speaking-halo-wave');
      expect(waves.length).toBeGreaterThan(0);
      waves.forEach((w) => expect(w.style.opacity).toBe('0'));
      const lid = document.querySelector('.lid-bottom')?.getAttribute('d') ?? '';
      // neutral bottom dome opened fully: cubic control 80 on both eyes (the old Q 50,70)
      expect(lid).toMatch(/^M0 100C33\.33 80(\.\d+)? 66\.67 80(\.\d+)? 100 100Z$/);
    }
  );
});

describe('presence breathing and voice pulse', () => {
  function breathingOptions(): KeyframeAnimationOptions {
    const call = animateCalls.find(
      (c) =>
        c.element === container() &&
        typeof c.options === 'object' &&
        c.options.iterations === Infinity
    );
    return (call?.options ?? {}) as KeyframeAnimationOptions;
  }

  /** Count every write to the container's inline transform. */
  function countTransformWrites(): { count: number } {
    const counter = { count: 0 };
    let proto: object | null = Object.getPrototypeOf(container().style) as object;
    while (proto && !Object.getOwnPropertyDescriptor(proto, 'transform')) {
      proto = Object.getPrototypeOf(proto) as object | null;
    }
    const descriptor = proto ? Object.getOwnPropertyDescriptor(proto, 'transform') : undefined;
    if (!proto || !descriptor?.set) throw new Error('no transform setter to spy on');
    const target = container().style;
    const { get, set } = descriptor;
    Object.defineProperty(target, 'transform', {
      configurable: true,
      get() {
        return get?.call(target) as string;
      },
      set(value: string) {
        counter.count++;
        set.call(target, value);
      },
    });
    return counter;
  }

  it.each([
    ['off', false],
    ['on', true],
  ])('with the flag %s: speaking never calls getComputedStyle per frame', async (_label, on) => {
    setFlag(on);
    const presence = await import('../../src/ui/presence.ui.js');
    presence.initPresenceUI();
    const spy = vi.spyOn(window, 'getComputedStyle');
    presence.setSpeaking(true);
    presence.setVoiceVolume(0.6);
    flushFrames(30);
    presence.setVoiceVolume(0.3);
    flushFrames(30);
    expect(spy).not.toHaveBeenCalled();
  });

  it('by default: the speaking system is the one writer of the container transform', async () => {
    const presence = await import('../../src/ui/presence.ui.js');
    presence.initPresenceUI();
    const writes = countTransformWrites();
    presence.setSpeaking(true);
    presence.setVoiceVolume(0.6);
    flushFrames(10);
    // One writer = one write per frame (the old voice-pulse loop made it two)
    expect(writes.count).toBe(10);
    expect(scaleYOf(container().style.transform)).toBeGreaterThan(1);
    expect(scaleYOf(container().style.transform)).toBeLessThanOrEqual(1.08);
  });

  it('by default: breathing adds and stopping speech leaves no replace-mode fill', async () => {
    const presence = await import('../../src/ui/presence.ui.js');
    presence.initPresenceUI();
    expect(breathingOptions().composite).toBe('add');
    presence.setSpeaking(true);
    presence.setVoiceVolume(0.6);
    flushFrames(5);
    expect(container().style.getPropertyValue('--voice-scale-y')).toBe('');
    // The speaking system received the volume synchronously (no per-frame import).
    expect(scaleYOf(container().style.transform)).toBeGreaterThan(1);
    animateCalls = [];
    presence.setSpeaking(false);
    const replaceFills = animateCalls.filter(
      (c) =>
        c.element === container() &&
        typeof c.options === 'object' &&
        c.options.fill === 'forwards' &&
        c.options.composite === undefined
    );
    expect(replaceFills).toHaveLength(0);
  });

  it('with the kill switch off: breathing replaces', async () => {
    setFlag(false);
    const presence = await import('../../src/ui/presence.ui.js');
    presence.initPresenceUI();
    expect(breathingOptions().composite).toBe('replace');
  });

  it('setVoicePulseEnabled(false) stops volume reaching the body pulse', async () => {
    const presence = await import('../../src/ui/presence.ui.js');
    presence.initPresenceUI();
    presence.setVoicePulseEnabled(false);
    presence.setSpeaking(true);
    presence.setVoiceVolume(1);
    flushFrames(30);
    const transform = container().style.transform;
    expect(transform === '' || scaleYOf(transform) === 1).toBe(true);
    presence.setVoicePulseEnabled(true);
  });
});

describe('coach ring writer', () => {
  it.each([
    ['off', false],
    ['on', true],
  ])('with the flag %s', async (_label, on) => {
    setFlag(on);
    const coach = await import('../../src/ui/coach.ui.js');
    coach.initCoachUI();
    ring().style.transform = '';
    coach.setVisualizationVolume(1);
    if (on) expect(ring().style.transform).toBe('');
    else expect(ring().style.transform).toBe('scale(1.06)');
  });
});

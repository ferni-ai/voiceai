/**
 * Avatar compositor (behind ferni:avatar-compositor, off by default): one
 * writer per animated property. Breathing composites with `add` so the
 * speaking body pulse shows, the presence voice pulse and the coach ring
 * writer stand down, and the body pulse stays within +8 %. Speaking-system
 * body and halo hold still under prefers-reduced-motion in both flag states.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../src/services/relationship-stage.service.js', () => ({
  relationshipStageService: { onSubtitleChange: () => () => undefined },
}));

const FLAG = 'ferni:avatar-compositor';
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
  document.getElementById('avatar-compositor-styles')?.remove();
});

const container = (): HTMLElement => document.querySelector('.avatar-container') as HTMLElement;
const ring = (): HTMLElement => document.getElementById('avatarRing') as HTMLElement;

function scaleYOf(transform: string): number {
  const match = /scaleY\(([\d.]+)\)/.exec(transform);
  return match ? Number(match[1]) : NaN;
}

describe('compositor flag helpers', () => {
  it('is off by default: breathing replaces and the container is not claimed', async () => {
    const m = await import('../../src/ui/avatar-motion/compositor.js');
    expect(m.isAvatarCompositorEnabled()).toBe(false);
    expect(m.breathingComposite()).toBe('replace');
    expect(m.claimAvatarContainer(container())).toBe(false);
    expect(container().hasAttribute(m.COMPOSITOR_ATTR)).toBe(false);
    expect(document.getElementById('avatar-compositor-styles')).toBeNull();
  });

  it('with the flag on: breathing adds, the container is claimed and the CSS loop is switched off', async () => {
    localStorage.setItem(FLAG, 'true');
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
    if (on) localStorage.setItem(FLAG, 'true');
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
      if (on) localStorage.setItem(FLAG, 'true');
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
      expect(lid).toMatch(/Q 50,70(\.\d+)? /);
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

  it('with the flag off: breathing replaces and the presence voice pulse still writes', async () => {
    const presence = await import('../../src/ui/presence.ui.js');
    presence.initPresenceUI();
    expect(breathingOptions().composite).toBe('replace');
    presence.setSpeaking(true);
    presence.setVoiceVolume(0.6);
    flushFrames(5);
    expect(container().style.getPropertyValue('--voice-scale-y')).not.toBe('');
  });

  it('with the flag on: breathing adds and the presence voice pulse stands down', async () => {
    localStorage.setItem(FLAG, 'true');
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
});

describe('coach ring writer', () => {
  it.each([
    ['off', false],
    ['on', true],
  ])('with the flag %s', async (_label, on) => {
    if (on) localStorage.setItem(FLAG, 'true');
    const coach = await import('../../src/ui/coach.ui.js');
    coach.initCoachUI();
    ring().style.transform = '';
    coach.setVisualizationVolume(1);
    if (on) expect(ring().style.transform).toBe('');
    else expect(ring().style.transform).toBe('scale(1.06)');
  });
});

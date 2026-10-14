/**
 * No frame loop runs while nothing changes.
 *
 * Measured in the dev app (phone profile, 4x CPU): breath-sync,
 * emotional-color, the glow controller and the GSAP ticker each ran a frame
 * loop 60 times a second forever, at idle and with reduced motion on, and the
 * glow controller ran one with no element attached at all. Each loop now runs
 * only while something is changing, stops once it settles, stops while the
 * page is hidden, and restarts on a change. The connecting pulse honours
 * reduced motion, and the lamp breathing no longer keeps the GSAP ticker awake.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

let frames = new Map<number, FrameRequestCallback>();
let nextFrameId = 1;
let clock = 0;
let reducedMotion = false;
let hidden = false;

/** Run queued animation frames, `count` times, 16 ms apart. */
function step(count: number): void {
  for (let i = 0; i < count; i++) {
    clock += 16;
    const due = [...frames.values()];
    frames = new Map();
    for (const cb of due) cb(clock);
  }
}

const looping = (): boolean => frames.size > 0;

function setHidden(value: boolean): void {
  hidden = value;
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.resetModules();
  frames = new Map();
  clock = 0;
  reducedMotion = false;
  hidden = false;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.set(nextFrameId, cb);
    return nextFrameId++;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  window.matchMedia = ((query: string) => ({
    matches: reducedMotion && query.includes('reduce'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('breath sync', () => {
  it('runs no frame loop without a subscriber, and the phase still moves when read', async () => {
    const { initBreathSync, destroyBreathSync } = await import('../../src/systems/breath-sync.js');
    const breath = initBreathSync();
    step(3);
    expect(looping()).toBe(false);
    const first = breath.getPhase();
    clock += 500;
    expect(breath.getPhase()).not.toBe(first);
    destroyBreathSync();
  });

  it('runs while subscribed, stops while hidden, restarts when shown, and stops after unsubscribe', async () => {
    const { initBreathSync, destroyBreathSync } = await import('../../src/systems/breath-sync.js');
    const breath = initBreathSync();
    const listener = vi.fn();
    const unsubscribe = breath.subscribe(listener);
    step(5);
    expect(listener).toHaveBeenCalledTimes(5);
    expect(looping()).toBe(true);

    setHidden(true);
    step(5);
    expect(looping()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(5);

    setHidden(false);
    step(2);
    expect(listener).toHaveBeenCalledTimes(7);

    unsubscribe();
    step(2);
    expect(looping()).toBe(false);
    destroyBreathSync();
  });

  it('runs no frame loop under reduced motion, even with a subscriber', async () => {
    reducedMotion = true;
    const { initBreathSync, destroyBreathSync } = await import('../../src/systems/breath-sync.js');
    const listener = vi.fn();
    initBreathSync().subscribe(listener);
    step(5);
    expect(looping()).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    destroyBreathSync();
  });
});

describe('emotional color', () => {
  it('stops after a transition settles and restarts on the next emotion', async () => {
    const { initEmotionalColor, destroyEmotionalColor } = await import('../../src/systems/emotional-color.js');
    const color = initEmotionalColor();
    step(2);
    expect(looping()).toBe(false); // idle from the start

    color.setEmotion('joy');
    expect(looping()).toBe(true);
    step(200); // the 1.5 s transition is ~94 frames
    expect(looping()).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--emotional-state')).toBe('joy');

    color.setEmotion('calm');
    expect(looping()).toBe(true);
    destroyEmotionalColor();
  });

  it('stops while hidden mid-transition and finishes when shown', async () => {
    const { initEmotionalColor, destroyEmotionalColor } = await import('../../src/systems/emotional-color.js');
    const color = initEmotionalColor();
    color.setEmotion('celebration');
    step(5);
    setHidden(true);
    step(5);
    expect(looping()).toBe(false);
    setHidden(false);
    expect(looping()).toBe(true);
    step(200);
    expect(looping()).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--emotional-state')).toBe('celebration');
    destroyEmotionalColor();
  });

  it('keeps modulating for a subscriber, but not under reduced motion', async () => {
    const { initEmotionalColor, destroyEmotionalColor } = await import('../../src/systems/emotional-color.js');
    const color = initEmotionalColor();
    const listener = vi.fn();
    color.subscribe(listener);
    step(30);
    expect(looping()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(30);

    reducedMotion = true;
    step(2);
    expect(looping()).toBe(false);
    destroyEmotionalColor();
  });
});

describe('glow controller', () => {
  async function controller() {
    const { GlowController } = await import('../../src/services/glow-controller.service.js');
    return new GlowController();
  }

  it('runs no frame loop while no element is attached', async () => {
    const glow = await controller();
    glow.startBreathing();
    step(3);
    expect(looping()).toBe(false);
  });

  it('breathes while attached, stops while hidden and restarts when shown', async () => {
    const glow = await controller();
    const el = document.createElement('div');
    glow.attach(el);
    glow.startBreathing();
    step(3);
    expect(looping()).toBe(true);
    expect(el.style.boxShadow).not.toBe('');

    setHidden(true);
    step(2);
    expect(looping()).toBe(false);
    setHidden(false);
    expect(looping()).toBe(true);
    glow.detach();
  });

  it('holds the breathing glow still under reduced motion', async () => {
    reducedMotion = true;
    const glow = await controller();
    glow.attach(document.createElement('div'));
    glow.startBreathing();
    step(3);
    expect(looping()).toBe(false);
    glow.detach();
  });

  it('settles while speaking at a steady level and restarts when the level moves', async () => {
    const glow = await controller();
    glow.attach(document.createElement('div'));
    glow.setSpeaking(true);
    step(5);
    expect(looping()).toBe(false);

    glow.updateVoiceAmplitude(0.8);
    expect(looping()).toBe(true);
    step(3);
    expect(looping()).toBe(false);

    glow.setSpeaking(false); // back to idle
    step(2);
    expect(looping()).toBe(false);
    glow.detach();
  });
});

describe('connecting pulse', () => {
  it('does not loop under reduced motion', async () => {
    reducedMotion = true;
    const calls: Array<KeyframeAnimationOptions | number | undefined> = [];
    Element.prototype.animate = function animate(
      this: Element,
      _keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
      options?: number | KeyframeAnimationOptions
    ): Animation {
      if (this.classList.contains('unified-indicator')) calls.push(options);
      return { cancel: vi.fn(), onfinish: null } as unknown as Animation;
    };
    document.body.innerHTML = '<div class="avatar-container"></div>';
    const indicator = await import('../../src/ui/unified-indicator.ui.js');
    indicator.initUnifiedIndicator();
    calls.length = 0;
    window.dispatchEvent(new CustomEvent('ferni:connection-state', { detail: { state: 'connecting' } }));
    expect(calls.length).toBeGreaterThan(0);
    for (const options of calls) {
      expect(typeof options === 'object' ? options.iterations : 1).not.toBe(Infinity);
    }
    indicator.disposeUnifiedIndicator();
  });
});

describe('lamp breathing', () => {
  it('is a WAAPI scale loop, not an endless GSAP timeline that keeps the ticker awake', async () => {
    const timelines: unknown[] = [];
    vi.doMock('../../src/utils/gsap-setup.js', () => {
      const tl = (vars?: unknown) => {
        timelines.push(vars);
        const t: Record<string, unknown> = {};
        for (const k of ['to', 'set', 'fromTo', 'add', 'call']) t[k] = () => t;
        t.kill = vi.fn();
        t.pause = vi.fn();
        t.resume = vi.fn();
        return t;
      };
      return { gsap: { timeline: tl, to: vi.fn(), set: vi.fn(), killTweensOf: vi.fn() } };
    });
    const keyframesSeen: Keyframe[][] = [];
    Element.prototype.animate = function animate(
      this: Element,
      keyframes: Keyframe[] | PropertyIndexedKeyframes | null
    ): Animation {
      if (this.id === 'coachAvatar') keyframesSeen.push(keyframes as Keyframe[]);
      return { cancel: vi.fn(), pause: vi.fn(), play: vi.fn(), onfinish: null } as unknown as Animation;
    };
    document.body.innerHTML = '<div class="avatar-container"><div id="coachAvatar"></div></div>';
    const lamp = await import('../../src/ui/avatar-lamp.ui.js');
    lamp.initAvatarLamp();
    const endless = timelines.filter((vars) => (vars as { repeat?: number } | undefined)?.repeat === -1);
    expect(endless).toHaveLength(0);
    expect(keyframesSeen.some((frames) => frames.some((f) => 'scale' in f))).toBe(true);
    lamp.disposeAvatarLamp();
    vi.doUnmock('../../src/utils/gsap-setup.js');
  });
});

describe('mobile delights', () => {
  async function initDelights() {
    const animated: Element[] = [];
    Element.prototype.animate = function animate(this: Element): Animation {
      animated.push(this);
      return { cancel: vi.fn(), onfinish: null } as unknown as Animation;
    };
    (window as unknown as { DeviceOrientationEvent: unknown }).DeviceOrientationEvent = class {};
    document.body.innerHTML =
      '<div class="avatar-container"><div id="avatarRing"></div><div id="coachAvatar"></div></div>';
    const delights = await import('../../src/ui/mobile-delights.ui.js');
    delights.initMobileDelights({
      enableTapToLook: false,
      enablePullToConnect: false,
      enableHaptics: false,
      enableImmersiveMode: false,
    });
    await Promise.resolve(); // initTiltParallax is async
    return { delights, animated };
  }

  it('the ambient glow breathes on the compositor, not in a frame loop', async () => {
    const { delights, animated } = await initDelights();
    step(5);
    expect(animated.some((el) => el.classList.contains('ambient-glow'))).toBe(true);
    expect(looping()).toBe(false);
    delights.disposeMobileDelights();
  });

  it('tilt runs only while easing toward an orientation event, on the translate property', async () => {
    const { delights } = await initDelights();
    step(5);
    expect(looping()).toBe(false);

    const event = Object.assign(new Event('deviceorientation'), { beta: 60, gamma: 20 });
    window.dispatchEvent(event);
    expect(looping()).toBe(true);
    step(200);
    expect(looping()).toBe(false);

    const avatar = document.getElementById('coachAvatar') as HTMLElement;
    expect(avatar.style.translate).toMatch(/px/);
    expect(avatar.style.transform).toBe(''); // transform belongs to GSAP and the speaking system
    delights.disposeMobileDelights();
  });
});

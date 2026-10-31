/**
 * Natural blink (behind ferni:natural-blink, off by default): the Pixar blink
 * (lid falls from the top, 60 ms down and 90 ms up) composited on the current
 * eye shape, a small body dip after it, irregular gaps at the persona's pace,
 * blinks while idle, listening and speaking, a blink at turn changes, none
 * mid-expression or in a hidden tab, and the 6 s CSS loop and presence's
 * whole-body zen blink stand down. Off: nothing changes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../../src/services/relationship-stage.service.js', () => ({
  relationshipStageService: { onSubtitleChange: () => () => undefined },
}));

const FLAG = 'ferni:natural-blink';
const REDUCED = '(prefers-reduced-motion: reduce)';

interface AnimateCall {
  element: Element;
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
}
let animateCalls: AnimateCall[] = [];

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
    <div id="coach" class="is-connected">
      <div class="avatar-container">
        <div id="avatarRing"></div>
        <div id="coachAvatar">
          <svg id="avatarEyes" class="avatar-eyes">
            <ellipse class="eye-main eye-left"></ellipse>
            <ellipse class="eye-main eye-right"></ellipse>
          </svg>
          <span id="avatarText"></span>
        </div>
      </div>
      <div id="personaName"></div><div id="personaSubtitle"></div><div id="statusIndicator"></div>
    </div>`;
}

const eyeBlinks = (): AnimateCall[] =>
  animateCalls.filter((c) => c.element.classList.contains('eye-main'));
const bodyDips = (): AnimateCall[] => animateCalls.filter((c) => c.element.id === 'coachAvatar');

/** Small seeded PRNG (mulberry32) so a simulated minute is repeatable. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The eye's top and bottom edges after `transform` (eye viewBox units). */
function eyeEdges(transform: string): { top: number; bottom: number } {
  const drop = Number(/translateY\(([-\d.]+)px\)/.exec(transform)?.[1] ?? 0);
  const scale = Number(/scaleY\(([-\d.]+)\)/.exec(transform)?.[1] ?? 1);
  const origin = 60; // .eye-main: transform-origin center 60% of the 100-unit viewBox
  const at = (y: number): number => origin + scale * (y - origin) + drop;
  return { top: at(36), bottom: at(64) }; // ellipse cy 50, ry 14
}

function turn(speaker: string): void {
  window.dispatchEvent(new CustomEvent('ferni:avatar-turn', { detail: { speaker } }));
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 12, 14, 0, 0)); // mid-afternoon: light blinks
  localStorage.clear();
  animateCalls = [];
  Element.prototype.animate = function animate(
    this: Element,
    keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
    options?: number | KeyframeAnimationOptions
  ): Animation {
    animateCalls.push({
      element: this,
      keyframes: (keyframes ?? []) as Keyframe[],
      options: (typeof options === 'object' ? options : {}) as KeyframeAnimationOptions,
    });
    return { cancel: vi.fn(), onfinish: null } as unknown as Animation;
  };
  setReducedMotion(false);
  mountAvatar();
});

afterEach(async () => {
  const m = await import('../../../src/ui/avatar-motion/natural-blink.js');
  m.disposeNaturalBlink();
  document.getElementById('natural-blink-styles')?.remove();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('with the flag off', () => {
  it('does not start, claim the eyes or blink on a turn change', async () => {
    const m = await import('../../../src/ui/avatar-motion/natural-blink.js');
    expect(m.initNaturalBlink()).toBe(false);
    expect(document.getElementById('coach')?.hasAttribute(m.NATURAL_BLINK_ATTR)).toBe(false);
    expect(document.getElementById('natural-blink-styles')).toBeNull();
    turn('speaking');
    vi.advanceTimersByTime(20_000);
    expect(eyeBlinks()).toHaveLength(0);
  });

  it('leaves the presence zen blink in place', async () => {
    const presence = await import('../../../src/ui/presence.ui.js');
    presence.initPresenceUI();
    animateCalls = [];
    presence.setListening(true);
    const zen = animateCalls.filter(
      (c) =>
        c.element.id === 'coachAvatar' &&
        c.keyframes.some((k) => /scaleY\(0\.15\)/.test(String(k.transform)))
    );
    expect(zen).toHaveLength(1);
  });
});

describe('with the build value on (VITE_NATURAL_BLINK)', () => {
  it('claims the eyes with no browser override', async () => {
    vi.stubEnv('VITE_NATURAL_BLINK', 'on');
    const m = await import('../../../src/ui/avatar-motion/natural-blink.js');
    expect(m.initNaturalBlink()).toBe(true);
    expect(document.getElementById('coach')?.hasAttribute(m.NATURAL_BLINK_ATTR)).toBe(true);
  });

  it("stays off in a browser that overrides it with 'off'", async () => {
    vi.stubEnv('VITE_NATURAL_BLINK', 'on');
    localStorage.setItem(FLAG, 'off');
    const m = await import('../../../src/ui/avatar-motion/natural-blink.js');
    expect(m.initNaturalBlink()).toBe(false);
    expect(document.getElementById('coach')?.hasAttribute(m.NATURAL_BLINK_ATTR)).toBe(false);
  });
});

describe('with the flag on', () => {
  beforeEach(() => localStorage.setItem(FLAG, 'true'));

  it('claims the eyes and switches off the 6 s CSS loop', async () => {
    const m = await import('../../../src/ui/avatar-motion/natural-blink.js');
    expect(m.initNaturalBlink()).toBe(true);
    expect(document.getElementById('coach')?.hasAttribute(m.NATURAL_BLINK_ATTR)).toBe(true);
    const css = document.getElementById('natural-blink-styles')?.textContent ?? '';
    expect(css).toContain(`#coach.is-connected[${m.NATURAL_BLINK_ATTR}]`);
    expect(css).toContain('animation: none');
  });

  it('blinks the eyes, added on top of their shape, about 150 ms, then dips the body', async () => {
    const m = await import('../../../src/ui/avatar-motion/natural-blink.js');
    m.initNaturalBlink();
    vi.advanceTimersByTime(60_000);
    const blinks = eyeBlinks();
    expect(blinks.length).toBeGreaterThanOrEqual(2 * 10); // two eyes, 10+ blinks a minute
    for (const b of blinks) {
      expect(b.options.composite).toBe('add');
      expect(b.options.duration).toBe(150);
    }
    // One dip per blink, nothing else animated.
    expect(bodyDips()).toHaveLength(blinks.length / 2);
    expect(animateCalls).toHaveLength(blinks.length + bodyDips().length);
  });

  it('drops the lid from the top: fast down (60 ms), then shut and up over 90 ms', async () => {
    const m = await import('../../../src/ui/avatar-motion/natural-blink.js');
    const frames = m.BLINK_FRAMES.light;
    const closed = frames.find((f) => f.offset !== undefined)!;
    const shut = eyeEdges(String(closed.transform));
    const open = eyeEdges(String(frames[0]!.transform));
    expect(open.bottom - shut.bottom).toBeLessThanOrEqual(0.5); // the lower edge stays
    expect(shut.top - open.top).toBeGreaterThan(20); // the upper lid travels
    const duration = m.BLINK_TIMING.light.duration;
    const closing = Number(closed.offset) * duration;
    expect(closing).toBeGreaterThanOrEqual(50);
    expect(closing).toBeLessThan(duration - closing); // opens slower than it closes
    const shutFrames = frames.filter((f) => f.transform === closed.transform);
    expect(shutFrames.length).toBe(2); // rests shut a moment, so the blink reads
    for (const f of m.BLINK_FRAMES.heavy.filter((x) => x.offset !== undefined)) {
      const e = eyeEdges(String(f.transform));
      expect(open.bottom - e.bottom).toBeLessThanOrEqual(0.5);
    }
  });

  it('dips the body 1-2 px about 100 ms into the blink and recovers over 300 ms', async () => {
    const m = await import('../../../src/ui/avatar-motion/natural-blink.js');
    m.drawBlink('light');
    const [dip] = bodyDips();
    expect(dip).toBeDefined();
    expect(dip!.options.composite).toBe('add');
    expect(Number(dip!.options.delay)).toBeGreaterThanOrEqual(80);
    expect(Number(dip!.options.delay)).toBeLessThanOrEqual(150);
    const low = dip!.keyframes.find((k) => k.offset !== undefined)!;
    const depth = Number(/0px ([\d.]+)px/.exec(String(low.translate))?.[1]);
    expect(depth).toBeGreaterThanOrEqual(1);
    expect(depth).toBeLessThanOrEqual(2);
    const recovery = (1 - Number(low.offset)) * Number(dip!.options.duration);
    expect(recovery).toBe(300);
  });

  it('over a simulated minute (idle, listening, speaking): irregular 2-10 s gaps, 150 ms blinks, blinks in every state', async () => {
    const m = await import('../../../src/ui/avatar-motion/natural-blink.js');
    vi.spyOn(Math, 'random').mockImplementation(seeded(5));
    const coach = document.getElementById('coach')!;
    m.initNaturalBlink();
    const onsets: { at: number; state: string }[] = [];
    const states = ['idle', 'is-listening', 'is-speaking'];
    for (let t = 0; t < 60_000; t += 100) {
      const state = states[Math.floor(t / 20_000)]!;
      coach.classList.remove('is-listening', 'is-speaking');
      if (state !== 'idle') coach.classList.add(state);
      const before = eyeBlinks().length;
      vi.advanceTimersByTime(100);
      if (eyeBlinks().length > before) onsets.push({ at: t, state });
    }
    for (const b of eyeBlinks()) {
      expect(Number(b.options.duration)).toBeGreaterThanOrEqual(100);
      expect(Number(b.options.duration)).toBeLessThanOrEqual(250);
    }
    expect(onsets.filter((o) => o.state === 'is-listening').length).toBeGreaterThanOrEqual(1);
    expect(onsets.filter((o) => o.state === 'is-speaking').length).toBeGreaterThanOrEqual(1);
    const blinks = onsets.filter((o, i) => i === 0 || o.at - onsets[i - 1]!.at >= 500); // doubles are one blink
    const gaps = blinks.slice(1).map((o, i) => o.at - blinks[i]!.at);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(1900); // 100 ms sampling
    expect(Math.max(...gaps)).toBeLessThanOrEqual(10_000);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const sd = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length);
    expect(sd / mean).toBeGreaterThanOrEqual(0.3);
  });

  it("blinks at the persona's pace: Jordan sooner than Ferni", async () => {
    const { appState } = await import('../../../src/state/app.state.js');
    const { getPersona } = await import('../../../src/config/personas.js');
    const m = await import('../../../src/ui/avatar-motion/natural-blink.js');
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // base gap 2.3 s (2 s + half the edge spread), no doubles
    appState.set('activePersona', getPersona('jordan-taylor'));
    m.initNaturalBlink();
    vi.advanceTimersByTime(1900); // Jordan: 0.8 x 2.3 s = 1.84 s
    expect(eyeBlinks()).toHaveLength(2);
    m.disposeNaturalBlink();
    animateCalls = [];
    appState.set('activePersona', getPersona('ferni'));
    m.initNaturalBlink();
    vi.advanceTimersByTime(1900);
    expect(eyeBlinks()).toHaveLength(0);
    vi.advanceTimersByTime(400); // Ferni: 2.3 s
    expect(eyeBlinks()).toHaveLength(2);
  });

  it('holds the blink while an expression is changing', async () => {
    // gsap is the CDN global that ferni-expressions tweens the lids with.
    const tweening = vi.fn((_target: Element) => true);
    Object.assign(window, { gsap: { isTweening: tweening } });
    const m = await import('../../../src/ui/avatar-motion/natural-blink.js');
    const overlay = document.createElement('div');
    overlay.className = 'avatar-lid-overlay';
    overlay.innerHTML = '<svg><path class="lid-top"></path></svg>';
    document.getElementById('coachAvatar')!.appendChild(overlay);
    m.initNaturalBlink();
    vi.advanceTimersByTime(20_000);
    expect(eyeBlinks()).toHaveLength(0);
    expect(tweening).toHaveBeenCalledWith(overlay.querySelector('.lid-top'));
    tweening.mockReturnValue(false);
    vi.advanceTimersByTime(400);
    expect(eyeBlinks().length).toBeGreaterThan(0);
    Reflect.deleteProperty(window, 'gsap');
  });

  it('pauses in a hidden tab and resumes when it shows again', async () => {
    const m = await import('../../../src/ui/avatar-motion/natural-blink.js');
    let hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    m.initNaturalBlink();
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(30_000);
    expect(eyeBlinks()).toHaveLength(0);
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(10_000);
    expect(eyeBlinks().length).toBeGreaterThan(0);
    Reflect.deleteProperty(document, 'hidden');
  });

  it('blinks with a turn change, once per change', async () => {
    const m = await import('../../../src/ui/avatar-motion/natural-blink.js');
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // gaps ~3.2 s, cues always land, no doubles
    m.initNaturalBlink();
    vi.advanceTimersByTime(1000);
    expect(eyeBlinks()).toHaveLength(0);
    turn('speaking');
    vi.advanceTimersByTime(300);
    expect(eyeBlinks()).toHaveLength(2);
    vi.advanceTimersByTime(700);
    turn('speaking'); // same speaker: not a change
    vi.advanceTimersByTime(300);
    expect(eyeBlinks()).toHaveLength(2);
  });

  it('blinks slow and heavy when Ferni is sad, and late at night', async () => {
    const m = await import('../../../src/ui/avatar-motion/natural-blink.js');
    document.getElementById('coach')?.setAttribute('data-emotion', 'sad');
    m.initNaturalBlink();
    vi.advanceTimersByTime(10_000);
    expect(eyeBlinks().length).toBeGreaterThan(0);
    expect(eyeBlinks().every((b) => Number(b.options.duration) > 150)).toBe(true);
    expect(m.isLateNight(new Date(2026, 9, 12, 23, 30))).toBe(true);
    expect(m.isLateNight(new Date(2026, 9, 12, 2, 0))).toBe(true);
    expect(m.isLateNight(new Date(2026, 9, 12, 14, 0))).toBe(false);
  });

  it('holds still under reduced motion and in deep sleep', async () => {
    const m = await import('../../../src/ui/avatar-motion/natural-blink.js');
    setReducedMotion(true);
    m.initNaturalBlink();
    vi.advanceTimersByTime(30_000);
    expect(eyeBlinks()).toHaveLength(0);
    expect(bodyDips()).toHaveLength(0);
    setReducedMotion(false);
    document.getElementById('coach')?.classList.add('deep-sleep-mode');
    vi.advanceTimersByTime(30_000);
    expect(eyeBlinks()).toHaveLength(0);
  });

  it('stands the presence zen blink down', async () => {
    const presence = await import('../../../src/ui/presence.ui.js');
    presence.initPresenceUI();
    animateCalls = [];
    presence.setListening(true);
    const zen = animateCalls.filter(
      (c) =>
        c.element.id === 'coachAvatar' &&
        c.keyframes.some((k) => /scaleY\(0\.15\)/.test(String(k.transform)))
    );
    expect(zen).toHaveLength(0);
  });

  it('stops blinking and releases the eyes on dispose', async () => {
    const m = await import('../../../src/ui/avatar-motion/natural-blink.js');
    m.initNaturalBlink();
    m.disposeNaturalBlink();
    expect(document.getElementById('coach')?.hasAttribute(m.NATURAL_BLINK_ATTR)).toBe(false);
    vi.advanceTimersByTime(30_000);
    turn('listening');
    vi.advanceTimersByTime(1000);
    expect(eyeBlinks()).toHaveLength(0);
  });
});

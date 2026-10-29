/**
 * Natural blink (behind ferni:natural-blink, off by default): eye-only blinks
 * composited on the current eye shape, a blink at turn changes, the 6 s CSS
 * loop and presence's whole-body zen blink stand down. Off: nothing changes.
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

  it('blinks the eyes only, added on top of their shape, about 150 ms', async () => {
    const m = await import('../../../src/ui/avatar-motion/natural-blink.js');
    m.initNaturalBlink();
    vi.advanceTimersByTime(60_000);
    const blinks = eyeBlinks();
    expect(blinks.length).toBeGreaterThanOrEqual(2 * 10); // two eyes, 10+ blinks a minute
    expect(animateCalls.every((c) => c.element.classList.contains('eye-main'))).toBe(true);
    for (const b of blinks) {
      expect(b.options.composite).toBe('add');
      expect(b.options.duration).toBe(150);
    }
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

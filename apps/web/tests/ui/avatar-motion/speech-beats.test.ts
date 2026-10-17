/**
 * Speech beats (behind ferni:speech-beats, off by default): during Ferni's
 * turn, stressed-syllable onsets in the agent RMS envelope draw a tiny head
 * beat through an additive compositor layer, the canned 3.5 s CSS loop stands
 * down, and phrase ends are dispatched as `ferni:avatar-phrase-end`.
 * Off: nothing changes.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

let rms: number | null = 0;
vi.mock('../../../src/services/audio.service.js', () => ({
  audioService: { getRmsVolume: () => rms },
}));

const FLAG = 'ferni:speech-beats';
const REDUCED = '(prefers-reduced-motion: reduce)';
const FRAME_MS = 16;

interface AnimateCall {
  element: Element;
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
}
let animateCalls: AnimateCall[] = [];
let frames: FrameRequestCallback[] = [];
let clock = 0;

function setReducedMotion(reduced: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === REDUCED && reduced }));
}

/** Run `ms` of animation frames at `level`. */
function play(level: number | null, ms: number): void {
  rms = level;
  for (let t = 0; t < ms; t += FRAME_MS) {
    clock += FRAME_MS;
    const pending = frames;
    frames = [];
    pending.forEach((cb) => cb(clock));
  }
}

function turn(speaker: string): void {
  window.dispatchEvent(new CustomEvent('ferni:avatar-turn', { detail: { speaker } }));
}

function coach(): HTMLElement {
  return document.getElementById('coach') as HTMLElement;
}

/** Transforms written to an element's additive layer, in order. */
function layerWrites(match: (el: Element) => boolean): string[] {
  return animateCalls
    .filter((c) => match(c.element))
    .map((c) => String(c.keyframes[0]?.transform ?? ''));
}
const headWrites = (): string[] => layerWrites((el) => el.classList.contains('avatar-container'));
const eyeWrites = (): string[] => layerWrites((el) => el.id === 'avatarEyes');
const px = (t: string): number => Number(/translateY\((-?[\d.]+)px\)/.exec(t)?.[1] ?? 0);
const deg = (t: string): number => Number(/rotate\((-?[\d.]+)deg\)/.exec(t)?.[1] ?? 0);

/** One entry per beat: the deepest frame of each excursion away from rest. */
function headBeats(): string[] {
  const peaks: string[] = [];
  let peak: string | null = null;
  for (const t of headWrites()) {
    if (px(t) === 0) {
      if (peak) peaks.push(peak);
      peak = null;
    } else if (!peak || px(t) > px(peak)) {
      peak = t;
    }
  }
  if (peak) peaks.push(peak);
  return peaks;
}

/** Ferni's voice: quiet, then a stressed syllable, then the rest of the word. */
function stressedSyllable(): void {
  play(0.1, 200);
  play(0.8, 200);
  play(0.4, 200);
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  animateCalls = [];
  frames = [];
  clock = 0;
  rms = 0;
  document.body.innerHTML = `
    <div id="coach" class="is-connected">
      <div class="avatar-container">
        <div id="coachAvatar"><svg id="avatarEyes" class="avatar-eyes"></svg></div>
      </div>
    </div>`;
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
    return { cancel: vi.fn(), effect: null } as unknown as Animation;
  };
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal('cancelAnimationFrame', () => {
    frames = [];
  });
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  setReducedMotion(false);
});

afterEach(async () => {
  const { disposeSpeechBeats } = await import('../../../src/ui/avatar-motion/speech-beats.js');
  disposeSpeechBeats();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function start(): Promise<boolean> {
  const { initSpeechBeats } = await import('../../../src/ui/avatar-motion/speech-beats.js');
  return initSpeechBeats();
}

describe('speech beats, flag off', () => {
  it('does nothing: no loop, no beats, the canned CSS loop keeps its selector', async () => {
    expect(await start()).toBe(false);
    turn('ferni');
    stressedSyllable();
    expect(frames).toHaveLength(0);
    expect(animateCalls).toHaveLength(0);
    expect(coach().hasAttribute('data-speech-beats')).toBe(false);
  });
});

describe('speech beats, flag on', () => {
  beforeEach(() => localStorage.setItem(FLAG, 'true'));

  it('draws an additive 1-2 px head dip with a 0.3 degree tilt on a stressed syllable', async () => {
    expect(await start()).toBe(true);
    turn('ferni');
    stressedSyllable();
    expect(headBeats()).toHaveLength(1);
    expect(animateCalls.every((c) => c.options.composite === 'add')).toBe(true);
    const dip = headBeats()[0]!;
    expect(px(dip)).toBeGreaterThanOrEqual(0.9);
    expect(px(dip)).toBeLessThanOrEqual(2);
    expect(Math.abs(deg(dip))).toBeGreaterThan(0.25);
    expect(Math.abs(deg(dip))).toBeLessThanOrEqual(0.3);
    expect(headWrites().at(-1)).toBe('translateY(0px) rotate(0deg)');
  });

  it('lifts the eyes on a strong beat and brings them back', async () => {
    await start();
    turn('ferni');
    stressedSyllable();
    const lift = Math.min(...eyeWrites().map(px));
    expect(lift).toBeLessThan(-0.5);
    expect(lift).toBeGreaterThanOrEqual(-1);
    expect(eyeWrites().at(-1)).toBe('translateY(0px)');
  });

  it('alternates the tilt side between beats', async () => {
    await start();
    turn('ferni');
    stressedSyllable();
    stressedSyllable();
    const tilts = headBeats().map(deg);
    expect(tilts).toHaveLength(2);
    expect(Math.sign(tilts[0]!)).toBe(-Math.sign(tilts[1]!));
  });

  it('does not move on steady speech (no canned rhythm)', async () => {
    await start();
    turn('ferni');
    play(0.5, 3000);
    expect(headBeats().length).toBeLessThanOrEqual(1); // at most the opening onset
    const before = headWrites().length;
    play(0.5, 3000);
    expect(headWrites().length).toBe(before);
  });

  it('only reads the envelope during Ferni turns', async () => {
    await start();
    stressedSyllable();
    expect(frames).toHaveLength(0);
    turn('user');
    stressedSyllable();
    expect(headBeats()).toHaveLength(0);
    turn('ferni');
    expect(frames).toHaveLength(1);
    turn('thinking');
    expect(frames).toHaveLength(0);
  });

  it('returns the head to rest when the turn ends mid-beat', async () => {
    await start();
    turn('ferni');
    play(0.1, 200);
    play(0.8, 64);
    expect(px(headWrites().at(-1)!)).toBeGreaterThan(0);
    turn('user');
    expect(headWrites().at(-1)).toBe('translateY(0px) rotate(0deg)');
  });

  it('marks #coach so the stylesheet retires the 3.5 s conversationalSpeaking loop', async () => {
    await start();
    expect(coach().hasAttribute('data-speech-beats')).toBe(true);
    const css = readFileSync(
      resolve(__dirname, '../../../src/styles/inline-styles.css'),
      'utf8'
    ).replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = /([^{}]+)\{\s*animation: conversationalSpeaking/.exec(css)?.[1] ?? '';
    expect(rule).toContain('#coach.is-speaking:not([data-speech-beats]) .avatar-container');
    expect(rule).toContain('#coach.is-speaking:not([data-speech-beats]) #coachAvatar');
  });

  it('dispatches ferni:avatar-phrase-end once when a phrase ends', async () => {
    const ends: Event[] = [];
    const listener = (e: Event): void => void ends.push(e);
    window.addEventListener('ferni:avatar-phrase-end', listener);
    await start();
    turn('ferni');
    play(0.5, 800);
    expect(ends).toHaveLength(0);
    play(0, 800);
    window.removeEventListener('ferni:avatar-phrase-end', listener);
    expect(ends).toHaveLength(1);
    expect((ends[0] as CustomEvent<{ at: number }>).detail.at).toBeGreaterThan(0);
  });

  it('makes no gestures under reduced motion but still marks phrase ends', async () => {
    setReducedMotion(true);
    const ends: Event[] = [];
    const listener = (e: Event): void => void ends.push(e);
    window.addEventListener('ferni:avatar-phrase-end', listener);
    await start();
    turn('ferni');
    stressedSyllable();
    play(0, 800);
    window.removeEventListener('ferni:avatar-phrase-end', listener);
    expect(animateCalls).toHaveLength(0);
    expect(ends).toHaveLength(1);
  });

  it('skips frames with no analyser', async () => {
    await start();
    turn('ferni');
    play(null, 500);
    expect(animateCalls).toHaveLength(0);
  });

  it('dispose removes the attribute, stops the loop and ignores later turns', async () => {
    await start();
    turn('ferni');
    const { disposeSpeechBeats } = await import('../../../src/ui/avatar-motion/speech-beats.js');
    disposeSpeechBeats();
    expect(coach().hasAttribute('data-speech-beats')).toBe(false);
    expect(frames).toHaveLength(0);
    turn('ferni');
    expect(frames).toHaveLength(0);
  });
});

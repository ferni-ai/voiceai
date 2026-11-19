/**
 * The crisis face hold stops presence's own body motion: the attentive lean while
 * the caller speaks, the body squash and halo swell with Ferni's voice, and the
 * idle moves between turns. Each is default-on in every call. A hold that starts
 * mid-motion eases that motion back to rest (no snap, no overshoot), and the loop
 * behind it stops. Reduced motion stops all three too.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

type Played = { frames: Keyframe[]; opts: KeyframeAnimationOptions; anim: FakeAnimation };
type FakeAnimation = { cancel: ReturnType<typeof vi.fn>; reverse: ReturnType<typeof vi.fn>; onfinish: null; progress: number };

let played: Played[] = [];
let reduceMotion = false;

const text = (p: Played): string => JSON.stringify(p.frames);
/** The attentive lean loop (its overshoot frame is unique to it). */
const leans = (): Played[] => played.filter((p) => text(p).includes('-5.5px'));
/** Animations played from index `from` on that end at rest (the lean's settle back). */
const settlesSince = (from: number): Played[] =>
  played.slice(from).filter((p) => p.frames.at(-1)?.transform === 'translateY(0) scale(1, 1) rotate(0deg)');
/** Idle moves: short there-and-back moves that start at rest with no scale. */
const IDLE_STARTS = ['rotate(0deg)', 'translateX(0)', 'translateY(0)', 'rotate(0deg) translateX(0)'];
const idleMoves = (): Played[] =>
  played.filter((p) => IDLE_STARTS.includes(String(p.frames[0]?.transform)) && p.opts?.iterations === undefined);

beforeEach(() => {
  vi.resetModules();
  played = [];
  reduceMotion = false;
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'],
  });
  window.matchMedia = ((query: string) => ({
    matches: query.includes('reduce') && reduceMotion,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  document.body.innerHTML =
    '<div id="coach"><div class="avatar-container"><div id="coachAvatar"><div id="avatarEyes" class="avatar-eyes"><div class="eye-main"></div></div><div id="avatarRing" class="avatar-ring"></div></div></div></div>';
  (Element.prototype as unknown as { animate: unknown }).animate = function (
    this: Element,
    frames: Keyframe[],
    opts: KeyframeAnimationOptions
  ) {
    const anim: FakeAnimation = { cancel: vi.fn(), reverse: vi.fn(), onfinish: null, progress: 0.2 };
    if (this.classList.contains('avatar-container')) played.push({ frames, opts, anim });
    return {
      ...anim,
      cancel: anim.cancel,
      reverse: anim.reverse,
      finished: Promise.resolve(),
      playbackRate: 1,
      updatePlaybackRate: vi.fn(),
      addEventListener: vi.fn(),
      effect: { getComputedTiming: () => ({ progress: anim.progress }), getTiming: () => ({}), setKeyframes: vi.fn(), updateTiming: vi.fn() },
    };
  };
  (Element.prototype as unknown as { getAnimations: unknown }).getAnimations = () => [];
});

afterEach(async () => {
  const presence = await import('../../src/ui/presence.ui.js');
  presence.dispose();
  (await import('../../src/ui/face/crisis-face-hold.js')).releaseCrisisFace();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

async function start(held: boolean) {
  const crisis = await import('../../src/ui/face/crisis-face-hold.js');
  crisis.releaseCrisisFace();
  if (held) crisis.holdCrisisFace();
  const presence = await import('../../src/ui/presence.ui.js');
  const speaking = await import('../../src/ui/speaking-system.ui.js');
  presence.initPresenceUI();
  const container = document.querySelector<HTMLElement>('.avatar-container')!;
  const ring = document.getElementById('avatarRing')!;
  return { crisis, presence, speaking, container, ring };
}

/** Ferni speaks loudly for `frames` frames, collecting the body transforms written. */
function speak(speaking: { updateVolume(v: number): void }, container: HTMLElement, frames: number): string[] {
  const seen: string[] = [];
  for (let i = 0; i < frames; i++) {
    speaking.updateVolume(0.9);
    vi.advanceTimersByTime(16);
    seen.push(container.style.transform);
  }
  return seen;
}

const scaleY = (transform: string): number => Number(/scaleY\(([\d.]+)\)/.exec(transform)?.[1] ?? 1);

describe('attentive lean while the caller speaks', () => {
  it('control: the lean loop plays', async () => {
    const { presence } = await start(false);
    presence.setListening(true);
    expect(leans()).toHaveLength(1);
  });

  it('held: no lean', async () => {
    const { presence } = await start(true);
    presence.setListening(true);
    expect(leans()).toHaveLength(0);
  });

  it('a hold that starts mid-lean stops the loop and eases straight back, no overshoot', async () => {
    const { presence, crisis } = await start(false);
    presence.setListening(true);
    const [lean] = leans();
    const before = played.length;
    crisis.holdCrisisFace();
    expect(lean.anim.cancel).toHaveBeenCalled();
    const settled = settlesSince(before);
    expect(settled).toHaveLength(1);
    const [settle] = settled;
    expect(settle.frames).toHaveLength(2); // from where it was, straight to rest
    const { EASING } = await import('../../src/config/animation-constants.js');
    expect(settle.opts.easing).toBe(EASING.GENTLE); // a calm ease, not the standard one
  });
});

describe('body squash and halo swell with the voice', () => {
  it('control: the body and halo move with the voice', async () => {
    const { speaking, container, ring } = await start(false);
    const seen = speak(speaking, container, 30);
    expect(Math.max(...seen.map(scaleY))).toBeGreaterThan(1.01);
    expect(ring.style.transform).toMatch(/scale\(1\.0/);
  });

  it('held: neither moves', async () => {
    const { speaking, container, ring } = await start(true);
    const seen = speak(speaking, container, 30);
    expect(seen.every((t) => t === '')).toBe(true);
    expect(ring.style.transform).toBe('');
  });

  it('a hold that starts mid-speech eases the body to rest, then the loop stops', async () => {
    const { speaking, container, crisis } = await start(false);
    speak(speaking, container, 30);
    const loud = scaleY(container.style.transform);
    crisis.holdCrisisFace();
    const after = speak(speaking, container, 120);
    expect(scaleY(after[0])).toBeGreaterThan(1.001); // no snap: the first frame is still near where it was
    expect(scaleY(after[0])).toBeLessThan(loud);
    const moving = after.filter((t) => t !== '').map(scaleY);
    expect(moving.every((v, i) => i === 0 || v <= moving[i - 1])).toBe(true); // only ever easing down
    expect(after.at(-1)).toBe('');
    container.style.transform = 'translateX(7px)'; // nothing may write the body once the loop stops
    speak(speaking, container, 10);
    expect(container.style.transform).toBe('translateX(7px)');
  });
});

describe('idle moves between turns', () => {
  it('control: idle moves play', async () => {
    await start(false);
    vi.advanceTimersByTime(40_000);
    expect(idleMoves().length).toBeGreaterThan(0);
  });

  it('held: no idle moves', async () => {
    await start(true);
    vi.advanceTimersByTime(40_000);
    expect(idleMoves()).toHaveLength(0);
  });

  it('a hold that starts as an idle move heads out turns it back to rest', async () => {
    const { crisis } = await start(false);
    vi.advanceTimersByTime(9_000);
    const [move] = idleMoves();
    expect(move).toBeDefined();
    crisis.holdCrisisFace();
    expect(move.anim.reverse).toHaveBeenCalled();
  });
});

describe('reduced motion', () => {
  it('no lean, no voice pulse, no idle moves', async () => {
    reduceMotion = true;
    const { presence, speaking, container } = await start(false);
    presence.setListening(true);
    presence.setListening(false);
    const seen = speak(speaking, container, 30);
    vi.advanceTimersByTime(40_000);
    expect(leans()).toHaveLength(0);
    expect(seen.every((t) => t === '')).toBe(true);
    expect(idleMoves()).toHaveLength(0);
  });
});

/**
 * When the gsap CDN script doesn't load, gsap-setup exports an inert stand-in (#3273): animation
 * calls don't throw, flows that wait on onComplete still finish, loops keep their pace, nothing
 * is awaitable forever, and it warns once. With the CDN global present, it's used unchanged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const warn = vi.fn();
vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn, error: vi.fn() }),
}));

type Gsap = typeof import('gsap').gsap;
const win = window as unknown as { gsap?: Gsap };

async function setupGsap(): Promise<Gsap> {
  return (await import('../../src/utils/gsap-setup.js')).gsap;
}

beforeEach(() => {
  vi.resetModules();
  warn.mockClear();
  delete win.gsap;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  vi.useRealTimers();
  delete win.gsap;
  document.body.innerHTML = '';
});

describe('gsap-setup with the CDN global present', () => {
  it('exports that exact instance and does not warn', async () => {
    const { gsap } = await import('gsap');
    win.gsap = gsap;
    expect(await setupGsap()).toBe(gsap);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('gsap-setup without the CDN global', () => {
  it('warns once, however many animation calls follow', async () => {
    const gsap = await setupGsap();
    const el = document.createElement('div');
    gsap.to(el, { x: 1 });
    gsap.timeline().to(el, { x: 2 }).set(el, { y: 1 });
    gsap.set(el, { opacity: 1 });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('nothing it returns is awaitable, so `await tween` cannot hang', async () => {
    const gsap = await setupGsap();
    const el = document.createElement('div');
    const tween = gsap.to(el, { x: 1 });
    const tl = gsap.timeline();
    expect('then' in tween).toBe(false);
    expect('then' in tl).toBe(false);
    expect('then' in tl.to(el, { x: 1 })).toBe(false);
  });

  it('a tween ends after its duration: end opacity written, then onComplete', async () => {
    const gsap = await setupGsap();
    const el = document.createElement('div');
    const onComplete = vi.fn();
    gsap.to(el, { opacity: 0, x: 5, duration: 1, delay: 0.5, onComplete });
    vi.advanceTimersByTime(1_499);
    expect(onComplete).not.toHaveBeenCalled();
    expect(el.style.opacity).toBe('');
    vi.advanceTimersByTime(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(el.style.opacity).toBe('0');
    expect(el.style.transform).toBe(''); // transforms stay at rest
  });

  it('a loop that restarts from onComplete keeps its pace instead of spinning', async () => {
    const gsap = await setupGsap();
    const el = document.createElement('div');
    let laps = 0;
    const lap = (): void => {
      laps++;
      gsap.to(el, { scale: 1.1, duration: 2, onComplete: lap });
    };
    lap();
    vi.advanceTimersByTime(10_000);
    expect(laps).toBe(6); // the first call plus one every 2 s
  });

  it('a timeline runs its steps in order, then its own onComplete', async () => {
    const gsap = await setupGsap();
    const el = document.createElement('div');
    const order: string[] = [];
    gsap
      .timeline({ onComplete: () => order.push(`done ${el.style.opacity}`) })
      .set(el, { opacity: 0 })
      .to(el, { opacity: 0.5, duration: 0.2 })
      .call(() => order.push(`call ${el.style.opacity}`))
      .to(el, { autoAlpha: 1, duration: 0.2 });
    vi.advanceTimersByTime(1_000);
    expect(order).toEqual(['call 0.5', 'done 1']);
    expect(el.style.visibility).toBe('inherit');
  });

  it('kill, killTweensOf and repeat: -1 cancel the pending end, as in GSAP', async () => {
    const gsap = await setupGsap();
    const el = document.createElement('div');
    const killed = vi.fn();
    const byTarget = vi.fn();
    const looping = vi.fn();
    const timelineDone = vi.fn();
    gsap.to(el, { duration: 0.1, onComplete: killed }).kill();
    gsap.to(el, { duration: 0.1, onComplete: byTarget });
    gsap.killTweensOf(el);
    gsap.to(el, { duration: 0.1, repeat: -1, onComplete: looping });
    gsap.timeline({ onComplete: timelineDone }).to(el, { duration: 0.1 }).kill();
    vi.advanceTimersByTime(5_000);
    expect([killed, byTarget, looping, timelineDone].map((f) => f.mock.calls.length)).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it('the game board still hides when a game ends (its hide waits on onComplete)', async () => {
    const board = await import('../../src/ui/game-board.ui.js');
    board.initGameBoard();
    document.dispatchEvent(
      new CustomEvent('ferni:game-started', {
        detail: { gameType: 'tic-tac-toe', gameName: 'Tic-Tac-Toe' },
      })
    );
    const container = document.querySelector('.game-board-container');
    expect(board.isGameBoardVisible()).toBe(true);
    document.dispatchEvent(new CustomEvent('ferni:game-ended', { detail: {} }));
    vi.advanceTimersByTime(1_000);
    expect(board.isGameBoardVisible()).toBe(false);
    expect(container?.classList.contains('visible')).toBe(false);
    board.destroyGameBoard();
  });

  it('an awaited text-to-icon morph and back resolves, and the avatar text shows again', async () => {
    document.body.innerHTML = '<div id="coachAvatar"><span id="avatarText">hi</span></div>';
    const { morphTextToIcon, morphIconToText } =
      await import('../../src/ui/ferni-expressions.ui.js');
    const text = document.getElementById('avatarText');
    let icon: HTMLElement | null | undefined;
    void morphTextToIcon('<svg></svg>').then((el) => (icon = el));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(icon).toBeInstanceOf(HTMLElement);
    expect(text?.style.visibility).toBe('hidden');
    let back = false;
    void morphIconToText(icon).then(() => (back = true));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(back).toBe(true);
    expect(text?.style.visibility).toBe('visible');
    expect(icon?.isConnected).toBe(false);
  });

  it('the avatar soul runs 30 s of saccades without throwing and keeps rescheduling', async () => {
    document.body.innerHTML = '<div class="avatar-container"><div id="coachAvatar"></div></div>';
    const soul = await import('../../src/ui/avatar-soul.ui.js');
    soul.initAvatarSoul();
    expect(() => vi.advanceTimersByTime(30_000)).not.toThrow();
    expect(vi.getTimerCount()).toBeGreaterThan(0); // the saccade loop is still scheduled
    soul.disposeAvatarSoul();
  });
});

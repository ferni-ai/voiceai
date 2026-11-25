/**
 * The avatar lab is the second caller of the shared avatar boot: it starts the
 * theme and waveform, runs the same boot the app runs (now steps at once,
 * deferred steps at their delay), follows turns with no room, and keeps a turn
 * driver for the command bridge.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AvatarBootOptions, AvatarBootRunner } from '../../src/ui/avatar-boot.js';

const m = vi.hoisted(() => {
  const order: string[] = [];
  const step =
    (name: string) =>
    (..._args: unknown[]): void => {
      order.push(name);
    };
  return {
    order,
    step,
    driver: { update: () => undefined, shown: () => 'none', dispose: () => undefined },
    logError: vi.fn(),
  };
});

vi.mock('../../src/i18n/index.js', () => ({
  initI18n: async () => {
    await Promise.resolve();
    m.order.push('initI18n');
  },
}));
vi.mock('../../src/app/app-theme.js', () => ({
  initializeTheme: vi.fn(m.step('initializeTheme')),
}));
vi.mock('../../src/utils/gsap-animations.js', () => ({ initGSAP: vi.fn(m.step('initGSAP')) }));
vi.mock('../../src/ui/waveform.ui.js', () => ({ initWaveformUI: vi.fn(m.step('initWaveformUI')) }));
vi.mock('../../src/ui/avatar-boot.js', () => ({
  bootAvatarNow: vi.fn(m.step('bootAvatarNow')),
  scheduleAvatar: vi.fn(m.step('scheduleAvatar')),
}));
// The real settle-time choice and targets; only the driver itself is a stand-in.
vi.mock('../../src/ui/avatar-motion/turn-driver.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/ui/avatar-motion/turn-driver.js')>()),
  createTurnDriver: vi.fn(() => {
    m.order.push('createTurnDriver');
    return m.driver;
  }),
}));
vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: m.logError,
  }),
}));

import { initializeTheme } from '../../src/app/app-theme.js';
import { startAvatarLab } from '../../src/avatar-lab/index.js';
import { bootAvatarNow, scheduleAvatar } from '../../src/ui/avatar-boot.js';
import {
  createTurnDriver,
  defaultTargets,
  TURN_SETTLE_MS,
  TURN_SETTLE_REDUCED_MS,
} from '../../src/ui/avatar-motion/turn-driver.js';

/** The viewer's prefers-reduced-motion setting, as window.matchMedia reports it. */
function reducedMotion(matches: boolean): void {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({ matches: matches && query.includes('reduce'), media: query }) as MediaQueryList
  );
}

function runnerFrom(fn: typeof bootAvatarNow): AvatarBootRunner {
  return vi.mocked(fn).mock.calls[0][0];
}

beforeEach(() => {
  m.order.length = 0;
  vi.clearAllMocks();
  document.documentElement.removeAttribute('data-avatar-lab');
  document.head.innerHTML = '';
  document.body.className = '';
  document.body.innerHTML = '<div id="app"><div class="avatar-container"></div></div>';
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks(); // the matchMedia spy
});

describe('startAvatarLab', () => {
  it('marks the page as the lab and adds the style that shows only the avatar', async () => {
    await startAvatarLab();
    expect(document.documentElement.getAttribute('data-avatar-lab')).toBe('on');
    const css = document.getElementById('avatar-lab-style')?.textContent ?? '';
    expect(css).toContain("html[data-avatar-lab='on']");
    expect(css).toContain('#coach');
    expect(css).toContain('#waveformContainer');
    expect(document.body.classList.contains('app-loaded')).toBe(true);
    expect(document.querySelector('.avatar-container')?.classList).toContain('entrance-complete');
  });

  it('starts i18n, then the theme, waveform and the shared boot, then the turn driver', async () => {
    await startAvatarLab();
    expect(m.order).toEqual([
      'initI18n',
      'initializeTheme',
      'initGSAP',
      'initWaveformUI',
      'bootAvatarNow',
      'scheduleAvatar',
      'createTurnDriver',
    ]);
    expect(vi.mocked(initializeTheme)).toHaveBeenCalledWith();
  });

  it('follows turns without a room and adds no tracked listener', async () => {
    await startAvatarLab();
    const opts = vi.mocked(scheduleAvatar).mock.calls[0][1] as AvatarBootOptions;
    expect(opts.startTurns()).toBe(true);
    expect(opts.listen).toBeUndefined();
    expect(opts.startCues).toBeUndefined();
  });

  it('gives both boot calls one runner: now runs at once, later after its delay', async () => {
    vi.useFakeTimers();
    await startAvatarLab();
    const run = runnerFrom(bootAvatarNow);
    expect(vi.mocked(scheduleAvatar).mock.calls[0][0]).toBe(run);

    const now = vi.fn();
    run.now('Now', now);
    expect(now).toHaveBeenCalledOnce();

    const later = vi.fn();
    run.later('Later', 600, later);
    vi.advanceTimersByTime(599);
    expect(later).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(later).toHaveBeenCalledOnce();
  });

  it('logs a failed step by name and keeps going', async () => {
    vi.useFakeTimers();
    await startAvatarLab();
    const run = runnerFrom(bootAvatarNow);
    const boom = new Error('boom');
    run.now('Broken', () => {
      throw boom;
    });
    run.later('BrokenLater', 10, async () => {
      throw boom;
    });
    await vi.advanceTimersByTimeAsync(10);
    expect(m.logError).toHaveBeenCalledWith('Failed to initialize Broken:', boom);
    expect(m.logError).toHaveBeenCalledWith('Failed to initialize BrokenLater:', boom);
  });

  it('creates the turn driver on the real avatar targets at the app settle time', async () => {
    reducedMotion(false);
    await startAvatarLab();
    expect(vi.mocked(createTurnDriver)).toHaveBeenCalledWith(defaultTargets, TURN_SETTLE_MS);
  });

  it('settles turns more slowly when the viewer prefers reduced motion, as the app does', async () => {
    expect(TURN_SETTLE_REDUCED_MS).not.toBe(TURN_SETTLE_MS);
    reducedMotion(true);
    await startAvatarLab();
    expect(vi.mocked(createTurnDriver)).toHaveBeenCalledWith(
      defaultTargets,
      TURN_SETTLE_REDUCED_MS
    );
  });
});

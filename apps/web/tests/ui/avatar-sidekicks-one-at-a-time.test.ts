/**
 * One sidekick at a time, none at connect.
 *
 * Every call used to stack two or three icons in one 40 px slot (brain +
 * trendingUp + hand, flex-shrunk to 13 px each): clearSlot ran at once, but
 * the new icon mounted a setTimeout 0 later, so same-tick shows never saw
 * each other. Sidekicks spec S1, 2026-10-29 (collisions.json).
 *
 * These drive the real module through its real listeners; only GSAP is
 * stubbed, so the yield is timed by the module's own timer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createChainableMock = () => {
  const mock: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['to', 'fromTo', 'set', 'kill', 'eventCallback', 'add', 'call']) {
    mock[method] = vi.fn().mockImplementation(() => mock);
  }
  return mock;
};

vi.mock('../../src/utils/gsap-setup.js', () => ({
  gsap: {
    timeline: vi.fn(() => createChainableMock()),
    set: vi.fn(),
    to: vi.fn(() => createChainableMock()),
    fromTo: vi.fn(() => createChainableMock()),
    killTweensOf: vi.fn(),
  },
}));

import { gsap } from '../../src/utils/gsap-setup.js';
import {
  SIDEKICK_QUIET_AFTER_CONNECT_MS,
  SIDEKICK_YIELD_MS,
  dispose,
  initAvatarSidekicks,
  showSidekick,
} from '../../src/ui/avatar-sidekicks.ui.js';

const icons = (): Element[] => Array.from(document.querySelectorAll('.sidekick-icon'));

/** Advance in small steps and record the most icons ever in the DOM at once. */
function maxIconsWhileAdvancing(totalMs: number, stepMs = 10): number {
  let max = icons().length;
  for (let t = 0; t < totalMs; t += stepMs) {
    vi.advanceTimersByTime(stepMs);
    max = Math.max(max, icons().length);
  }
  return max;
}

const playMusic = (): void => {
  document.dispatchEvent(
    new CustomEvent('ferni:music-state', { detail: { state: 'playing', isAmbient: true } })
  );
};

beforeEach(() => {
  vi.useFakeTimers();
  const coach = document.createElement('div');
  coach.id = 'coach';
  const avatar = document.createElement('div');
  avatar.className = 'avatar-container';
  coach.appendChild(avatar);
  document.body.appendChild(coach);
  initAvatarSidekicks();
});

afterEach(() => {
  dispose();
  document.body.innerHTML = '';
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('connect burst', () => {
  it('thinking + conversation-start + progress-tracked in one tick leave at most one icon', () => {
    let max = icons().length;
    document.dispatchEvent(new CustomEvent('ferni:thinking', { detail: { thinking: true } }));
    max = Math.max(max, icons().length);
    window.dispatchEvent(new CustomEvent('ferni:conversation-start'));
    max = Math.max(max, icons().length);
    document.dispatchEvent(
      new CustomEvent('ferni:progress-tracked', { detail: { conversationCount: 3 } })
    );
    max = Math.max(max, icons().length);
    max = Math.max(max, maxIconsWhileAdvancing(SIDEKICK_QUIET_AFTER_CONNECT_MS + 500));

    expect(max).toBeLessThanOrEqual(1);
  });

  it('a same-tick burst of live sidekicks never puts two on screen', () => {
    let max = 0;
    playMusic();
    max = Math.max(max, icons().length);
    document.dispatchEvent(new CustomEvent('ferni:memory-callback'));
    max = Math.max(max, icons().length);
    document.dispatchEvent(new CustomEvent('ferni:journal-entry'));
    max = Math.max(max, icons().length);
    document.dispatchEvent(new CustomEvent('ferni:breakthrough'));
    max = Math.max(max, icons().length);
    max = Math.max(max, maxIconsWhileAdvancing(1000));

    expect(max).toBe(1);
    expect(icons()).toHaveLength(1);
  });
});

describe('replacing a sidekick', () => {
  it('two shows in one slot: the first yields, then exactly one remains', () => {
    showSidekick({ icon: 'coffee', position: 'right', duration: 4000 });
    showSidekick({ icon: 'heart', position: 'right', duration: 4000 });

    // While the first fades, it is the only icon; the second waits.
    expect(icons()).toHaveLength(1);
    const first = icons()[0];
    expect(gsap.to).toHaveBeenCalledWith(
      first,
      expect.objectContaining({ opacity: 0, scale: 0.96, duration: SIDEKICK_YIELD_MS / 1000 })
    );

    vi.advanceTimersByTime(SIDEKICK_YIELD_MS - 1);
    expect(icons()).toEqual([first]);

    vi.advanceTimersByTime(1);
    expect(icons()).toHaveLength(1);
    expect(first.isConnected).toBe(false);
    expect(icons()[0]).not.toBe(first);
  });
});

describe('quiet arrival', () => {
  it('no sidekick shows within 3 s of conversation-start', () => {
    window.dispatchEvent(new CustomEvent('ferni:conversation-start'));

    // Fake timers move Date.now() too.
    let elapsed = 0;
    for (const at of [0, 1000, SIDEKICK_QUIET_AFTER_CONNECT_MS - 1]) {
      vi.advanceTimersByTime(at - elapsed);
      elapsed = at;
      playMusic();
      expect(icons(), `at +${at} ms`).toHaveLength(0);
    }

    vi.advanceTimersByTime(1);
    playMusic();
    expect(icons()).toHaveLength(1);
  });

  it('a sidekick already showing yields when a call starts', () => {
    playMusic();
    const before = icons()[0];
    expect(before).toBeDefined();

    window.dispatchEvent(new CustomEvent('ferni:conversation-start'));
    vi.advanceTimersByTime(SIDEKICK_YIELD_MS);

    expect(before.isConnected).toBe(false);
    expect(icons()).toHaveLength(0);
  });
});

describe('outreach', () => {
  it.each(['thinking_of_you', 'life_event', 'celebration'])(
    'a %s outreach shows no bell: the toast already carries it',
    (type) => {
      document.dispatchEvent(
        new CustomEvent('ferni:proactive-outreach', { detail: { id: 'o1', type, message: 'hi' } })
      );
      vi.advanceTimersByTime(1000);
      expect(icons()).toHaveLength(0);
    }
  );
});

describe('the live set still works', () => {
  it('music playing shows exactly one icon', () => {
    expect(icons()).toHaveLength(0);
    playMusic();
    expect(icons()).toHaveLength(1);
  });
});

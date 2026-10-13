/**
 * Thinking glance (behind ferni:thinking-glance, off by default): Ferni
 * glances away on the turn driver's thinking turn, mid-call, and never while
 * connecting.
 *
 * avatar-soul used to read `detail.isThinking` from `ferni:thinking`, but the
 * only sender (dispatchThinking) sends `{ thinking }`, and only for the
 * connection's connecting/connected states, so glanceAway never ran. Reading
 * that event correctly would make Ferni glance away during the arrival, where
 * he rests. These tests pin the decided shape: the `thinking` turn triggers
 * the glance, the connecting signal doesn't, and the flag off gives nothing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface TweenCall {
  target: unknown;
  vars: Record<string, unknown>;
}
const calls: TweenCall[] = [];

function timeline(): Record<string, unknown> {
  const tl: Record<string, unknown> = {};
  for (const method of ['to', 'set', 'fromTo'] as const) {
    tl[method] = (target: unknown, vars: Record<string, unknown>, more?: unknown) => {
      calls.push({ target, vars: method === 'fromTo' ? (more as Record<string, unknown>) : vars });
      return tl;
    };
  }
  tl.kill = vi.fn();
  return tl;
}

vi.mock('../../src/utils/gsap-setup.js', () => {
  const root = timeline();
  return { gsap: { ...root, timeline, killTweensOf: vi.fn() } };
});
vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../src/services/soul-stats.service.js', () => ({
  soulStatsService: new Proxy({}, { get: () => vi.fn() }),
}));
vi.mock('../../src/ui/ferni-expressions.ui.js', () => ({
  ferniExpressions: new Proxy({}, { get: () => vi.fn() }),
}));

const FLAG = 'ferni:thinking-glance';
const turn = (speaker: string): boolean =>
  window.dispatchEvent(new CustomEvent('ferni:avatar-turn', { detail: { speaker } }));

/** GSAP moves of the avatar itself with a glance shape (x, y and a tilt). */
function glances(): TweenCall[] {
  const avatar = document.getElementById('coachAvatar');
  return calls.filter((c) => c.target === avatar && 'y' in c.vars && 'rotation' in c.vars);
}

beforeEach(() => {
  vi.resetModules();
  calls.length = 0;
  localStorage.clear();
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  document.body.innerHTML = '<div class="avatar-container"><div id="coachAvatar"></div></div>';
});

afterEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});

describe('onThinkingTurns', () => {
  it('with the flag off: never starts', async () => {
    const { onThinkingTurns } = await import('../../src/ui/avatar-motion/thinking-glance.js');
    const start = vi.fn();
    const stop = onThinkingTurns(start, vi.fn());
    turn('thinking');
    expect(start).not.toHaveBeenCalled();
    stop();
  });

  it('with the flag on: starts on a thinking turn, once, and ends on the next turn', async () => {
    localStorage.setItem(FLAG, 'true');
    const { onThinkingTurns } = await import('../../src/ui/avatar-motion/thinking-glance.js');
    const start = vi.fn();
    const end = vi.fn();
    const stop = onThinkingTurns(start, end);
    turn('user');
    expect(start).not.toHaveBeenCalled();
    turn('thinking');
    turn('thinking');
    expect(start).toHaveBeenCalledTimes(1);
    expect(end).not.toHaveBeenCalled();
    turn('ferni');
    expect(end).toHaveBeenCalledTimes(1);
    stop();
    turn('thinking');
    expect(start).toHaveBeenCalledTimes(1);
  });
});

describe('avatar soul glance', () => {
  async function initSoul() {
    const soul = await import('../../src/ui/avatar-soul.ui.js');
    soul.initAvatarSoul();
    calls.length = 0;
    return soul;
  }

  it('with the flag on: the thinking turn makes Ferni glance away', async () => {
    localStorage.setItem(FLAG, 'true');
    const soul = await initSoul();
    turn('thinking');
    expect(glances().length).toBeGreaterThan(0);
    soul.disposeAvatarSoul();
  });

  it('with the flag on: connecting (dispatchThinking) does not', async () => {
    localStorage.setItem(FLAG, 'true');
    const soul = await initSoul();
    const { dispatchThinking } = await import('../../src/services/speech-event-dispatcher.js');
    dispatchThinking(true); // what app.ts sends on the connecting state
    document.dispatchEvent(new CustomEvent('ferni:thinking', { detail: { isThinking: true } }));
    turn('none');
    turn('ferni');
    expect(glances()).toHaveLength(0);
    soul.disposeAvatarSoul();
  });

  it('with the flag off: the thinking turn does nothing', async () => {
    const soul = await initSoul();
    turn('thinking');
    expect(glances()).toHaveLength(0);
    soul.disposeAvatarSoul();
  });
});

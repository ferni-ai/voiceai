/**
 * Listen nods through the real handleDataMessage: with `ferni:listen-nods` on,
 * the avatar nods with its own backchannel (on the wire delay), smiles with its
 * laugh, and nods on the agent's active_listening_nod; with it off, nothing.
 * Message shapes are the agent's (src/agents/integrations/backchannel-signal.ts,
 * src/agents/realtime/speech-state-dispatcher.ts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MOTION_FLAG_KEYS } from '../../src/config/motion-flags.js';

// The imports below schedule timers at import (luxo-expressions auto-init, 100 ms).
// Real ones can fire after jsdom is torn down ("document is not defined"), so fake
// them from before the first import, as the other UI tests do.
vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});

const performMicroNod = vi.hoisted(() => vi.fn());
vi.mock('../../src/eq/capabilities/active-listening.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/eq/capabilities/active-listening.js')>()),
  performMicroNod,
}));

import { handleDataMessage } from '../../src/app/data-message-handlers.js';
import { resetListenSignalForTests } from '../../src/app/backchannel-signal.js';
import {
  disposeSpringBody,
  initSpringBody,
  springBody,
} from '../../src/ui/avatar-motion/spring-body.js';
import { ferniExpressions } from '../../src/ui/ferni-expressions.ui.js';
import type { DataMessage } from '../../src/types/events.js';

const send = (message: Record<string, unknown>): void =>
  handleDataMessage(message as unknown as DataMessage);

function setReducedMotion(reduce: boolean): void {
  window.matchMedia = vi.fn((query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

const backchannel = { type: 'backchannel_played', kind: 'backchannel', wireDelayMs: 220 };
const laugh = { type: 'backchannel_played', kind: 'laugh', wireDelayMs: 60 };
const listeningNod = {
  type: 'humanization_signal',
  signalType: 'active_listening_nod',
  nodType: 'subtle',
  pauseType: 'breath',
  durationMs: 600,
  timestamp: 1,
};

let smile: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  performMicroNod.mockClear();
  resetListenSignalForTests();
  setReducedMotion(false);
  smile = vi.spyOn(ferniExpressions, 'setExpression').mockImplementation(() => undefined);
});

afterEach(() => {
  localStorage.removeItem(MOTION_FLAG_KEYS.listenNods);
  smile.mockRestore();
  vi.useRealTimers();
});

describe('listen nods, flag off (default)', () => {
  it('does not nod or smile for any listen signal', () => {
    send(backchannel);
    send(laugh);
    send(listeningNod);
    vi.advanceTimersByTime(5000);
    expect(performMicroNod).not.toHaveBeenCalled();
    expect(smile).not.toHaveBeenCalledWith('pleased', expect.anything(), expect.anything());
  });
});

describe('listen nods, flag on', () => {
  beforeEach(() => localStorage.setItem(MOTION_FLAG_KEYS.listenNods, 'true'));

  it('nods when the backchannel reaches the wire', () => {
    send(backchannel);
    vi.advanceTimersByTime(219);
    expect(performMicroNod).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(performMicroNod).toHaveBeenCalledWith('subtle');
  });

  it('smiles for a laugh instead of nodding', () => {
    send(laugh);
    vi.advanceTimersByTime(60);
    expect(smile).toHaveBeenCalledWith('pleased', expect.any(Number), expect.any(Number));
    expect(performMicroNod).not.toHaveBeenCalled();
  });

  it('nods on the agent active_listening_nod (no other client code does)', () => {
    send(listeningNod);
    expect(performMicroNod).toHaveBeenCalledWith('subtle');
  });

  it('nods at most once per 1.2 s across both signals', () => {
    send(listeningNod);
    send(backchannel);
    vi.advanceTimersByTime(1000);
    send(listeningNod);
    expect(performMicroNod).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(200);
    send(listeningNod);
    expect(performMicroNod).toHaveBeenCalledTimes(2);
  });

  it('skips all motion under prefers-reduced-motion', () => {
    setReducedMotion(true);
    send(backchannel);
    send(laugh);
    send(listeningNod);
    vi.advanceTimersByTime(5000);
    expect(performMicroNod).not.toHaveBeenCalled();
    expect(smile).not.toHaveBeenCalledWith('pleased', expect.anything(), expect.anything());
  });
});

describe('listen nods kick the spring body', () => {
  let animate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.setItem(MOTION_FLAG_KEYS.listenNods, 'true');
    document.body.innerHTML = '<div id="coach"><div class="avatar-container"></div></div>';
    animate = vi.fn(() => ({ effect: { setKeyframes: vi.fn() }, cancel: vi.fn() }));
    const body = document.querySelector('.avatar-container');
    if (body) Object.defineProperty(body, 'animate', { value: animate, configurable: true });
  });
  afterEach(() => {
    disposeSpringBody();
    localStorage.removeItem(MOTION_FLAG_KEYS.springBody);
    vi.restoreAllMocks();
  });

  it('nod kicks down and a laugh bounces up', () => {
    const kick = vi.spyOn(springBody, 'kick');
    send(listeningNod);
    vi.advanceTimersByTime(1200);
    send(laugh);
    vi.advanceTimersByTime(60);
    expect(kick.mock.calls).toEqual([['nod'], ['laugh']]);
  });

  it('spring body flag off: the kicks move nothing', () => {
    expect(initSpringBody()).toBe(false);
    send(listeningNod);
    vi.advanceTimersByTime(500);
    expect(performMicroNod).toHaveBeenCalledTimes(1);
    expect(animate).not.toHaveBeenCalled();
  });

  it('spring body flag on: a nod moves the body', () => {
    localStorage.setItem(MOTION_FLAG_KEYS.springBody, 'true');
    expect(initSpringBody()).toBe(true);
    send(listeningNod);
    vi.advanceTimersByTime(100);
    expect(animate).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ composite: 'add' })
    );
  });
});

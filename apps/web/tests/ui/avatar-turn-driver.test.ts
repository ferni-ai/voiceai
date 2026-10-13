/**
 * Avatar turn driver (on by default, kill switch ferni:avatar-turns=off): the
 * avatar and waveform follow LiveKit's real turn state instead of the
 * audio-track and mic callbacks, hold each change for a settle time so brief
 * flips don't flicker, and the old track-driven behaviour comes back under
 * the kill switch.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../src/services/connection.service.js', () => ({
  connectionService: { getRoom: () => null },
}));
vi.mock('../../src/ui/waveform.ui.js', () => ({
  waveformUI: { setSpeaking: vi.fn(), setListening: vi.fn() },
}));

import {
  AVATAR_TURN_EVENT,
  AVATAR_TURNS_FLAG_KEY,
  TURN_SETTLE_MS,
  TURN_SETTLE_REDUCED_MS,
  createTurnDriver,
  disposeAvatarTurns,
  initAvatarTurns,
  trackTurnFallback,
  type AvatarTargets,
} from '../../src/ui/avatar-motion/turn-driver.js';
import type { AgentState, CueRoom, SpeakerSignals } from '../../src/ui/speaker-cues-signals.js';

type Handler = (...args: unknown[]) => void;

class FakeRoom implements CueRoom {
  handlers = new Map<string, Set<Handler>>();
  agent = { identity: 'agent-1', attributes: {} as Record<string, string> };
  remoteParticipants = new Map<string, unknown>([['agent-1', this.agent]]);
  localParticipant = { identity: 'me', publishData: vi.fn(async () => undefined) };
  on(event: string, cb: Handler): this {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)?.add(cb);
    return this;
  }
  off(event: string, cb: Handler): this {
    this.handlers.get(event)?.delete(cb);
    return this;
  }
  setAgent(state: AgentState): void {
    this.agent.attributes = { 'lk.agent.state': state };
    this.handlers.get('participantAttributesChanged')?.forEach((cb) => cb());
  }
  setUserSpeaking(speaking: boolean): void {
    const speakers = speaking ? [{ identity: 'me', audioLevel: 0.5 }] : [];
    this.handlers.get('activeSpeakersChanged')?.forEach((cb) => cb(speakers));
  }
  listenerCount(): number {
    let n = 0;
    this.handlers.forEach((set) => (n += set.size));
    return n;
  }
}

function fakeTargets(): AvatarTargets & { [K in keyof AvatarTargets]: ReturnType<typeof vi.fn> } {
  return {
    setAudioState: vi.fn(),
    setSpeaking: vi.fn(),
    setListening: vi.fn(),
    setEyes: vi.fn(),
    showThinking: vi.fn(),
    hideThinking: vi.fn(),
    setWaveSpeaking: vi.fn(),
    setWaveListening: vi.fn(),
  };
}

const signals = (agentState: AgentState, userSpeaking = false): SpeakerSignals => ({
  agentState,
  userSpeaking,
  userLevel: userSpeaking ? 0.5 : 0,
  canInterrupt: false,
});

const lastCall = (fn: ReturnType<typeof vi.fn>): unknown => fn.mock.calls.at(-1)?.[0];

describe('turn driver: state mapping', () => {
  let targets: ReturnType<typeof fakeTargets>;

  beforeEach(() => {
    vi.useFakeTimers();
    targets = fakeTargets();
  });
  afterEach(() => vi.useRealTimers());

  it('shows Ferni speaking when the agent state is speaking', () => {
    createTurnDriver(targets, TURN_SETTLE_MS).update(signals('speaking'));
    expect(lastCall(targets.setAudioState)).toBe('speaking');
    expect(lastCall(targets.setSpeaking)).toBe(true);
    expect(lastCall(targets.setListening)).toBe(false);
    expect(lastCall(targets.setEyes)).toBe('speaking');
    expect(targets.hideThinking).toHaveBeenCalled();
    expect(targets.showThinking).not.toHaveBeenCalled();
  });

  it('leans in and listens while the user speaks', () => {
    createTurnDriver(targets, TURN_SETTLE_MS).update(signals('listening', true));
    expect(lastCall(targets.setAudioState)).toBe('listening');
    expect(lastCall(targets.setSpeaking)).toBe(false);
    expect(lastCall(targets.setListening)).toBe(true);
    expect(lastCall(targets.setEyes)).toBe('listening');
  });

  it('shows the thinking pose while the agent thinks', () => {
    createTurnDriver(targets, TURN_SETTLE_MS).update(signals('thinking'));
    expect(targets.showThinking).toHaveBeenCalledTimes(1);
    expect(targets.hideThinking).not.toHaveBeenCalled();
    expect(lastCall(targets.setEyes)).toBe('thinking');
    expect(lastCall(targets.setSpeaking)).toBe(false);
    expect(lastCall(targets.setListening)).toBe(false);
  });

  it('rests with idle eyes when nobody is talking, so the idle blink can run', () => {
    createTurnDriver(targets, TURN_SETTLE_MS).update(signals('listening'));
    expect(lastCall(targets.setEyes)).toBe('idle');
    expect(lastCall(targets.setAudioState)).toBe('idle');
    expect(lastCall(targets.setSpeaking)).toBe(false);
    expect(lastCall(targets.setListening)).toBe(false);
  });

  it('lets Ferni speaking win over the user talking at the same time', () => {
    createTurnDriver(targets, TURN_SETTLE_MS).update(signals('speaking', true));
    expect(lastCall(targets.setEyes)).toBe('speaking');
  });

  it('hides the thinking pose when Ferni starts speaking', () => {
    const driver = createTurnDriver(targets, TURN_SETTLE_MS);
    driver.update(signals('thinking'));
    targets.hideThinking.mockClear();
    driver.update(signals('speaking'));
    vi.advanceTimersByTime(TURN_SETTLE_MS);
    expect(targets.hideThinking).toHaveBeenCalledTimes(1);
    expect(driver.shown()).toBe('ferni');
  });
});

describe('turn driver: hysteresis', () => {
  let targets: ReturnType<typeof fakeTargets>;

  beforeEach(() => {
    vi.useFakeTimers();
    targets = fakeTargets();
  });
  afterEach(() => vi.useRealTimers());

  it('waits for a change to settle before following it', () => {
    const driver = createTurnDriver(targets, TURN_SETTLE_MS);
    driver.update(signals('listening', true));
    driver.update(signals('thinking'));
    vi.advanceTimersByTime(TURN_SETTLE_MS - 1);
    expect(targets.showThinking).not.toHaveBeenCalled();
    expect(driver.shown()).toBe('user');
    vi.advanceTimersByTime(1);
    expect(targets.showThinking).toHaveBeenCalledTimes(1);
    expect(driver.shown()).toBe('thinking');
  });

  it('ignores a brief flip that comes back before it settles', () => {
    const driver = createTurnDriver(targets, TURN_SETTLE_MS);
    driver.update(signals('speaking'));
    targets.setEyes.mockClear();
    driver.update(signals('listening'));
    vi.advanceTimersByTime(TURN_SETTLE_MS / 2);
    driver.update(signals('speaking'));
    vi.advanceTimersByTime(TURN_SETTLE_MS * 4);
    expect(targets.setEyes).not.toHaveBeenCalled();
    expect(driver.shown()).toBe('ferni');
  });

  it('follows only the latest of several quick changes', () => {
    const driver = createTurnDriver(targets, TURN_SETTLE_MS);
    driver.update(signals('listening'));
    targets.setEyes.mockClear();
    driver.update(signals('thinking'));
    vi.advanceTimersByTime(TURN_SETTLE_MS / 2);
    driver.update(signals('speaking'));
    vi.advanceTimersByTime(TURN_SETTLE_MS);
    expect(targets.setEyes.mock.calls).toEqual([['speaking']]);
    expect(targets.showThinking).not.toHaveBeenCalled();
  });

  it('turns off speaking, listening and thinking on dispose and drops a pending change', () => {
    const driver = createTurnDriver(targets, TURN_SETTLE_MS);
    driver.update(signals('speaking'));
    driver.update(signals('thinking'));
    driver.dispose();
    vi.advanceTimersByTime(TURN_SETTLE_MS * 4);
    expect(targets.showThinking).not.toHaveBeenCalled();
    expect(lastCall(targets.setSpeaking)).toBe(false);
    expect(lastCall(targets.setListening)).toBe(false);
  });
});

describe('turn driver: flag and wiring', () => {
  let room: FakeRoom;
  let targets: ReturnType<typeof fakeTargets>;
  const reducedMotion = (matches: boolean): void => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) => ({ matches, media: query }) as MediaQueryList
    );
  };

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    room = new FakeRoom();
    targets = fakeTargets();
    reducedMotion(false);
  });
  afterEach(() => {
    disposeAvatarTurns();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('does nothing when the kill switch is set', () => {
    localStorage.setItem(AVATAR_TURNS_FLAG_KEY, 'off');
    expect(initAvatarTurns(() => room, targets)).toBe(false);
    room.setAgent('thinking');
    document.dispatchEvent(new CustomEvent('ferni:connected'));
    vi.advanceTimersByTime(TURN_SETTLE_MS * 4);
    expect(room.listenerCount()).toBe(0);
    Object.values(targets).forEach((fn) => expect(fn).not.toHaveBeenCalled());
  });

  it('keeps the track and mic callbacks driving avatar and waveform under the kill switch', () => {
    localStorage.setItem(AVATAR_TURNS_FLAG_KEY, 'off');
    initAvatarTurns(() => room, targets);
    trackTurnFallback('agent-audio', targets);
    expect(lastCall(targets.setAudioState)).toBe('speaking');
    expect(lastCall(targets.setSpeaking)).toBe(true);
    expect(lastCall(targets.setEyes)).toBe('speaking');
    expect(lastCall(targets.setWaveSpeaking)).toBe(true);
    expect(lastCall(targets.setWaveListening)).toBe(false);
    trackTurnFallback('agent-audio-end', targets);
    expect(lastCall(targets.setAudioState)).toBe('listening');
    expect(lastCall(targets.setSpeaking)).toBe(false);
    expect(lastCall(targets.setEyes)).toBe('listening');
    expect(lastCall(targets.setWaveSpeaking)).toBe(false);
    expect(lastCall(targets.setWaveListening)).toBe(true);
    trackTurnFallback('mic-on', targets);
    expect(lastCall(targets.setListening)).toBe(true);
    expect(lastCall(targets.setWaveListening)).toBe(true);
  });

  it("treats the old 'false' value as the kill switch too", () => {
    localStorage.setItem(AVATAR_TURNS_FLAG_KEY, 'false');
    expect(initAvatarTurns(() => room, targets)).toBe(false);
  });

  it('is on by default: with no stored value, speaking follows the agent state, not the track', () => {
    room.setAgent('listening');
    expect(initAvatarTurns(() => room, targets)).toBe(true);
    // The voice track arrives while Ferni is still listening: nothing speaks.
    trackTurnFallback('agent-audio', targets);
    expect(targets.setSpeaking).not.toHaveBeenCalledWith(true);
    expect(targets.setWaveSpeaking).not.toHaveBeenCalledWith(true);
    expect(lastCall(targets.setSpeaking)).toBe(false);
    expect(lastCall(targets.setWaveSpeaking)).toBe(false);

    room.setAgent('speaking');
    vi.advanceTimersByTime(TURN_SETTLE_MS);
    expect(lastCall(targets.setSpeaking)).toBe(true);
    expect(lastCall(targets.setWaveSpeaking)).toBe(true);

    // He goes quiet with the track still subscribed: speaking stops.
    room.setAgent('listening');
    vi.advanceTimersByTime(TURN_SETTLE_MS);
    expect(lastCall(targets.setSpeaking)).toBe(false);
    expect(lastCall(targets.setWaveSpeaking)).toBe(false);
  });

  it('follows the room turn state and silences the track callbacks when the flag is on', () => {
    localStorage.setItem(AVATAR_TURNS_FLAG_KEY, 'true');
    room.setAgent('listening');
    expect(initAvatarTurns(() => room, targets)).toBe(true);
    expect(lastCall(targets.setEyes)).toBe('idle');

    room.setUserSpeaking(true);
    vi.advanceTimersByTime(TURN_SETTLE_MS);
    expect(lastCall(targets.setListening)).toBe(true);

    room.setUserSpeaking(false);
    room.setAgent('thinking');
    vi.advanceTimersByTime(TURN_SETTLE_MS);
    expect(targets.showThinking).toHaveBeenCalledTimes(1);

    const calls = targets.setSpeaking.mock.calls.length;
    trackTurnFallback('agent-audio', targets);
    trackTurnFallback('mic-on', targets);
    expect(targets.setSpeaking.mock.calls.length).toBe(calls);
    expect(lastCall(targets.setEyes)).toBe('thinking');
  });

  it('stops watching the room on disconnect', () => {
    localStorage.setItem(AVATAR_TURNS_FLAG_KEY, 'true');
    initAvatarTurns(() => room, targets);
    expect(room.listenerCount()).toBeGreaterThan(0);
    document.dispatchEvent(new CustomEvent('ferni:disconnected'));
    expect(room.listenerCount()).toBe(0);
  });

  it('settles more slowly when the viewer prefers reduced motion', () => {
    reducedMotion(true);
    localStorage.setItem(AVATAR_TURNS_FLAG_KEY, 'true');
    room.setAgent('listening');
    initAvatarTurns(() => room, targets);
    room.setAgent('thinking');
    vi.advanceTimersByTime(TURN_SETTLE_MS);
    expect(targets.showThinking).not.toHaveBeenCalled();
    vi.advanceTimersByTime(TURN_SETTLE_REDUCED_MS - TURN_SETTLE_MS);
    expect(targets.showThinking).toHaveBeenCalledTimes(1);
  });
});

describe('turn driver: ferni:avatar-turn event', () => {
  let room: FakeRoom;
  let targets: ReturnType<typeof fakeTargets>;
  let heard: unknown[];
  const listener = (e: Event): void => {
    heard.push((e as CustomEvent<{ speaker: unknown }>).detail.speaker);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    room = new FakeRoom();
    targets = fakeTargets();
    heard = [];
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) => ({ matches: false, media: query }) as MediaQueryList
    );
    window.addEventListener(AVATAR_TURN_EVENT, listener);
  });
  afterEach(() => {
    window.removeEventListener(AVATAR_TURN_EVENT, listener);
    disposeAvatarTurns();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('fires once per settled change with the Speaker name', () => {
    const driver = createTurnDriver(targets, TURN_SETTLE_MS);
    driver.update(signals('listening', true));
    expect(heard).toEqual(['user']);
    driver.update(signals('thinking'));
    driver.update(signals('thinking'));
    vi.advanceTimersByTime(TURN_SETTLE_MS - 1);
    expect(heard).toEqual(['user']);
    vi.advanceTimersByTime(1);
    expect(heard).toEqual(['user', 'thinking']);
    driver.update(signals('speaking'));
    vi.advanceTimersByTime(TURN_SETTLE_MS * 4);
    expect(heard).toEqual(['user', 'thinking', 'ferni']);
  });

  it('does not fire for a brief flip that comes back', () => {
    const driver = createTurnDriver(targets, TURN_SETTLE_MS);
    driver.update(signals('speaking'));
    driver.update(signals('listening'));
    vi.advanceTimersByTime(TURN_SETTLE_MS / 2);
    driver.update(signals('speaking'));
    vi.advanceTimersByTime(TURN_SETTLE_MS * 4);
    expect(heard).toEqual(['ferni']);
  });

  it('settles to none when the call ends, and only once', () => {
    const driver = createTurnDriver(targets, TURN_SETTLE_MS);
    driver.update(signals('speaking'));
    driver.dispose();
    driver.dispose();
    expect(heard).toEqual(['ferni', 'none']);
  });

  it('kill switch: no turn events at all', () => {
    localStorage.setItem(AVATAR_TURNS_FLAG_KEY, 'off');
    expect(initAvatarTurns(() => room, targets)).toBe(false);
    room.setAgent('speaking');
    document.dispatchEvent(new CustomEvent('ferni:connected'));
    vi.advanceTimersByTime(TURN_SETTLE_MS * 4);
    expect(heard).toEqual([]);
  });

  it('flag on: room turns arrive as events', () => {
    localStorage.setItem(AVATAR_TURNS_FLAG_KEY, 'true');
    room.setAgent('listening');
    initAvatarTurns(() => room, targets);
    room.setAgent('speaking');
    vi.advanceTimersByTime(TURN_SETTLE_MS);
    expect(heard).toEqual(['none', 'ferni']);
  });
});

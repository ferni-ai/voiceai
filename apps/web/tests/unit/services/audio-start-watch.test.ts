/**
 * Ferni joined but none of his audio plays: one notice at the deadline, never a
 * notice once his audio is really playing, blocked (Tap to hear owns that), or the
 * call is over.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIO_PLAY_BLOCKED_EVENT } from '../../../src/services/audio-play-blocked.js';
import {
  AUDIO_START_DEADLINE_MS,
  watchAudioStart,
  type AudioStartRoom,
} from '../../../src/services/audio-start-watch.js';

function fakeRoom(): AudioStartRoom & {
  canPlaybackAudio?: boolean;
  emitPlayback: (canPlay: boolean) => void;
} {
  const handlers = new Set<() => void>();
  const room = {
    state: 'connected',
    canPlaybackAudio: undefined as boolean | undefined,
    on: vi.fn((_event: 'audioPlaybackChanged', cb: () => void) => handlers.add(cb)),
    off: vi.fn((_event: 'audioPlaybackChanged', cb: () => void) => handlers.delete(cb)),
    emitPlayback: (canPlay: boolean) => {
      room.canPlaybackAudio = canPlay;
      for (const cb of handlers) cb();
    },
  };
  return room;
}

/** An element attached to a subscribed agent track, in the document like the real one. */
function attachedAudio(): HTMLAudioElement {
  const el = document.createElement('audio');
  document.body.appendChild(el);
  return el;
}

/** What the browser does once media flows: not paused, enough data, a 'playing' event. */
function startPlaying(el: HTMLMediaElement): void {
  Object.defineProperty(el, 'paused', { configurable: true, get: () => false });
  Object.defineProperty(el, 'readyState', { configurable: true, get: () => 4 });
  el.dispatchEvent(new Event('playing'));
}

let agentAudio: HTMLAudioElement[];
let onAudioNotStarted: ReturnType<typeof vi.fn>;
let hangingUp: boolean;

function watch(room = fakeRoom()): () => void {
  return watchAudioStart(room, {
    agentAudio: () => agentAudio,
    userHangingUp: () => hangingUp,
    onAudioNotStarted,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  agentAudio = [];
  onAudioNotStarted = vi.fn();
  hangingUp = false;
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('watchAudioStart', () => {
  it('uses the iOS deadline: 3 seconds after Ferni joins', () => {
    expect(AUDIO_START_DEADLINE_MS).toBe(3_000);
  });

  it('no agent audio by the deadline: the notice, once', () => {
    watch();

    vi.advanceTimersByTime(AUDIO_START_DEADLINE_MS - 1);
    expect(onAudioNotStarted).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onAudioNotStarted).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(60_000);
    expect(onAudioNotStarted).toHaveBeenCalledOnce();
  });

  it('a subscribed track that is playing before the deadline: no notice', () => {
    watch();
    vi.advanceTimersByTime(1_000);
    const voice = attachedAudio();
    agentAudio.push(voice);
    startPlaying(voice);

    vi.advanceTimersByTime(AUDIO_START_DEADLINE_MS);
    expect(onAudioNotStarted).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a subscribed, attached track that never plays still gets the notice', () => {
    watch();
    agentAudio.push(attachedAudio()); // subscribed and attached; play() never went through

    vi.advanceTimersByTime(AUDIO_START_DEADLINE_MS);
    expect(onAudioNotStarted).toHaveBeenCalledOnce();
  });

  it('other audio playing on the page is not Ferni: still the notice', () => {
    watch();
    agentAudio.push(attachedAudio());
    startPlaying(attachedAudio()); // e.g. an ambient sound, not an agent track

    vi.advanceTimersByTime(AUDIO_START_DEADLINE_MS);
    expect(onAudioNotStarted).toHaveBeenCalledOnce();
  });

  it('agent audio already playing when Ferni joins: nothing to watch', () => {
    const voice = attachedAudio();
    agentAudio.push(voice);
    startPlaying(voice);
    watch();

    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(AUDIO_START_DEADLINE_MS);
    expect(onAudioNotStarted).not.toHaveBeenCalled();
  });

  it('play() refused (Tap to hear Ferni): no notice', () => {
    watch();
    agentAudio.push(attachedAudio());
    document.dispatchEvent(new CustomEvent(AUDIO_PLAY_BLOCKED_EVENT));

    vi.advanceTimersByTime(AUDIO_START_DEADLINE_MS);
    expect(onAudioNotStarted).not.toHaveBeenCalled();
  });

  it('LiveKit says playback is blocked: no notice', () => {
    const room = fakeRoom();
    watch(room);
    room.emitPlayback(false);

    vi.advanceTimersByTime(AUDIO_START_DEADLINE_MS);
    expect(onAudioNotStarted).not.toHaveBeenCalled();
  });

  it('playback already blocked when Ferni joins: no notice', () => {
    const room = fakeRoom();
    room.canPlaybackAudio = false;
    watch(room);

    vi.advanceTimersByTime(AUDIO_START_DEADLINE_MS);
    expect(onAudioNotStarted).not.toHaveBeenCalled();
  });

  it('disconnect clears the timer and the listeners: no notice after', () => {
    const room = fakeRoom();
    const stop = watch(room);
    expect(vi.getTimerCount()).toBe(1);

    stop();

    expect(vi.getTimerCount()).toBe(0);
    expect(room.off).toHaveBeenCalledWith('audioPlaybackChanged', expect.any(Function));
    vi.advanceTimersByTime(AUDIO_START_DEADLINE_MS * 2);
    expect(onAudioNotStarted).not.toHaveBeenCalled();
  });

  it('hanging up or a dropped room by the deadline: no notice', () => {
    watch();
    hangingUp = true;
    vi.advanceTimersByTime(AUDIO_START_DEADLINE_MS);

    const room = fakeRoom();
    hangingUp = false;
    watch(room);
    room.state = 'reconnecting';
    vi.advanceTimersByTime(AUDIO_START_DEADLINE_MS);

    expect(onAudioNotStarted).not.toHaveBeenCalled();
  });
});

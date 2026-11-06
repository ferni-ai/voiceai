/**
 * Ferni on the call but none of his audio plays: one notice per call, 3 s after his
 * audio track appears (the iOS deadline) or 8 s after he joins if he never sends
 * one; never a notice once his audio is really playing, blocked (Tap to hear owns
 * that), or the call is over.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIO_PLAY_BLOCKED_EVENT } from '../../../src/services/audio-play-blocked.js';
import {
  AUDIO_PUBLISH_DEADLINE_MS,
  AUDIO_START_DEADLINE_MS,
  watchAudioStart,
  type AudioStartParticipant,
  type AudioStartRoom,
} from '../../../src/services/audio-start-watch.js';

const ferni: AudioStartParticipant = { identity: 'agent-ferni', isAgent: true };
const caller: AudioStartParticipant = { identity: 'caller-two', isAgent: false };

type Handler = (...args: unknown[]) => void;

function fakeRoom(): AudioStartRoom & {
  canPlaybackAudio?: boolean;
  remoteParticipants: Map<string, AudioStartParticipant>;
  emitPlayback: (canPlay: boolean) => void;
  emit: (event: string, ...args: unknown[]) => void;
  listeners: (event: string) => number;
} {
  const handlers = new Map<string, Set<Handler>>();
  const of = (event: string): Set<Handler> => {
    if (!handlers.has(event)) handlers.set(event, new Set());
    return handlers.get(event)!;
  };
  const room = {
    state: 'connected',
    canPlaybackAudio: undefined as boolean | undefined,
    remoteParticipants: new Map<string, AudioStartParticipant>(),
    on: vi.fn((event: string, cb: Handler) => of(event).add(cb)),
    off: vi.fn((event: string, cb: Handler) => of(event).delete(cb)),
    emit: (event: string, ...args: unknown[]) => {
      for (const cb of [...of(event)]) cb(...args);
    },
    emitPlayback: (canPlay: boolean) => {
      room.canPlaybackAudio = canPlay;
      room.emit('audioPlaybackChanged');
    },
    listeners: (event: string) => of(event).size,
  };
  return room as never;
}

/** LiveKit's trackPublished(publication, participant). */
function publish(room: ReturnType<typeof fakeRoom>, who = ferni, kind = 'audio'): void {
  room.emit('trackPublished', { kind }, who);
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

function watch(room: AudioStartRoom = fakeRoom()): () => void {
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
  it('uses the iOS deadline once his audio exists, and a longer one if it never does', () => {
    expect(AUDIO_START_DEADLINE_MS).toBe(3_000);
    expect(AUDIO_PUBLISH_DEADLINE_MS).toBe(8_000);
  });

  it('his track published at 2 s and never playing: the notice at 5 s, not 3 s after he joined', () => {
    const room = fakeRoom();
    watch(room);
    vi.advanceTimersByTime(2_000);
    publish(room);

    vi.advanceTimersByTime(AUDIO_START_DEADLINE_MS - 1); // 4.999 s
    expect(onAudioNotStarted).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); // 5 s
    expect(onAudioNotStarted).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(60_000);
    expect(onAudioNotStarted).toHaveBeenCalledOnce();
  });

  it('subscribed before we saw it published counts the same: 3 s from there', () => {
    const room = fakeRoom();
    watch(room);
    vi.advanceTimersByTime(1_000);
    room.emit('trackSubscribed', { kind: 'audio' }, { kind: 'audio' }, ferni);

    vi.advanceTimersByTime(AUDIO_START_DEADLINE_MS - 1);
    expect(onAudioNotStarted).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onAudioNotStarted).toHaveBeenCalledOnce();
  });

  it('his track already there when he joins: 3 s from the start', () => {
    const room = fakeRoom();
    room.remoteParticipants.set(ferni.identity, {
      ...ferni,
      audioTrackPublications: new Map([['TR_voice', {}]]),
    });
    watch(room);

    vi.advanceTimersByTime(AUDIO_START_DEADLINE_MS - 1);
    expect(onAudioNotStarted).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onAudioNotStarted).toHaveBeenCalledOnce();
  });

  it('he joins and never sends an audio track: the notice at 8 s, once', () => {
    watch();

    vi.advanceTimersByTime(AUDIO_PUBLISH_DEADLINE_MS - 1);
    expect(onAudioNotStarted).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onAudioNotStarted).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(60_000);
    expect(onAudioNotStarted).toHaveBeenCalledOnce();
  });

  it("a video track, or another participant's audio, does not start the 3 s clock", () => {
    const room = fakeRoom();
    watch(room);
    publish(room, ferni, 'video');
    publish(room, caller, 'audio');

    vi.advanceTimersByTime(AUDIO_START_DEADLINE_MS);
    expect(onAudioNotStarted).not.toHaveBeenCalled();
    vi.advanceTimersByTime(AUDIO_PUBLISH_DEADLINE_MS - AUDIO_START_DEADLINE_MS);
    expect(onAudioNotStarted).toHaveBeenCalledOnce();
  });

  it('the two deadlines never both fire: one notice per call', () => {
    const room = fakeRoom();
    watch(room);
    vi.advanceTimersByTime(7_000);
    publish(room); // restarts at 3 s; the 8 s clock must not also fire

    vi.advanceTimersByTime(1_000); // 8 s after join
    expect(onAudioNotStarted).not.toHaveBeenCalled();
    publish(room); // a second track (music) does not restart it
    vi.advanceTimersByTime(AUDIO_START_DEADLINE_MS - 1_000); // 10 s
    expect(onAudioNotStarted).toHaveBeenCalledOnce();

    publish(room); // a track after the notice does not arm another
    vi.advanceTimersByTime(60_000);
    expect(onAudioNotStarted).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a published track that starts playing in time: no notice', () => {
    const room = fakeRoom();
    watch(room);
    publish(room);
    vi.advanceTimersByTime(1_000);
    const voice = attachedAudio();
    agentAudio.push(voice);
    startPlaying(voice);

    vi.advanceTimersByTime(AUDIO_PUBLISH_DEADLINE_MS);
    expect(onAudioNotStarted).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a subscribed track that is playing before the deadline: no notice', () => {
    watch();
    vi.advanceTimersByTime(1_000);
    const voice = attachedAudio();
    agentAudio.push(voice);
    startPlaying(voice);

    vi.advanceTimersByTime(AUDIO_PUBLISH_DEADLINE_MS);
    expect(onAudioNotStarted).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a subscribed, attached track that never plays still gets the notice', () => {
    watch();
    agentAudio.push(attachedAudio()); // subscribed and attached; play() never went through

    vi.advanceTimersByTime(AUDIO_PUBLISH_DEADLINE_MS);
    expect(onAudioNotStarted).toHaveBeenCalledOnce();
  });

  it('other audio playing on the page is not Ferni: still the notice', () => {
    watch();
    agentAudio.push(attachedAudio());
    startPlaying(attachedAudio()); // e.g. an ambient sound, not an agent track

    vi.advanceTimersByTime(AUDIO_PUBLISH_DEADLINE_MS);
    expect(onAudioNotStarted).toHaveBeenCalledOnce();
  });

  it('agent audio already playing when Ferni joins: nothing to watch', () => {
    const voice = attachedAudio();
    agentAudio.push(voice);
    startPlaying(voice);
    watch();

    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(AUDIO_PUBLISH_DEADLINE_MS);
    expect(onAudioNotStarted).not.toHaveBeenCalled();
  });

  it('play() refused (Tap to hear Ferni): no notice', () => {
    watch();
    agentAudio.push(attachedAudio());
    document.dispatchEvent(new CustomEvent(AUDIO_PLAY_BLOCKED_EVENT));

    vi.advanceTimersByTime(AUDIO_PUBLISH_DEADLINE_MS);
    expect(onAudioNotStarted).not.toHaveBeenCalled();
  });

  it('LiveKit says playback is blocked: no notice', () => {
    const room = fakeRoom();
    watch(room);
    room.emitPlayback(false);

    vi.advanceTimersByTime(AUDIO_PUBLISH_DEADLINE_MS);
    expect(onAudioNotStarted).not.toHaveBeenCalled();
  });

  it('playback already blocked when Ferni joins: no notice', () => {
    const room = fakeRoom();
    room.canPlaybackAudio = false;
    watch(room);

    vi.advanceTimersByTime(AUDIO_PUBLISH_DEADLINE_MS);
    expect(onAudioNotStarted).not.toHaveBeenCalled();
  });

  it('disconnect clears the timer and the listeners: no notice after', () => {
    const room = fakeRoom();
    const stop = watch(room);
    expect(vi.getTimerCount()).toBe(1);

    stop();

    expect(vi.getTimerCount()).toBe(0);
    expect(room.off).toHaveBeenCalledWith('audioPlaybackChanged', expect.any(Function));
    vi.advanceTimersByTime(AUDIO_PUBLISH_DEADLINE_MS * 2);
    expect(onAudioNotStarted).not.toHaveBeenCalled();
  });

  it('after the notice: his audio starting late removes that notice, once', () => {
    const removeNotice = vi.fn();
    onAudioNotStarted.mockReturnValue(removeNotice);
    const stop = watch();
    vi.advanceTimersByTime(AUDIO_PUBLISH_DEADLINE_MS);
    expect(removeNotice).not.toHaveBeenCalled();

    const voice = attachedAudio();
    agentAudio.push(voice);
    voice.dispatchEvent(new Event('playing'));
    expect(removeNotice).toHaveBeenCalledOnce();
    stop();
    expect(removeNotice).toHaveBeenCalledOnce();
  });

  it('after the notice: blocked playback or cleanup removes that notice', () => {
    const removeNotice = vi.fn();
    onAudioNotStarted.mockReturnValue(removeNotice);
    watch();
    vi.advanceTimersByTime(AUDIO_PUBLISH_DEADLINE_MS);
    document.dispatchEvent(new CustomEvent(AUDIO_PLAY_BLOCKED_EVENT));
    expect(removeNotice).toHaveBeenCalledOnce();

    const second = vi.fn();
    onAudioNotStarted.mockReturnValue(second);
    const stop = watch();
    vi.advanceTimersByTime(AUDIO_PUBLISH_DEADLINE_MS);
    stop();
    expect(second).toHaveBeenCalledOnce();
  });

  it('hanging up or a dropped room by the deadline: no notice', () => {
    watch();
    hangingUp = true;
    vi.advanceTimersByTime(AUDIO_PUBLISH_DEADLINE_MS);

    const room = fakeRoom();
    hangingUp = false;
    watch(room);
    room.state = 'reconnecting';
    vi.advanceTimersByTime(AUDIO_PUBLISH_DEADLINE_MS);

    expect(onAudioNotStarted).not.toHaveBeenCalled();
  });

  it('after his track appears, the 3 s clock still honours blocked playback, reconnect and cleanup', () => {
    const blocked = fakeRoom();
    watch(blocked);
    publish(blocked);
    blocked.emitPlayback(false);

    const reconnecting = fakeRoom();
    watch(reconnecting);
    publish(reconnecting);
    reconnecting.state = 'reconnecting';

    const cleaned = fakeRoom();
    const stop = watch(cleaned);
    publish(cleaned);
    stop();
    for (const event of ['audioPlaybackChanged', 'trackPublished', 'trackSubscribed']) {
      expect(cleaned.listeners(event)).toBe(0);
    }

    vi.advanceTimersByTime(AUDIO_PUBLISH_DEADLINE_MS * 2);
    expect(onAudioNotStarted).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

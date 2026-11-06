/**
 * Ferni on the call but none of his audio plays: one notice per call, 3 s after his
 * audio track appears (the iOS deadline) or 8 s after he joins if he never sends
 * one; never a notice once his audio is really playing, blocked (Tap to hear owns
 * that), Ferni has left, or the call is over. Only Ferni's audio counts. Off
 * unless WEB_AUDIO_START_WATCH is on; the timing line is logged either way.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const warn = vi.hoisted(() => vi.fn());
vi.mock('../../../src/utils/logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() }),
}));

import { AUDIO_START_WATCH_STORAGE_KEY } from '../../../src/config/audio-start-watch-flag.js';
import type {
  AgentAudioParticipant,
  AgentAudioPublication,
  AgentAudioRoom,
} from '../../../src/services/agent-audio.js';
import { AUDIO_PLAY_BLOCKED_EVENT } from '../../../src/services/audio-play-blocked.js';
import {
  AUDIO_PUBLISH_DEADLINE_MS,
  AUDIO_START_DEADLINE_MS,
  watchAudioStart,
  watchCallAudio,
} from '../../../src/services/audio-start-watch.js';

type Participant = AgentAudioParticipant & {
  audioTrackPublications: Map<string, AgentAudioPublication>;
};
const person = (identity: string, isAgent: boolean): Participant => ({
  identity,
  isAgent,
  audioTrackPublications: new Map(),
});
let ferni: Participant;
let guest: Participant;

type Handler = (...args: unknown[]) => void;
type FakeRoom = AgentAudioRoom & {
  canPlaybackAudio?: boolean;
  remoteParticipants: Map<string, Participant>;
  emitPlayback: (canPlay: boolean) => void;
  emit: (event: string, ...args: unknown[]) => void;
  listeners: (event: string) => number;
};

/** A room with Ferni in it (he has joined: that is when the watch starts). */
function fakeRoom(...participants: Participant[]): FakeRoom {
  const handlers = new Map<string, Set<Handler>>();
  const of = (event: string): Set<Handler> => {
    if (!handlers.has(event)) handlers.set(event, new Set());
    return handlers.get(event)!;
  };
  const inRoom = participants.length > 0 ? participants : [ferni];
  const room = {
    state: 'connected',
    canPlaybackAudio: undefined as boolean | undefined,
    remoteParticipants: new Map(inRoom.map((p) => [p.identity, p])),
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

let trackCount = 0;

/** LiveKit's trackPublished(publication, participant): published, not yet subscribed. */
function publish(room: FakeRoom, who = ferni, kind = 'audio'): void {
  if (kind === 'audio') who.audioTrackPublications.set(`TR_${++trackCount}`, {});
  room.emit('trackPublished', { kind }, who);
}

/** An element in the document, like the one track.attach() makes. */
function attachedAudio(): HTMLAudioElement {
  const el = document.createElement('audio');
  document.body.appendChild(el);
  return el;
}

/** LiveKit's trackSubscribed(track, publication, participant), with the element attach() made. */
function subscribe(room: FakeRoom, who = ferni): HTMLAudioElement {
  const el = attachedAudio();
  const publication = { track: { attachedElements: [el] } };
  who.audioTrackPublications.set(`TR_${++trackCount}`, publication);
  room.emit('trackSubscribed', { kind: 'audio' }, publication, who);
  return el;
}

/** What the browser does once media flows: not paused, enough data, a 'playing' event. */
function startPlaying(el: HTMLMediaElement): void {
  Object.defineProperty(el, 'paused', { configurable: true, get: () => false });
  Object.defineProperty(el, 'readyState', { configurable: true, get: () => 4 });
  el.dispatchEvent(new Event('playing'));
}

let onAudioNotStarted: ReturnType<typeof vi.fn>;
let hangingUp: boolean;

const deps = () => ({ userHangingUp: () => hangingUp, onAudioNotStarted });

function watch(room: FakeRoom = fakeRoom()): () => void {
  return watchAudioStart(room, deps());
}

beforeEach(() => {
  vi.useFakeTimers();
  ferni = person('agent-ferni', true);
  guest = person('guest-two', false);
  onAudioNotStarted = vi.fn();
  hangingUp = false;
  warn.mockClear();
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
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
    ferni.audioTrackPublications.set('TR_voice', {});
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
    room.remoteParticipants.set(guest.identity, guest);
    publish(room, guest, 'audio');

    vi.advanceTimersByTime(AUDIO_START_DEADLINE_MS);
    expect(onAudioNotStarted).not.toHaveBeenCalled();
    vi.advanceTimersByTime(AUDIO_PUBLISH_DEADLINE_MS - AUDIO_START_DEADLINE_MS);
    expect(onAudioNotStarted).toHaveBeenCalledOnce();
  });

  it('the two deadlines never both fire: a track at 7 s moves the notice to 10 s', () => {
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
    startPlaying(subscribe(room));

    vi.advanceTimersByTime(AUDIO_PUBLISH_DEADLINE_MS);
    expect(onAudioNotStarted).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a subscribed track that is playing before the deadline: no notice', () => {
    const room = fakeRoom();
    watch(room);
    vi.advanceTimersByTime(1_000);
    startPlaying(subscribe(room));

    vi.advanceTimersByTime(AUDIO_PUBLISH_DEADLINE_MS);
    expect(onAudioNotStarted).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a subscribed, attached track that never plays still gets the notice', () => {
    const room = fakeRoom();
    watch(room);
    subscribe(room); // subscribed and attached; play() never went through

    vi.advanceTimersByTime(AUDIO_PUBLISH_DEADLINE_MS);
    expect(onAudioNotStarted).toHaveBeenCalledOnce();
  });

  it('other audio playing on the page is not Ferni: still the notice', () => {
    const room = fakeRoom();
    watch(room);
    subscribe(room);
    startPlaying(attachedAudio()); // e.g. an ambient sound, not an agent track

    vi.advanceTimersByTime(AUDIO_PUBLISH_DEADLINE_MS);
    expect(onAudioNotStarted).toHaveBeenCalledOnce();
  });

  it('agent audio already playing when Ferni joins: nothing to watch', () => {
    const room = fakeRoom();
    startPlaying(subscribe(room));
    watch(room);

    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(AUDIO_PUBLISH_DEADLINE_MS);
    expect(onAudioNotStarted).not.toHaveBeenCalled();
  });

  it('play() refused (Tap to hear Ferni): no notice', () => {
    const room = fakeRoom();
    watch(room);
    subscribe(room);
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
    const room = fakeRoom();
    const stop = watch(room);
    vi.advanceTimersByTime(AUDIO_PUBLISH_DEADLINE_MS);
    expect(removeNotice).not.toHaveBeenCalled();

    subscribe(room).dispatchEvent(new Event('playing'));
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

  it("a guest's audio plays at 2 s and Ferni's never does: the notice at 8 s", () => {
    const room = fakeRoom(ferni, guest);
    watch(room);
    vi.advanceTimersByTime(2_000);
    startPlaying(subscribe(room, guest));

    vi.advanceTimersByTime(AUDIO_PUBLISH_DEADLINE_MS - 2_000 - 1);
    expect(onAudioNotStarted).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); // 8 s
    expect(onAudioNotStarted).toHaveBeenCalledOnce();
  });

  it("a guest's audio playing beside Ferni's silent track: the notice 3 s after his", () => {
    const room = fakeRoom(ferni, guest);
    watch(room);
    vi.advanceTimersByTime(1_000);
    subscribe(room); // Ferni's, never plays
    startPlaying(subscribe(room, guest));

    vi.advanceTimersByTime(AUDIO_START_DEADLINE_MS);
    expect(onAudioNotStarted).toHaveBeenCalledOnce();
  });

  it('a guest already playing when Ferni joins is not Ferni: still watching', () => {
    const room = fakeRoom(ferni, guest);
    startPlaying(subscribe(room, guest));
    watch(room);

    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(AUDIO_PUBLISH_DEADLINE_MS);
    expect(onAudioNotStarted).toHaveBeenCalledOnce();
  });

  it('Ferni leaves before the deadline: no notice (the agent-lost prompt explains it)', () => {
    const room = fakeRoom(ferni, guest);
    watch(room);
    vi.advanceTimersByTime(5_000);
    room.remoteParticipants.delete(ferni.identity); // a guest is still here; Ferni is not

    vi.advanceTimersByTime(AUDIO_PUBLISH_DEADLINE_MS);
    expect(onAudioNotStarted).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('Ferni leaves after his track appeared: no notice at the 3 s deadline either', () => {
    const room = fakeRoom();
    watch(room);
    publish(room);
    room.remoteParticipants.delete(ferni.identity);

    vi.advanceTimersByTime(AUDIO_PUBLISH_DEADLINE_MS);
    expect(onAudioNotStarted).not.toHaveBeenCalled();
  });

  it('notice at 8 s, then his track arrives: no second notice and no re-arm', () => {
    const room = fakeRoom();
    watch(room);
    vi.advanceTimersByTime(AUDIO_PUBLISH_DEADLINE_MS);
    expect(onAudioNotStarted).toHaveBeenCalledOnce();

    publish(room);
    room.emit('trackSubscribed', { kind: 'audio' }, {}, ferni);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(onAudioNotStarted).toHaveBeenCalledOnce();
  });

  it('a track at 7 s clears the 8 s deadline: the 8 s one never fires as well', () => {
    const room = fakeRoom();
    watch(room);
    vi.advanceTimersByTime(7_000);
    publish(room);

    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1_000); // 8 s after join
    expect(onAudioNotStarted).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(onAudioNotStarted).toHaveBeenCalledOnce();
  });
});

describe('watchCallAudio: the WEB_AUDIO_START_WATCH flag', () => {
  const timingLines = () =>
    warn.mock.calls.filter(([, message]) => message === 'Agent audio start timing');

  it('off by default: no timer, no notice, nothing on screen, only the timing line', () => {
    const room = fakeRoom();
    const before = document.body.innerHTML;
    const stop = watchCallAudio(room, deps());

    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(AUDIO_PUBLISH_DEADLINE_MS * 3);
    publish(room);
    vi.advanceTimersByTime(AUDIO_START_DEADLINE_MS * 3);
    expect(onAudioNotStarted).not.toHaveBeenCalled();
    expect(room.listeners('audioPlaybackChanged')).toBe(1); // the timing line's, nothing else

    stop();
    expect(document.body.innerHTML).toBe(before);
    expect(timingLines()).toHaveLength(1);
    for (const event of ['audioPlaybackChanged', 'trackPublished', 'trackSubscribed']) {
      expect(room.listeners(event)).toBe(0);
    }
  });

  it("'false' in localStorage keeps it off on a build that has it on", () => {
    vi.stubEnv('VITE_WEB_AUDIO_START_WATCH', 'true');
    localStorage.setItem(AUDIO_START_WATCH_STORAGE_KEY, 'false');
    watchCallAudio(fakeRoom(), deps());

    vi.advanceTimersByTime(AUDIO_PUBLISH_DEADLINE_MS);
    expect(onAudioNotStarted).not.toHaveBeenCalled();
  });

  it.each([
    ['the build', () => vi.stubEnv('VITE_WEB_AUDIO_START_WATCH', 'true')],
    ['one browser', () => localStorage.setItem(AUDIO_START_WATCH_STORAGE_KEY, 'true')],
  ])('on for %s: the notice at 8 s, and the timing line too', (_where, turnOn) => {
    turnOn();
    const stop = watchCallAudio(fakeRoom(), deps());

    vi.advanceTimersByTime(AUDIO_PUBLISH_DEADLINE_MS);
    expect(onAudioNotStarted).toHaveBeenCalledOnce();
    stop();
    expect(vi.getTimerCount()).toBe(0);
    expect(timingLines()).toHaveLength(1);
  });
});

/**
 * One counts-only timing line per call, from Ferni joining: to his first audio
 * track, and from that track to his audio playing. Only his audio counts; a step
 * never reached is null; no ids or text; logged once; no timers.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const warn = vi.hoisted(() => vi.fn());
vi.mock('../../../src/utils/logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() }),
}));

import type {
  AgentAudioParticipant,
  AgentAudioPublication,
  AgentAudioRoom,
} from '../../../src/services/agent-audio.js';
import { AUDIO_PLAY_BLOCKED_EVENT } from '../../../src/services/audio-play-blocked.js';
import { timeAudioStart } from '../../../src/services/audio-start-timing.js';

type Participant = AgentAudioParticipant & {
  audioTrackPublications: Map<string, AgentAudioPublication>;
};
type Handler = (...args: unknown[]) => void;

const person = (identity: string, isAgent: boolean): Participant => ({
  identity,
  isAgent,
  audioTrackPublications: new Map(),
});

let ferni: Participant;
let guest: Participant;
let clock: number;
const now = () => clock;

function fakeRoom() {
  const handlers = new Map<string, Set<Handler>>();
  const of = (event: string): Set<Handler> => {
    if (!handlers.has(event)) handlers.set(event, new Set());
    return handlers.get(event)!;
  };
  const room = {
    state: 'connected',
    canPlaybackAudio: undefined as boolean | undefined,
    remoteParticipants: new Map([
      [ferni.identity, ferni],
      [guest.identity, guest],
    ]),
    on: (event: string, cb: Handler) => of(event).add(cb),
    off: (event: string, cb: Handler) => of(event).delete(cb),
    emit: (event: string, ...args: unknown[]) => {
      for (const cb of [...of(event)]) cb(...args);
    },
    listeners: (event: string) => of(event).size,
  };
  return room as typeof room & AgentAudioRoom;
}

/** LiveKit's trackSubscribed(track, publication, participant), with the element attach() made. */
function subscribe(room: ReturnType<typeof fakeRoom>, who = ferni): HTMLAudioElement {
  const el = document.createElement('audio');
  document.body.appendChild(el);
  const publication = { track: { attachedElements: [el] } };
  who.audioTrackPublications.set(`TR_${who.audioTrackPublications.size}`, publication);
  room.emit('trackSubscribed', { kind: 'audio' }, publication, who);
  return el;
}

function startPlaying(el: HTMLMediaElement): void {
  Object.defineProperty(el, 'paused', { configurable: true, get: () => false });
  Object.defineProperty(el, 'readyState', { configurable: true, get: () => 4 });
  el.dispatchEvent(new Event('playing'));
}

const lines = () => warn.mock.calls.filter(([, message]) => message === 'Agent audio start timing');

beforeEach(() => {
  ferni = person('agent-ferni', true);
  guest = person('guest-two', false);
  clock = 10_000;
  warn.mockClear();
  document.body.innerHTML = '';
});

describe('timeAudioStart', () => {
  it('his track at 1.5 s, playing 0.6 s later: one line with both numbers, when it plays', () => {
    const room = fakeRoom();
    const stop = timeAudioStart(room, now);
    clock += 1_500;
    const voice = subscribe(room);
    expect(lines()).toHaveLength(0);
    clock += 600;
    startPlaying(voice);

    expect(lines()).toEqual([
      [
        {
          agent_join_to_first_audio_track_ms: 1_500,
          first_audio_track_to_playing_ms: 600,
          playback_blocked: false,
        },
        'Agent audio start timing',
      ],
    ]);
    stop();
    expect(lines()).toHaveLength(1);
  });

  it('the first sight of a track counts, published or subscribed; a second track does not move it', () => {
    const room = fakeRoom();
    timeAudioStart(room, now);
    clock += 700;
    room.emit('trackPublished', { kind: 'audio' }, ferni);
    clock += 300;
    const voice = subscribe(room);
    clock += 200;
    startPlaying(voice);

    expect(lines()[0]?.[0]).toMatchObject({
      agent_join_to_first_audio_track_ms: 700,
      first_audio_track_to_playing_ms: 500,
    });
  });

  it('no track before hang-up: nulls, logged on cleanup, once', () => {
    const room = fakeRoom();
    const stop = timeAudioStart(room, now);
    clock += 9_000;
    stop();
    stop();

    expect(lines()).toEqual([
      [
        {
          agent_join_to_first_audio_track_ms: null,
          first_audio_track_to_playing_ms: null,
          playback_blocked: false,
        },
        'Agent audio start timing',
      ],
    ]);
  });

  it('a track that never plays: the first number, null for the second', () => {
    const room = fakeRoom();
    const stop = timeAudioStart(room, now);
    clock += 2_000;
    subscribe(room);
    clock += 5_000;
    stop();

    expect(lines()[0]?.[0]).toMatchObject({
      agent_join_to_first_audio_track_ms: 2_000,
      first_audio_track_to_playing_ms: null,
    });
  });

  it("a guest's track and audio are not Ferni's", () => {
    const room = fakeRoom();
    const stop = timeAudioStart(room, now);
    clock += 1_000;
    startPlaying(subscribe(room, guest));
    room.emit('trackPublished', { kind: 'audio' }, guest);
    room.emit('trackPublished', { kind: 'video' }, ferni);
    expect(lines()).toHaveLength(0);
    stop();

    expect(lines()[0]?.[0]).toMatchObject({
      agent_join_to_first_audio_track_ms: null,
      first_audio_track_to_playing_ms: null,
    });
  });

  it('his track already there when he joins: 0 to the track', () => {
    ferni.audioTrackPublications.set('TR_voice', {});
    const room = fakeRoom();
    const stop = timeAudioStart(room, now);
    clock += 4_000;
    stop();

    expect(lines()[0]?.[0]).toMatchObject({ agent_join_to_first_audio_track_ms: 0 });
  });

  it('blocked playback on the way is marked, whichever way it is reported', () => {
    const room = fakeRoom();
    timeAudioStart(room, now);
    const voice = subscribe(room);
    document.dispatchEvent(new CustomEvent(AUDIO_PLAY_BLOCKED_EVENT));
    startPlaying(voice);
    expect(lines()[0]?.[0]).toMatchObject({ playback_blocked: true });

    warn.mockClear();
    ferni = person('agent-ferni', true); // a new call
    const other = fakeRoom();
    const stop = timeAudioStart(other, now);
    other.canPlaybackAudio = false;
    other.emit('audioPlaybackChanged');
    stop();
    expect(lines()[0]?.[0]).toMatchObject({ playback_blocked: true });
  });

  it('sets no timers and leaves no listeners after it logs', () => {
    vi.useFakeTimers();
    const added = vi.spyOn(document, 'addEventListener');
    const removed = vi.spyOn(document, 'removeEventListener');
    const room = fakeRoom();
    const stop = timeAudioStart(room, now);
    expect(vi.getTimerCount()).toBe(0);
    startPlaying(subscribe(room));
    for (const event of ['audioPlaybackChanged', 'trackPublished', 'trackSubscribed']) {
      expect(room.listeners(event)).toBe(0);
    }
    const onDocument = (spy: typeof added) => spy.mock.calls.map(([event, cb]) => [event, cb]);
    expect(onDocument(added)).toHaveLength(2); // 'playing' and the refused play()
    expect(onDocument(removed)).toEqual(onDocument(added));
    stop();
    added.mockRestore();
    removed.mockRestore();
    vi.useRealTimers();
  });

  it('carries counts only: no ids, no names, no text', () => {
    const room = fakeRoom();
    const stop = timeAudioStart(room, now);
    subscribe(room);
    stop();

    const [fields] = lines()[0]!;
    expect(Object.keys(fields as object).sort()).toEqual([
      'agent_join_to_first_audio_track_ms',
      'first_audio_track_to_playing_ms',
      'playback_blocked',
    ]);
    expect(JSON.stringify(fields)).not.toContain('agent-ferni');
  });
});

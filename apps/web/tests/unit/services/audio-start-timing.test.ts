/**
 * One counts-only timing line per call, from Ferni joining: to his first audio
 * track, and from that track to his audio playing. Only those two numbers: a step
 * never reached is null; no ids, names, text or anything else; logged once; no timers.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
const warn = logged.warn;
vi.mock('../../../src/utils/logger.js', () => ({ createLogger: () => logged }));

import type {
  AgentAudioParticipant,
  AgentAudioPublication,
  AgentAudioRoom,
} from '../../../src/services/agent-audio.js';
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
  for (const level of Object.values(logged)) level.mockClear();
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

  it('blocked playback adds nothing to the line: still the two numbers only', () => {
    const room = fakeRoom();
    room.canPlaybackAudio = false;
    timeAudioStart(room, now);
    clock += 400;
    const voice = subscribe(room);
    room.emit('audioPlaybackChanged');
    clock += 2_500; // the caller's tap
    startPlaying(voice);

    expect(lines()).toEqual([
      [
        { agent_join_to_first_audio_track_ms: 400, first_audio_track_to_playing_ms: 2_500 },
        'Agent audio start timing',
      ],
    ]);
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
    expect(onDocument(added)).toHaveLength(1); // 'playing'
    expect(onDocument(removed)).toEqual(onDocument(added));
    stop();
    added.mockRestore();
    removed.mockRestore();
    vi.useRealTimers();
  });

  it('carries the two ms values and nothing else: no ids, names or text anywhere it logs', () => {
    const MARK = 'zq7-unique-marker';
    ferni = person(`${MARK}-agent`, true);
    guest = person(`${MARK}-guest`, false);
    const room = Object.assign(fakeRoom(), { name: `${MARK}-room`, sid: `RM_${MARK}` });
    const stop = timeAudioStart(room, now);
    clock += 900;
    const el = subscribe(room);
    el.id = `${MARK}-element`;
    startPlaying(subscribe(room, guest));
    clock += 100;
    startPlaying(el);
    stop();

    const [fields] = lines()[0]!;
    expect(fields).toEqual({
      agent_join_to_first_audio_track_ms: 900,
      first_audio_track_to_playing_ms: 100,
    });
    const everything = Object.values(logged).flatMap((level) => level.mock.calls);
    expect(everything).toHaveLength(1);
    expect(JSON.stringify(everything)).not.toContain(MARK);
  });
});

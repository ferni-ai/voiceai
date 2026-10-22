import { EventEmitter } from 'node:events';

import { ParticipantKind } from '@livekit/rtc-node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { logger, subscribe } = vi.hoisted(() => {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { logger, subscribe: vi.fn() };
});

vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => logger,
  getLogger: () => logger,
}));

// The real registry, with a spy in front so a test can see whether it was used.
vi.mock('../../../speech/tts-gateway/first-audio-observer.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../speech/tts-gateway/first-audio-observer.js')>();
  subscribe.mockImplementation(actual.onGatewayFirstAudio);
  return { ...actual, onGatewayFirstAudio: subscribe };
});

import { createFirstAudioObserver } from '../../../speech/tts-gateway/first-audio-observer.js';
import { noteTtfwCaller, watchTimeToFirstWord, type TtfwRoom } from '../time-to-first-word.js';
import { CLIENT_TIMING_TOPIC } from '../time-to-first-word-record.js';

const ON = { TTFW_METRIC: 'on' };
const T0 = 1_760_000_000_000;

function fakeRoom(): TtfwRoom & EventEmitter & { remoteParticipants: Map<string, unknown> } {
  return Object.assign(new EventEmitter(), { remoteParticipants: new Map<string, unknown>() });
}

/** A clock the test moves by hand. */
function clock(start = 0): { now: () => number; at: (ms: number) => void } {
  let t = start;
  return { now: () => t, at: (ms) => void (t = ms) };
}

const caller = {
  identity: 'user-1',
  kind: ParticipantKind.STANDARD,
  attributes: { platform: 'ios' },
};
const ttfwLines = (): Array<Record<string, unknown>> =>
  logger.info.mock.calls
    .filter((c) => c[1] === 'Time to first word')
    .map((c) => c[0] as Record<string, unknown>);

/** The gateway's first audio for a session through the real observer: text out at 100 ms, audio at 400 ms. */
function gatewayFirstAudio(sessionId: string): void {
  const base = Date.now();
  const spy = vi.spyOn(Date, 'now');
  try {
    spy.mockReturnValue(base);
    const observe = createFirstAudioObserver({ sessionId, startTime: base - 400 });
    spy.mockReturnValue(base - 300);
    observe.stage('push');
    spy.mockReturnValue(base);
    observe();
  } finally {
    spy.mockRestore();
  }
}

beforeEach(() => {
  logger.info.mockClear();
  logger.debug.mockClear();
  subscribe.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('watchTimeToFirstWord, flag off', () => {
  it('registers nothing and logs nothing', () => {
    const room = fakeRoom();
    const on = vi.spyOn(room, 'on');
    const watch = watchTimeToFirstWord(room, 'AJ_1', { env: {} });
    watch.agentJoined();
    noteTtfwCaller(room, 'session-off', caller);
    gatewayFirstAudio('session-off');
    watch.finish();
    expect(on).not.toHaveBeenCalled();
    expect(room.listenerCount('dataReceived')).toBe(0);
    expect(subscribe).not.toHaveBeenCalled();
    expect(ttfwLines()).toHaveLength(0);
  });
});

describe('watchTimeToFirstWord, flag on', () => {
  it('logs one line from the later of agent and caller join to first audio', () => {
    const c = clock(1_000);
    const room = fakeRoom();
    const watch = watchTimeToFirstWord(room, 'AJ_2', { env: ON, now: c.now });
    c.at(1_500);
    watch.agentJoined();
    c.at(2_000);
    room.emit('participantConnected', caller);
    c.at(2_600);
    noteTtfwCaller(room, 'session-a', caller);
    c.at(3_400);
    gatewayFirstAudio('session-a');
    gatewayFirstAudio('session-a'); // a second reply's first audio
    watch.finish();
    watch.finish();

    const lines = ttfwLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      sessionId: 'session-a',
      platform: 'ios',
      ttfwMs: 1_400, // 3_400 - max(1_500, 2_000): the caller's join, not the entry noticing it at 2_600
      jobToAgentJoinMs: 500,
      agentJoinToCallerMs: 500,
      jobToFirstAudioMs: 2_400,
      ttsFirstAudioMs: 400,
      openerTextToAudioMs: 300,
      readyToOpenerTextMs: 1_100,
    });
    expect(JSON.stringify(lines[0])).not.toContain('user-1');
    expect(room.listenerCount('participantConnected')).toBe(0);
    expect(room.listenerCount('dataReceived')).toBe(0);
  });

  it('counts from the agent join when the caller was already in the room', () => {
    const c = clock(0);
    const room = fakeRoom();
    const watch = watchTimeToFirstWord(room, 'AJ_3', { env: ON, now: c.now });
    room.remoteParticipants.set('user-1', {});
    c.at(800);
    watch.agentJoined();
    c.at(1_900);
    noteTtfwCaller(room, 'session-b', caller);
    c.at(2_300);
    gatewayFirstAudio('session-b');
    watch.finish();
    expect(ttfwLines()[0]).toMatchObject({ ttfwMs: 1_500, agentJoinToCallerMs: 0 });
  });

  it("ignores another call's first audio", () => {
    const c = clock(0);
    const room = fakeRoom();
    const watch = watchTimeToFirstWord(room, 'AJ_4', { env: ON, now: c.now });
    watch.agentJoined();
    noteTtfwCaller(room, 'session-c', caller);
    gatewayFirstAudio('session-other');
    watch.finish();
    expect(ttfwLines()[0]).not.toHaveProperty('ttfwMs');
    expect(ttfwLines()[0]).toMatchObject({ sessionId: 'session-c' });
  });

  it("adds the app's moments and logs as soon as they arrive after first audio", () => {
    const c = clock(0);
    const room = fakeRoom();
    const watch = watchTimeToFirstWord(room, 'AJ_5', { env: ON, now: c.now });
    watch.agentJoined();
    noteTtfwCaller(room, 'session-d', caller);
    c.at(1_200);
    gatewayFirstAudio('session-d');
    expect(ttfwLines()).toHaveLength(0);
    const payload = new TextEncoder().encode(
      JSON.stringify({ tapAt: T0, roomConnectedAt: T0 + 700, firstAudioHeardAt: T0 + 1_900 })
    );
    room.emit('dataReceived', new TextEncoder().encode('{garbage'), caller, 0, CLIENT_TIMING_TOPIC);
    room.emit('dataReceived', payload, caller, 0, 'some.other.topic');
    expect(ttfwLines()).toHaveLength(0);
    room.emit('dataReceived', payload, caller, 0, CLIENT_TIMING_TOPIC);
    expect(ttfwLines()).toHaveLength(1);
    expect(ttfwLines()[0]).toMatchObject({
      ttfwMs: 1_200,
      clientTapToRoomMs: 700,
      clientTapToHeardMs: 1_900,
      clientRoomToHeardMs: 1_200,
    });
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'AJ_5' }),
      'Ignored a client timing message'
    );
    watch.finish();
    expect(ttfwLines()).toHaveLength(1);
  });

  it('logs without the app after the grace period', () => {
    vi.useFakeTimers();
    const c = clock(0);
    const room = fakeRoom();
    const watch = watchTimeToFirstWord(room, 'AJ_6', { env: ON, now: c.now, graceMs: 5_000 });
    watch.agentJoined();
    noteTtfwCaller(room, 'session-e', caller);
    c.at(900);
    gatewayFirstAudio('session-e');
    vi.advanceTimersByTime(4_999);
    expect(ttfwLines()).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(ttfwLines()).toHaveLength(1);
    expect(ttfwLines()[0]).toMatchObject({ ttfwMs: 900 });
    watch.finish();
    expect(ttfwLines()).toHaveLength(1);
  });
});

/**
 * Which agent audio track is the voice:
 * - by published track name first (roomio_audio = voice, background_* = music)
 * - a voice track that goes away frees the voice slot, so its replacement is
 *   played as voice (visualised, never ducked), not as music
 * - unnamed tracks keep the old arrival-order rule
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockState: Record<string, unknown> = {
  userName: 'Test User',
  deviceId: 'test-device-123',
  selectedPersona: { id: 'ferni', name: 'Ferni' },
  isMuted: false,
};
vi.mock('../../../src/state/app.state.js', () => ({
  appState: { getState: () => mockState, get: (key: string) => mockState[key] },
  setConnectionState: vi.fn(),
  updateAuthState: vi.fn(),
}));
vi.mock('../../../src/utils/logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { agentAudioTrackKind } from '../../../src/services/agent-audio-track.js';

type Handler = (...args: unknown[]) => void;

function createRoom() {
  const handlers = new Map<string, Set<Handler>>();
  const room = {
    state: 'disconnected',
    name: 'voice-1',
    localParticipant: {
      identity: 'me',
      setMicrophoneEnabled: vi.fn(async () => undefined),
      getTrackPublications: vi.fn(() => []),
      publishData: vi.fn(),
    },
    remoteParticipants: new Map<string, unknown>([
      ['agent-1', { identity: 'agent-1', isAgent: true, audioTrackPublications: new Map() }],
    ]),
    connect: vi.fn(async () => {
      room.state = 'connected';
    }),
    disconnect: vi.fn(async () => {
      room.state = 'disconnected';
    }),
    on: vi.fn((event: string, cb: Handler) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)?.add(cb);
      return room;
    }),
    off: vi.fn((event: string, cb: Handler) => {
      handlers.get(event)?.delete(cb);
      return room;
    }),
    emit(event: string, ...args: unknown[]) {
      for (const cb of [...(handlers.get(event) ?? [])]) cb(...args);
    },
  };
  return room;
}

function audioTrack(sid: string) {
  const el = document.createElement('audio');
  el.load = vi.fn();
  el.play = vi.fn(async () => undefined);
  el.pause = vi.fn();
  return { kind: 'audio', sid, attach: () => el, mediaStreamTrack: { id: sid } };
}

const agent = { identity: 'agent-1' };
let room: ReturnType<typeof createRoom>;
let service: typeof import('../../../src/services/connection.service.js').connectionService;
const onAudioTrack = vi.fn();
const onMusicTrack = vi.fn();

const subscribe = (sid: string, trackName?: string): void =>
  room.emit('trackSubscribed', audioTrack(sid), trackName ? { trackName } : {}, agent);
const unsubscribe = (sid: string): void =>
  room.emit('trackUnsubscribed', { kind: 'audio', sid, mediaStreamTrack: { id: sid } }, {}, agent);
const voiceSids = (): unknown[] => onAudioTrack.mock.calls.map((c) => (c[2] as { id: string }).id);

beforeEach(async () => {
  vi.resetModules();
  onAudioTrack.mockReset();
  onMusicTrack.mockReset();
  room = createRoom();
  (window as unknown as { LiveKit: unknown }).LiveKit = {
    Room: vi.fn(function () {
      return room;
    }),
    RoomEvent: {},
    Track: { Kind: { Audio: 'audio', Video: 'video' } },
  };
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ token: 't', url: 'wss://lk.example', room: 'voice-1', username: 'U' }),
  })) as unknown as typeof fetch;
  service = (await import('../../../src/services/connection.service.js')).connectionService;
  service.setCallbacks({ onAudioTrack, onMusicTrack });
  await service.connect();
});
afterEach(async () => {
  await service.disconnect();
});

describe('replacement voice track', () => {
  it('treats voice track B as voice after voice track A was unsubscribed', () => {
    subscribe('voice-a');
    unsubscribe('voice-a');
    subscribe('voice-b');
    expect(voiceSids()).toEqual(['voice-a', 'voice-b']);
    expect(onMusicTrack).not.toHaveBeenCalled();
    expect(service.isMusicTrack('agent-1-voice-b')).toBe(false);
  });

  it('treats a named replacement voice track as voice too', () => {
    subscribe('voice-a', 'roomio_audio');
    unsubscribe('voice-a');
    subscribe('voice-b', 'roomio_audio');
    expect(voiceSids()).toEqual(['voice-a', 'voice-b']);
    expect(onMusicTrack).not.toHaveBeenCalled();
  });
});

describe('classifying by track name', () => {
  it('plays roomio_audio as voice even when a music track arrived first', () => {
    subscribe('music-1', 'background_audio');
    subscribe('voice-1', 'roomio_audio');
    expect(onMusicTrack).toHaveBeenCalledTimes(1);
    expect(onMusicTrack.mock.calls[0]?.[1]).toBe('agent-1-music-1');
    expect(voiceSids()).toEqual(['voice-1']);
  });

  it('plays roomio_audio as voice while a music track is expected', () => {
    service.expectMusicTrack();
    subscribe('voice-1', 'roomio_audio');
    expect(voiceSids()).toEqual(['voice-1']);
    expect(onMusicTrack).not.toHaveBeenCalled();
  });

  it('keeps arrival order for unnamed tracks: first is voice, the next is music', () => {
    subscribe('first');
    subscribe('second');
    expect(voiceSids()).toEqual(['first']);
    expect(onMusicTrack.mock.calls.map((c) => c[1])).toEqual(['agent-1-second']);
  });

  it('maps names to kinds', () => {
    expect(agentAudioTrackKind({ trackName: 'roomio_audio' })).toBe('voice');
    expect(agentAudioTrackKind({ trackName: 'background_audio' })).toBe('music');
    expect(agentAudioTrackKind({ trackName: 'background_reactions' })).toBe('music');
    expect(agentAudioTrackKind({ trackName: 'something_else' })).toBe('unknown');
    expect(agentAudioTrackKind({})).toBe('unknown');
    expect(agentAudioTrackKind(null)).toBe('unknown');
  });
});

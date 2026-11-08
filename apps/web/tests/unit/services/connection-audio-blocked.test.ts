/**
 * The connection service reports a refused play() on an agent audio track
 * (logged with context, and AUDIO_PLAY_BLOCKED_EVENT for "Tap to hear Ferni")
 * instead of only waiting silently for the next tap.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockState: Record<string, unknown> = {
  userName: 'Test User',
  deviceId: 'test-device-123',
  selectedPersona: { id: 'ferni', name: 'Ferni' },
  isMuted: false,
};
const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('../../../src/state/app.state.js', () => ({
  appState: { getState: () => mockState, get: (key: string) => mockState[key] },
  setConnectionState: vi.fn(),
  updateAuthState: vi.fn(),
}));
vi.mock('../../../src/utils/logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() }),
}));

import { AUDIO_PLAY_BLOCKED_EVENT } from '../../../src/services/audio-play-blocked.js';

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

function audioTrack(sid: string, play: () => Promise<void>) {
  const el = document.createElement('audio');
  el.load = vi.fn();
  el.play = vi.fn(play);
  el.pause = vi.fn();
  return { kind: 'audio', sid, attach: () => el, mediaStreamTrack: { id: sid } };
}

let room: ReturnType<typeof createRoom>;
let service: typeof import('../../../src/services/connection.service.js').connectionService;
const blocked = vi.fn();

beforeEach(async () => {
  vi.resetModules();
  warn.mockClear();
  blocked.mockClear();
  document.addEventListener(AUDIO_PLAY_BLOCKED_EVENT, blocked);
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
  service.setCallbacks({ onAudioTrack: vi.fn() });
  await service.connect();
});
afterEach(async () => {
  document.removeEventListener(AUDIO_PLAY_BLOCKED_EVENT, blocked);
  await service.disconnect();
});

describe('refused agent audio', () => {
  it('reports a blocked voice track so the UI can offer a tap', async () => {
    const refusal = Object.assign(new Error('gesture needed'), { name: 'NotAllowedError' });
    room.emit(
      'trackSubscribed',
      audioTrack('voice-a', async () => Promise.reject(refusal)),
      {},
      {
        identity: 'agent-1',
      }
    );
    await vi.waitFor(() => expect(blocked).toHaveBeenCalledTimes(1));
    expect(warn).toHaveBeenCalledWith(
      'Agent audio did not start',
      expect.objectContaining({ trackKey: 'agent-1-voice-a', errorName: 'NotAllowedError' })
    );
  });

  it('says nothing when the voice track plays', async () => {
    room.emit(
      'trackSubscribed',
      audioTrack('voice-a', async () => undefined),
      {},
      {
        identity: 'agent-1',
      }
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(blocked).not.toHaveBeenCalled();
  });
});

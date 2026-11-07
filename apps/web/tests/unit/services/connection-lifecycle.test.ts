/**
 * Call lifecycle in the connection service:
 * - "connected" only once the voice agent is in the room (including one already there)
 * - agent never arrives / dispatch failed / token errors / mic denied -> one classified failure
 * - aborting the attempt really closes the room
 * - an unexpected drop is cleaned up like a hang-up (voice track identity reset)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockState: Record<string, unknown> = {
  userName: 'Test User',
  deviceId: 'test-device-123',
  selectedPersona: { id: 'ferni', name: 'Ferni' },
  isMuted: false,
};
const setConnectionState = vi.fn();
vi.mock('../../../src/state/app.state.js', () => ({
  appState: { getState: () => mockState, get: (key: string) => mockState[key] },
  setConnectionState: (s: string) => setConnectionState(s),
  updateAuthState: vi.fn(),
}));
vi.mock('../../../src/utils/logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { AGENT_DROP_PROMPT_FLAG_KEY } from '../../../src/config/agent-drop-prompt-flag.js';
import { AUDIO_START_WATCH_STORAGE_KEY } from '../../../src/config/audio-start-watch-flag.js';
import { showAudioNotStartedPrompt } from '../../../src/app/agent-lost-prompt.js';

type Handler = (...args: unknown[]) => void;

function createRoom(withAgent: boolean) {
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
    remoteParticipants: new Map<string, unknown>(
      withAgent
        ? [['agent-1', { identity: 'agent-1', isAgent: true, audioTrackPublications: new Map() }]]
        : []
    ),
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
    listenerCount: (event: string) => handlers.get(event)?.size ?? 0,
  };
  return room;
}

function tokenResponse(extra: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      token: 't',
      url: 'wss://lk.example',
      room: 'voice-1',
      username: 'Test User',
      ...extra,
    }),
  };
}

let room: ReturnType<typeof createRoom>;
let service: typeof import('../../../src/services/connection.service.js').connectionService;
const fetchMock = vi.fn();

async function load(withAgent: boolean): Promise<void> {
  vi.resetModules();
  room = createRoom(withAgent);
  (window as unknown as { LiveKit: unknown }).LiveKit = {
    Room: vi.fn(function () {
      return room;
    }),
    RoomEvent: {},
    Track: { Kind: { Audio: 'audio', Video: 'video' } },
  };
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  service = (await import('../../../src/services/connection.service.js')).connectionService;
}

beforeEach(() => {
  fetchMock.mockReset();
  setConnectionState.mockReset();
  mockState['isMuted'] = false;
});
afterEach(() => {
  vi.useRealTimers();
});

describe('waiting for the agent', () => {
  it('succeeds at once when the agent is already in the room, and reports it', async () => {
    await load(true);
    fetchMock.mockResolvedValue(tokenResponse());
    const onAgentConnected = vi.fn();
    service.setCallbacks({ onAgentConnected });

    await expect(service.connect()).resolves.toBe(true);

    expect(onAgentConnected).toHaveBeenCalledWith('agent-1');
    expect(setConnectionState).toHaveBeenLastCalledWith('connected');
  });

  it('stays "connecting" after the room joins until the agent arrives', async () => {
    await load(false);
    fetchMock.mockResolvedValue(tokenResponse());
    const onAgentConnected = vi.fn();
    service.setCallbacks({ onAgentConnected });

    const pending = service.connect();
    await vi.waitFor(() => expect(room.connect).toHaveBeenCalled());
    // LiveKit reports the room connected; the call is not ready yet.
    room.emit('connectionStateChanged', 'connected');
    expect(setConnectionState).not.toHaveBeenCalledWith('connected');

    room.emit('participantConnected', { identity: 'agent-xyz', isAgent: true });
    await expect(pending).resolves.toBe(true);
    expect(setConnectionState).toHaveBeenLastCalledWith('connected');
    expect(onAgentConnected).toHaveBeenCalledTimes(1);
  });

  it('fails with agent_timeout and closes the room when no agent arrives', async () => {
    await load(false);
    fetchMock.mockResolvedValue(tokenResponse());
    vi.useFakeTimers();

    const pending = service.connect();
    await vi.waitFor(() => expect(room.connect).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(15_000);

    await expect(pending).resolves.toBe(false);
    expect(service.getLastFailure()?.kind).toBe('agent_timeout');
    expect(room.disconnect).toHaveBeenCalled();
    expect(service.getRoom()).toBeNull();
    expect(setConnectionState).toHaveBeenLastCalledWith('error');
  });

  it('reports agent_unavailable when the server said the dispatch failed', async () => {
    await load(false);
    fetchMock.mockResolvedValue(tokenResponse({ agent_dispatched: false }));
    vi.useFakeTimers();

    const pending = service.connect();
    await vi.waitFor(() => expect(room.connect).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(6_000);

    await expect(pending).resolves.toBe(false);
    expect(service.getLastFailure()?.kind).toBe('agent_unavailable');
  });
});

describe('hang-up or drop while waiting for the agent', () => {
  it('a hang-up cancels the attempt: no late agent_timeout, no error', async () => {
    await load(false);
    fetchMock.mockResolvedValue(tokenResponse());
    vi.useFakeTimers();
    const onError = vi.fn();
    service.setCallbacks({ onError });

    const pending = service.connect();
    await vi.waitFor(() => expect(room.connect).toHaveBeenCalled());
    await service.disconnect();
    await vi.advanceTimersByTimeAsync(16_000);

    await expect(pending).resolves.toBe(false);
    expect(service.getLastFailure()?.kind).toBe('cancelled');
    expect(setConnectionState).toHaveBeenLastCalledWith('disconnected');
    expect(onError).not.toHaveBeenCalled();
    expect(room.disconnect).toHaveBeenCalledTimes(1);
  });

  it('a room drop fails the attempt at once as "dropped", not 15 s later', async () => {
    await load(false);
    fetchMock.mockResolvedValue(tokenResponse());
    vi.useFakeTimers();
    let settled = false;

    const pending = service.connect();
    void pending.then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(room.connect).toHaveBeenCalled());
    room.emit('disconnected', 'SIGNAL_CLOSE');
    await vi.advanceTimersByTimeAsync(50);

    expect(settled).toBe(true);
    await expect(pending).resolves.toBe(false);
    expect(service.getLastFailure()?.kind).toBe('dropped');
    expect(service.getRoom()).toBeNull();
  });
});

describe('classified failures', () => {
  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [429, 'rate_limited'],
    [503, 'unavailable'],
    [500, 'server_error'],
  ])('maps a %i from /token to %s', async (status, kind) => {
    await load(true);
    fetchMock.mockResolvedValue({ ok: false, status, text: async () => 'nope' });

    await expect(service.connect()).resolves.toBe(false);

    expect(service.getLastFailure()?.kind).toBe(kind);
    expect(room.connect).not.toHaveBeenCalled();
  });

  it('fails with mic_denied and leaves no open room when the mic is blocked', async () => {
    await load(true);
    fetchMock.mockResolvedValue(tokenResponse());
    room.localParticipant.setMicrophoneEnabled.mockRejectedValueOnce(
      Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' })
    );

    await expect(service.connect()).resolves.toBe(false);

    expect(service.getLastFailure()?.kind).toBe('mic_denied');
    expect(room.disconnect).toHaveBeenCalled();
    expect(service.getRoom()).toBeNull();
  });

  it('cancels the attempt and closes the room when the signal aborts', async () => {
    await load(false);
    fetchMock.mockResolvedValue(tokenResponse());
    const controller = new AbortController();
    const onError = vi.fn();
    service.setCallbacks({ onError });

    const pending = service.connect({ signal: controller.signal });
    await vi.waitFor(() => expect(room.connect).toHaveBeenCalled());
    controller.abort();

    await expect(pending).resolves.toBe(false);
    expect(service.getLastFailure()?.kind).toBe('cancelled');
    expect(room.disconnect).toHaveBeenCalled();
    expect(service.getRoom()).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });
});

describe('unexpected disconnect', () => {
  function audioTrack(sid: string) {
    const el = document.createElement('audio');
    el.load = vi.fn();
    el.play = vi.fn(async () => undefined);
    el.pause = vi.fn();
    return { kind: 'audio', sid, attach: () => el, mediaStreamTrack: { id: sid } };
  }

  it('cleans up like a hang-up and tells the app, so the next call starts clean', async () => {
    await load(true);
    fetchMock.mockResolvedValue(tokenResponse());
    const onUnexpectedDisconnect = vi.fn();
    const onAudioTrack = vi.fn();
    const onMusicTrack = vi.fn();
    service.setCallbacks({ onUnexpectedDisconnect, onAudioTrack, onMusicTrack });
    await service.connect();
    room.emit('trackSubscribed', audioTrack('voice-a'), {}, { identity: 'agent-1' });
    expect(onAudioTrack).toHaveBeenCalledTimes(1);

    room.emit('disconnected', 'SIGNAL_CLOSE');

    expect(onUnexpectedDisconnect).toHaveBeenCalledWith('SIGNAL_CLOSE');
    expect(service.getRoom()).toBeNull();
    expect(room.listenerCount('trackSubscribed')).toBe(0);
    expect(document.querySelectorAll('audio')).toHaveLength(0);

    // Next call: its first track is the agent's voice, not music.
    const nextRoom = createRoom(true);
    room = nextRoom;
    (window as unknown as { LiveKit: { Room: unknown } }).LiveKit.Room = vi.fn(function () {
      return nextRoom;
    });
    await service.connect();
    nextRoom.emit('trackSubscribed', audioTrack('voice-b'), {}, { identity: 'agent-1' });
    expect(onAudioTrack).toHaveBeenCalledTimes(2);
    expect(onMusicTrack).not.toHaveBeenCalled();
  });

  it('does not report a hang-up as unexpected', async () => {
    await load(true);
    fetchMock.mockResolvedValue(tokenResponse());
    const onUnexpectedDisconnect = vi.fn();
    service.setCallbacks({ onUnexpectedDisconnect });
    await service.connect();

    await service.disconnect();

    expect(onUnexpectedDisconnect).not.toHaveBeenCalled();
  });
});

describe('mic restore reads the real mute state', () => {
  it('does not re-enable a muted mic after a reconnect, and does when unmuted', async () => {
    await load(true);
    fetchMock.mockResolvedValue(tokenResponse());
    await service.connect();
    room.localParticipant.setMicrophoneEnabled.mockClear();

    mockState['isMuted'] = true;
    room.emit('reconnected');
    await Promise.resolve();
    expect(room.localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled();

    mockState['isMuted'] = false;
    room.emit('reconnected');
    await vi.waitFor(() =>
      expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(true)
    );
  });
});

describe("LiveKit's room states, as the app sees them", () => {
  it.each([
    // A signal resume: the call and its data channel stay up, so it's a reconnect, not an end.
    ['signalReconnecting', 'reconnecting'],
    ['reconnecting', 'reconnecting'],
    ['connected', 'connected'],
    ['disconnected', 'disconnected'],
  ])('%s is reported as %s', async (livekit, app) => {
    await load(true);
    fetchMock.mockResolvedValue(tokenResponse());
    await service.connect();
    setConnectionState.mockClear();

    room.emit('connectionStateChanged', livekit);

    expect(setConnectionState).toHaveBeenCalledWith(app);
  });
});

describe('Ferni joins but none of his audio plays (audio-start-watch.ts)', () => {
  type Who = { identity: string; isAgent?: boolean; audioTrackPublications: Map<string, unknown> };

  /** LiveKit's trackSubscribed: the publication gets the track, and attach() records the element. */
  function subscribeAudio(who: Who, sid: string): HTMLAudioElement {
    const el = document.createElement('audio');
    el.load = vi.fn();
    el.play = vi.fn(async () => undefined); // the browser never starts it
    const track = {
      kind: 'audio',
      sid,
      mediaStreamTrack: { id: sid },
      attachedElements: [] as HTMLMediaElement[],
      attach() {
        track.attachedElements.push(el);
        return el;
      },
    };
    const publication = { trackName: 'agent_voice', track };
    who.audioTrackPublications.set(sid, publication);
    room.emit('trackSubscribed', track, publication, who);
    return el;
  }

  function startPlaying(el: HTMLMediaElement): void {
    Object.defineProperty(el, 'paused', { configurable: true, get: () => false });
    Object.defineProperty(el, 'readyState', { configurable: true, get: () => 4 });
    el.dispatchEvent(new Event('playing'));
  }

  const ferni = (): Who => room.remoteParticipants.get('agent-1') as Who;

  async function connectWithAgent(
    onAudioNotStarted: () => void,
    { watch = true, onAgentLost }: { watch?: boolean; onAgentLost?: () => void } = {}
  ): Promise<void> {
    if (watch) localStorage.setItem(AUDIO_START_WATCH_STORAGE_KEY, 'true');
    await load(true);
    fetchMock.mockResolvedValue(tokenResponse());
    vi.useFakeTimers();
    service.setCallbacks({ onAudioNotStarted, onAgentLost });
    await expect(service.connect()).resolves.toBe(true);
  }

  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('his track at 2 s that never plays: the notice at 5 s, connection state left alone', async () => {
    const onAudioNotStarted = vi.fn();
    await connectWithAgent(onAudioNotStarted);
    setConnectionState.mockClear();

    await vi.advanceTimersByTimeAsync(2_000);
    room.emit('trackPublished', { kind: 'audio' }, { identity: 'agent-1', isAgent: true });
    await vi.advanceTimersByTimeAsync(2_999);
    expect(onAudioNotStarted).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(onAudioNotStarted).toHaveBeenCalledOnce();
    expect(setConnectionState).not.toHaveBeenCalled();
    expect(room.disconnect).not.toHaveBeenCalled();
    expect(service.getRoom()).toBe(room);
  });

  it('Ferni joins and sends no audio track: the notice at 8 s, not before', async () => {
    const onAudioNotStarted = vi.fn();
    await connectWithAgent(onAudioNotStarted);

    await vi.advanceTimersByTimeAsync(7_999);
    expect(onAudioNotStarted).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onAudioNotStarted).toHaveBeenCalledOnce();
  });

  it('his subscribed track that plays before the deadline: no notice', async () => {
    const onAudioNotStarted = vi.fn();
    await connectWithAgent(onAudioNotStarted);

    startPlaying(subscribeAudio(ferni(), 'TR_voice'));
    await vi.advanceTimersByTimeAsync(10_000);

    expect(onAudioNotStarted).not.toHaveBeenCalled();
  });

  it("a guest's audio plays at 2 s and Ferni's never does: the notice at 8 s", async () => {
    const onAudioNotStarted = vi.fn();
    await connectWithAgent(onAudioNotStarted);
    const guest: Who = { identity: 'guest-2', isAgent: false, audioTrackPublications: new Map() };
    room.remoteParticipants.set(guest.identity, guest);

    await vi.advanceTimersByTimeAsync(2_000);
    startPlaying(subscribeAudio(guest, 'TR_guest'));
    await vi.advanceTimersByTimeAsync(5_999);
    expect(onAudioNotStarted).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onAudioNotStarted).toHaveBeenCalledOnce();
  });

  it.each([
    ['on', true],
    ['off', false],
  ])(
    'Ferni leaves at 6 s, reconnect prompt %s: never "sound didn\'t start"',
    async (_label, promptOn) => {
      if (promptOn) localStorage.setItem(AGENT_DROP_PROMPT_FLAG_KEY, 'true');
      const onAudioNotStarted = vi.fn();
      const onAgentLost = vi.fn();
      await connectWithAgent(onAudioNotStarted, { onAgentLost });

      await vi.advanceTimersByTimeAsync(6_000);
      const agent = ferni();
      room.remoteParticipants.delete('agent-1');
      room.emit('participantDisconnected', agent);
      await vi.advanceTimersByTimeAsync(30_000);

      expect(onAudioNotStarted).not.toHaveBeenCalled();
      expect(onAgentLost).toHaveBeenCalledTimes(promptOn ? 1 : 0);
    }
  );

  it('a hang-up before the deadline clears the watch and the timing line: no notice after', async () => {
    const onAudioNotStarted = vi.fn();
    await connectWithAgent(onAudioNotStarted);
    expect(room.listenerCount('audioPlaybackChanged')).toBe(1); // the watch's
    const tracked = room.listenerCount('trackSubscribed');

    await service.disconnect();
    expect(room.listenerCount('audioPlaybackChanged')).toBe(0);
    expect(room.listenerCount('trackSubscribed')).toBeLessThanOrEqual(tracked - 2); // the watch's and the timing line's
    await vi.advanceTimersByTimeAsync(10_000);

    expect(onAudioNotStarted).not.toHaveBeenCalled();
  });

  /** The main call's page, with the app's real handler for the notice (app.ts). */
  async function connectOnThePage(watch: boolean): Promise<void> {
    document.body.innerHTML = '<main><div class="controls-row"></div></main>';
    const liveCall = {
      endCall: vi.fn(async () => undefined),
      connect: vi.fn(async () => undefined),
    };
    await connectWithAgent(() => showAudioNotStartedPrompt(liveCall), { watch });
    subscribeAudio(ferni(), 'TR_voice');
  }

  it('flag on: the same silent track puts "sound didn\'t start" on the page', async () => {
    await connectOnThePage(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(document.querySelector('.call-status')?.textContent).toContain("The sound didn't start");
  });

  it('flag off (the default): the page, focus and timers stay as they were, and no watch is armed', async () => {
    await connectOnThePage(false);
    expect(room.listenerCount('audioPlaybackChanged')).toBe(0); // no watch
    const page = document.body.innerHTML;
    const focused = document.activeElement;
    let timers = vi.getTimerCount();

    for (let second = 1; second <= 60; second++) {
      await vi.advanceTimersByTimeAsync(1_000);
      expect(vi.getTimerCount()).toBeLessThanOrEqual(timers); // nothing new is scheduled
      timers = vi.getTimerCount();
    }
    expect(timers).toBe(1); // only the call-quality interval
    expect(document.body.innerHTML).toBe(page);
    expect(document.activeElement).toBe(focused);

    await service.disconnect();
    expect(room.listenerCount('audioPlaybackChanged')).toBe(0);
  });
});

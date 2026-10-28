/**
 * A brief signal blip in the middle of a call doesn't end the picker's wait.
 *
 * On a signal resume livekit-client emits `connectionStateChanged('signalReconnecting')`
 * while the call and its data channel stay up. The REAL connection service used to
 * report that as 'disconnected', and the REAL ack handler then dropped the waiting
 * game start: no timeout, no "Starting", the silent failure again. Only the LiveKit
 * room and the toast host are stand-ins here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}));
vi.mock('../../src/ui/whisper.ui.js', () => ({ toast }));
vi.mock('../../src/services/spotify.service.js', () => ({
  spotifyService: { initialize: vi.fn(async () => false) },
}));

type Handler = (...args: unknown[]) => void;

/** The LiveKit room, as far as connection.service touches it, with the agent already in. */
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
    connect: vi.fn(async () => void (room.state = 'connected')),
    disconnect: vi.fn(async () => void (room.state = 'disconnected')),
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

const room = createRoom();
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
  json: async () => ({ token: 't', url: 'wss://lk.example', room: 'voice-1', username: 'Test' }),
})) as unknown as typeof fetch;

const { connectionService } = await import('../../src/services/connection.service.js');
const { appState } = await import('../../src/state/app.state.js');
const { GAME_ACK_TIMEOUT_MS, handleAgentAckMessage } =
  await import('../../src/app/agent-ack-handlers.js');

/** The picker's start event (game-picker.ui.ts startGame). */
const pickerTaps = (gameType: string): void =>
  void document.dispatchEvent(
    new CustomEvent('ferni:game-started', {
      detail: { gameId: gameType, gameType, gameName: 'Tic-Tac-Toe', awaitsAck: true },
    })
  );

/** livekit-client's signal resume: signalReconnecting, then connected again. */
function signalBlip(): void {
  room.emit('connectionStateChanged', 'signalReconnecting');
  expect(appState.get('connection')).toBe('reconnecting');
  vi.advanceTimersByTime(3_000);
  room.emit('connectionStateChanged', 'connected');
  expect(appState.get('connection')).toBe('connected');
}

beforeEach(async () => {
  await expect(connectionService.connect()).resolves.toBe(true);
  expect(appState.get('connection')).toBe('connected');
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(async () => {
  vi.useRealTimers();
  await connectionService.disconnect();
  toast.success.mockClear();
  toast.error.mockClear();
});

describe("Let's Play: a signal blip mid-wait", () => {
  it('no ack: the start still times out at 10 s, once', () => {
    pickerTaps('tic-tac-toe');
    vi.advanceTimersByTime(2_000);
    signalBlip(); // now at 5 s
    vi.advanceTimersByTime(GAME_ACK_TIMEOUT_MS - 5_000 - 1);
    expect(toast.error).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it('an ack after the blip still confirms the start', () => {
    pickerTaps('tic-tac-toe');
    vi.advanceTimersByTime(2_000);
    signalBlip();
    vi.advanceTimersByTime(3_000); // 8 s
    handleAgentAckMessage({ type: 'text_game_start_ack', gameType: 'tic-tac-toe', success: true });
    expect(toast.success).toHaveBeenCalledWith('Starting Tic-Tac-Toe...');
    vi.advanceTimersByTime(GAME_ACK_TIMEOUT_MS);
    expect(toast.error).not.toHaveBeenCalled();
  });
});

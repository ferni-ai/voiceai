/**
 * Agent-drop prompt (flag ferni:agent-drop-prompt). Prod 2026-10-13: the agent
 * session closed on an error and the caller sat alone on a silent line for 15+
 * minutes. The call now notices when Ferni's side ends with the caller still
 * here: on the server's agent_session_ended message, or when the agent leaves
 * and is not back within the handoff grace. Never on a hang-up or a goodbye.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AGENT_DROP_GRACE_MS,
  watchAgentDrop,
  type AgentDropRoom,
} from '../../../src/services/agent-drop-watch.js';
import { AGENT_DROP_PROMPT_FLAG_KEY } from '../../../src/config/agent-drop-prompt-flag.js';

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

type Handler = (...args: unknown[]) => void;
const AGENT = { identity: 'agent-1', isAgent: true, audioTrackPublications: new Map() };

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
    remoteParticipants: new Map<string, unknown>([['agent-1', AGENT]]),
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
    agentLeaves() {
      room.remoteParticipants.delete('agent-1');
      room.emit('participantDisconnected', AGENT);
    },
    agentReturns() {
      room.remoteParticipants.set('agent-1', AGENT);
      room.emit('participantConnected', AGENT);
    },
    send(message: Record<string, unknown>) {
      room.emit('dataReceived', new TextEncoder().encode(JSON.stringify(message)), AGENT);
    },
  };
  return room;
}

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe('watchAgentDrop', () => {
  function watch(overrides: { hangingUp?: boolean; enabled?: boolean } = {}) {
    const room = createRoom();
    room.state = 'connected';
    const onAgentLost = vi.fn();
    const stop = watchAgentDrop(room as unknown as AgentDropRoom, {
      userHangingUp: () => overrides.hangingUp ?? false,
      onAgentLost,
      enabled: () => overrides.enabled ?? true,
    });
    return { room, onAgentLost, stop };
  }

  beforeEach(() => vi.useFakeTimers());

  it('prompts at once when the agent says its session ended', () => {
    const { room, onAgentLost } = watch();
    room.send({ type: 'agent_session_ended', reason: 'error', recoverable: true });
    expect(onAgentLost).toHaveBeenCalledExactlyOnceWith('session_ended');
  });

  it('prompts when the agent leaves and is not back after the grace', () => {
    const { room, onAgentLost } = watch();
    room.agentLeaves();
    vi.advanceTimersByTime(AGENT_DROP_GRACE_MS - 1);
    expect(onAgentLost).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onAgentLost).toHaveBeenCalledExactlyOnceWith('agent_left');
  });

  it('does not prompt when an agent rejoins within the grace (agent swap)', () => {
    const { room, onAgentLost } = watch();
    room.agentLeaves();
    vi.advanceTimersByTime(AGENT_DROP_GRACE_MS / 2);
    room.agentReturns();
    vi.advanceTimersByTime(AGENT_DROP_GRACE_MS * 2);
    expect(onAgentLost).not.toHaveBeenCalled();
  });

  it('does not prompt while another agent is still in the room', () => {
    const { room, onAgentLost } = watch();
    room.remoteParticipants.set('agent-2', { identity: 'agent-2', isAgent: true });
    room.agentLeaves();
    vi.advanceTimersByTime(AGENT_DROP_GRACE_MS);
    expect(onAgentLost).not.toHaveBeenCalled();
  });

  it('ignores a caller-side participant leaving', () => {
    const { room, onAgentLost } = watch();
    room.emit('participantDisconnected', { identity: 'guest', isAgent: false });
    vi.advanceTimersByTime(AGENT_DROP_GRACE_MS);
    expect(onAgentLost).not.toHaveBeenCalled();
  });

  it('does not prompt when the user is hanging up', () => {
    const { room, onAgentLost } = watch({ hangingUp: true });
    room.agentLeaves();
    room.send({ type: 'agent_session_ended', reason: 'error' });
    vi.advanceTimersByTime(AGENT_DROP_GRACE_MS);
    expect(onAgentLost).not.toHaveBeenCalled();
  });

  it('does not prompt after a goodbye (conversation_end), when the agent leaves first', () => {
    const { room, onAgentLost } = watch();
    room.send({ type: 'conversation_end', reason: 'goodbye_complete' });
    room.agentLeaves();
    vi.advanceTimersByTime(AGENT_DROP_GRACE_MS);
    expect(onAgentLost).not.toHaveBeenCalled();
  });

  it('prompts only once', () => {
    const { room, onAgentLost } = watch();
    room.send({ type: 'agent_session_ended', reason: 'error' });
    room.agentLeaves();
    vi.advanceTimersByTime(AGENT_DROP_GRACE_MS);
    expect(onAgentLost).toHaveBeenCalledTimes(1);
  });

  it('listens to nothing while the flag is off', () => {
    const { room, onAgentLost } = watch({ enabled: false });
    expect(room.on).not.toHaveBeenCalled();
    room.send({ type: 'agent_session_ended', reason: 'error' });
    expect(onAgentLost).not.toHaveBeenCalled();
  });
});

// The real connection service: the watcher is wired into every call's room.
describe('connection service', () => {
  let room: ReturnType<typeof createRoom>;
  let service: typeof import('../../../src/services/connection.service.js').connectionService;

  async function connectedCall(flagOn = true) {
    vi.resetModules();
    if (flagOn) localStorage.setItem(AGENT_DROP_PROMPT_FLAG_KEY, 'true');
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
      json: async () => ({ token: 't', url: 'wss://lk.example', room: 'voice-1', username: 'u' }),
    })) as unknown as typeof fetch;
    service = (await import('../../../src/services/connection.service.js')).connectionService;
    const onAgentLost = vi.fn();
    service.setCallbacks({ onAgentLost });
    await expect(service.connect()).resolves.toBe(true);
    vi.useFakeTimers();
    return onAgentLost;
  }

  it('reports agent_left when the agent leaves a live call', async () => {
    const onAgentLost = await connectedCall();
    room.agentLeaves();
    vi.advanceTimersByTime(AGENT_DROP_GRACE_MS);
    expect(onAgentLost).toHaveBeenCalledExactlyOnceWith('agent_left');
  });

  it('reports session_ended from the data channel', async () => {
    const onAgentLost = await connectedCall();
    room.send({ type: 'agent_session_ended', reason: 'error', recoverable: true });
    expect(onAgentLost).toHaveBeenCalledExactlyOnceWith('session_ended');
  });

  it('reports nothing after the user hangs up', async () => {
    const onAgentLost = await connectedCall();
    await service.disconnect();
    room.agentLeaves();
    room.send({ type: 'agent_session_ended', reason: 'error' });
    vi.advanceTimersByTime(AGENT_DROP_GRACE_MS);
    expect(onAgentLost).not.toHaveBeenCalled();
  });

  it('reports nothing with the flag off', async () => {
    const onAgentLost = await connectedCall(false);
    room.agentLeaves();
    room.send({ type: 'agent_session_ended', reason: 'error' });
    vi.advanceTimersByTime(AGENT_DROP_GRACE_MS);
    expect(onAgentLost).not.toHaveBeenCalled();
  });
});

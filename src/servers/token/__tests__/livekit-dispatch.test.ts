/**
 * createRoomWithAgent must report whether the voice agent was actually dispatched.
 * The worker registers with an agent name, so a failed dispatch means silence.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const createRoom = vi.fn();
const createDispatch = vi.fn();

vi.mock('livekit-server-sdk', () => ({
  AccessToken: vi.fn(),
  // `function` (not arrow) so the SDK clients can be constructed with `new`.
  RoomServiceClient: vi.fn(function () {
    return { createRoom };
  }),
  AgentDispatchClient: vi.fn(function () {
    return { createDispatch };
  }),
}));

const logError = vi.fn();
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: logError }),
}));

const { createRoomWithAgent } = await import('../livekit.js');

const metadata = { persona_id: 'ferni', source: 'web' } as const;

describe('createRoomWithAgent', () => {
  beforeEach(() => {
    createRoom.mockReset().mockResolvedValue({});
    createDispatch.mockReset().mockResolvedValue({});
    logError.mockReset();
  });

  it('reports a dispatched agent when the dispatch call succeeds', async () => {
    const result = await createRoomWithAgent('voice-1', metadata);

    expect(result).toEqual({ roomReady: true, agentDispatched: true });
    expect(createDispatch).toHaveBeenCalledWith('voice-1', expect.any(String), {
      metadata: JSON.stringify(metadata),
    });
  });

  it('reports agentDispatched=false and logs at error when dispatch throws', async () => {
    createDispatch.mockRejectedValue(new Error('no workers available'));

    const result = await createRoomWithAgent('voice-2', metadata);

    expect(result).toEqual({ roomReady: true, agentDispatched: false });
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'no workers available', roomName: 'voice-2' }),
      'Agent dispatch failed'
    );
  });

  it('still dispatches the agent when the room already exists', async () => {
    createRoom.mockRejectedValue(new Error('room already exists'));

    const result = await createRoomWithAgent('voice-3', metadata);

    expect(result).toEqual({ roomReady: true, agentDispatched: true });
    expect(createDispatch).toHaveBeenCalledOnce();
  });

  it('reports neither room nor agent when room creation fails', async () => {
    createRoom.mockRejectedValue(new Error('permission denied'));

    const result = await createRoomWithAgent('voice-4', metadata);

    expect(result).toEqual({ roomReady: false, agentDispatched: false });
    expect(createDispatch).not.toHaveBeenCalled();
  });
});

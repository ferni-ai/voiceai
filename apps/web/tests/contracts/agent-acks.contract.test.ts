/**
 * The agent's real failure acks reach the app: agent → web.
 *
 * The voice agent's REAL data-channel handler (src/agents/voice-agent/data-channel-handler.ts)
 * gets a request it cannot honour, publishes its `*_ack` with `success: false`, and
 * that message is JSON round-tripped as LiveKit delivers it into the web's REAL
 * data-message handler. Before, the app ignored every one of these acks.
 */
import { initializeLogger } from '@livekit/agents';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const toastErrors = vi.hoisted(() => [] as string[]);
vi.mock('../../src/ui/whisper.ui.js', () => ({
  toast: {
    error: (message: string) => toastErrors.push(message),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

import {
  setupDataChannelHandler,
  type DataChannelContext,
} from '../../../../src/agents/voice-agent/data-channel-handler.js';

import { handleDataMessage } from '../../src/app/data-message-handlers.js';
import type { DataMessage } from '../../src/types/events.js';

/** Send `request` to the real agent handler; return what the agent publishes back. */
async function askAgent(request: Record<string, unknown>): Promise<DataMessage[]> {
  const published: DataMessage[] = [];
  const room = {
    on: vi.fn(),
    off: vi.fn(),
    localParticipant: {
      identity: 'agent',
      publishData: async (bytes: Uint8Array) =>
        void published.push(JSON.parse(new TextDecoder().decode(bytes)) as DataMessage),
    },
  };
  const { handler, cleanup } = setupDataChannelHandler({
    room,
    session: undefined,
    services: {},
    sessionPersona: { id: 'ferni' },
    userId: 'user-1',
    sessionId: 'call-1',
  } as unknown as DataChannelContext);
  handler(new TextEncoder().encode(JSON.stringify(request)), { identity: 'user' });
  await vi.waitFor(() => expect(published.length).toBeGreaterThan(0), { timeout: 5000 });
  cleanup();
  return published;
}

beforeAll(() => initializeLogger({ pretty: false, level: 'silent' }));

beforeEach(() => {
  toastErrors.length = 0;
});

afterEach(() => vi.restoreAllMocks());

describe('the agent could not do what the app asked', () => {
  it('an action the agent cannot find: the app says it did not go through', async () => {
    const acks = await askAgent({ type: 'action_response', actionId: 'gone', approved: true });

    expect(acks).toEqual([
      expect.objectContaining({ type: 'action_response_ack', actionId: 'gone', success: false }),
    ]);
    acks.forEach((ack) => handleDataMessage(ack));
    expect(toastErrors).toEqual([
      "That didn't go through. It may already have been taken care of.",
    ]);
  });

  it('a game the engine cannot start: the app says it did not start', async () => {
    const acks = await askAgent({ type: 'game_start_request', gameType: 'no-such-game' });

    expect(acks).toEqual([
      expect.objectContaining({ type: 'game_start_ack', gameType: 'no-such-game', success: false }),
    ]);
    acks.forEach((ack) => handleDataMessage(ack));
    expect(toastErrors).toEqual(["That game didn't start. Try asking Ferni to play it out loud."]);
  });
});

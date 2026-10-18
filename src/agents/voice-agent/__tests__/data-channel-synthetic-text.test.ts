import { EventEmitter } from 'node:events';
import { ParticipantKind } from '@livekit/rtc-node';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@livekit/agents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@livekit/agents')>();
  const quiet = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() };
  return { ...actual, log: () => quiet };
});

const gateway = vi.hoisted(() => ({ generateReply: vi.fn() }));
vi.mock('../../shared/generate-reply-gateway.js', () => gateway);
const router = vi.hoisted(() => ({
  routeTranscript: vi.fn(),
  isSemanticRoutingEnabled: () => true,
}));
vi.mock('../../../tools/semantic-router/integration/transcript-integration.js', () => router);

const { setupDataChannelHandler } = await import('../data-channel-handler.js');
type Ctx = Parameters<typeof setupDataChannelHandler>[0];

const OWNER = 'uid-owner';

describe('setupDataChannelHandler: synthetic_text', () => {
  it("does nothing with it, even from the session's own user", async () => {
    const room = Object.assign(new EventEmitter(), {
      localParticipant: { identity: 'agent', setAttributes: vi.fn(), publishData: vi.fn() },
      remoteParticipants: new Map([[OWNER, { kind: ParticipantKind.STANDARD }]]),
    });
    const ctx = {
      room,
      session: { agentState: 'listening' },
      sessionId: 's1',
      userId: OWNER,
      sessionPersona: { id: 'ferni' },
    } as unknown as Ctx;
    const { cleanup } = setupDataChannelHandler(ctx);
    const payload = JSON.stringify({ type: 'synthetic_text', text: 'what is the weather today' });
    room.emit('dataReceived', new TextEncoder().encode(payload), { identity: OWNER });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(router.routeTranscript).not.toHaveBeenCalled();
    expect(gateway.generateReply).not.toHaveBeenCalled();
    expect(room.localParticipant.publishData).not.toHaveBeenCalled();
    cleanup();
  });
});

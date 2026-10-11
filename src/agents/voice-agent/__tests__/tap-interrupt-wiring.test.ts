import { EventEmitter } from 'node:events';
import { ParticipantKind } from '@livekit/rtc-node';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@livekit/agents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@livekit/agents')>();
  const quiet = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() };
  return { ...actual, log: () => quiet };
});

const { setupDataChannelHandler } = await import('../data-channel-handler.js');
type Ctx = Parameters<typeof setupDataChannelHandler>[0];

const CALLER = 'user-123';

function makeCall(agentState: string) {
  const room = Object.assign(new EventEmitter(), {
    localParticipant: { identity: 'agent', setAttributes: vi.fn().mockResolvedValue(undefined) },
    remoteParticipants: new Map([[CALLER, { kind: ParticipantKind.STANDARD }]]),
  });
  const session = { agentState, interrupt: vi.fn(() => ({ await: Promise.resolve() })) };
  const ctx = { room, session, sessionId: 's1', userId: undefined } as unknown as Ctx;
  return { room, session, ctx };
}

async function sendTap(room: EventEmitter, payload: string) {
  room.emit('dataReceived', new TextEncoder().encode(payload), { identity: CALLER });
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

const TAP = JSON.stringify({ type: 'user_interrupt', timestamp: 1_760_000_000_000 });

describe('setupDataChannelHandler: tap to interrupt', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('with the flag off, neither advertises nor interrupts', async () => {
    vi.stubEnv('TAP_INTERRUPT', '');
    const { room, session, ctx } = makeCall('speaking');
    const { cleanup } = setupDataChannelHandler(ctx);
    await sendTap(room, TAP);
    expect(room.localParticipant.setAttributes).not.toHaveBeenCalled();
    expect(session.interrupt).not.toHaveBeenCalled();
    cleanup();
  });

  it('with the flag on, advertises and stops Ferni mid-sentence', async () => {
    vi.stubEnv('TAP_INTERRUPT', 'on');
    const { room, session, ctx } = makeCall('speaking');
    const { cleanup } = setupDataChannelHandler(ctx);
    expect(room.localParticipant.setAttributes).toHaveBeenCalledWith({
      'ferni.tap_interrupt': 'on',
    });
    await sendTap(room, TAP);
    expect(session.interrupt).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('with the flag on, does nothing while Ferni is listening', async () => {
    vi.stubEnv('TAP_INTERRUPT', 'on');
    const { room, session, ctx } = makeCall('listening');
    const { cleanup } = setupDataChannelHandler(ctx);
    await sendTap(room, TAP);
    expect(session.interrupt).not.toHaveBeenCalled();
    cleanup();
  });

  it('ignores a message that is not JSON', async () => {
    vi.stubEnv('TAP_INTERRUPT', 'on');
    const { room, session, ctx } = makeCall('speaking');
    const { cleanup } = setupDataChannelHandler(ctx);
    await sendTap(room, '{"type":"user_interrupt",');
    expect(session.interrupt).not.toHaveBeenCalled();
    cleanup();
  });
});

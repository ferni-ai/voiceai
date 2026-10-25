/**
 * The app's `{ type: 'user_interrupt' }` data message, through the real data
 * channel handler: from the human in the room it stops Ferni's speech; from
 * another agent, with the flag off, or while he is quiet, it does nothing.
 */
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

const HUMAN = 'uid-owner';
const TEAMMATE = 'agent-maya';

function call(agentState: string) {
  const interrupt = vi.fn(() => ({ await: Promise.resolve() }));
  const room = Object.assign(new EventEmitter(), {
    localParticipant: {
      identity: 'agent',
      setAttributes: vi.fn(async () => {}),
      publishData: vi.fn(),
    },
    remoteParticipants: new Map([
      [HUMAN, { kind: ParticipantKind.STANDARD }],
      [TEAMMATE, { kind: ParticipantKind.AGENT }],
    ]),
  });
  const ctx = {
    room,
    session: { agentState, interrupt },
    sessionId: 's1',
    userId: HUMAN,
    sessionPersona: { id: 'ferni' },
  } as unknown as Ctx;
  const { cleanup } = setupDataChannelHandler(ctx);
  const send = async (from: string, message: object) => {
    room.emit('dataReceived', new TextEncoder().encode(JSON.stringify(message)), {
      identity: from,
    });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  };
  return { room, interrupt, send, cleanup };
}

afterEach(() => vi.unstubAllEnvs());

describe('setupDataChannelHandler: user_interrupt', () => {
  it('stops Ferni when the human in the room sends it while he is speaking', async () => {
    vi.stubEnv('TAP_INTERRUPT', 'on');
    const c = call('speaking');
    await c.send(HUMAN, { type: 'user_interrupt' });
    expect(c.interrupt).toHaveBeenCalledTimes(1);
    c.cleanup();
  });

  it('advertises the button only with the flag on', () => {
    const off = call('speaking');
    expect(off.room.localParticipant.setAttributes).not.toHaveBeenCalled();
    off.cleanup();
    vi.stubEnv('TAP_INTERRUPT', 'on');
    const on = call('speaking');
    expect(on.room.localParticipant.setAttributes).toHaveBeenCalledWith({
      'ferni.tap_interrupt': 'on',
    });
    on.cleanup();
  });

  it.each([
    ['another agent sends it', TEAMMATE, 'speaking', 'on'],
    ['the flag is off', HUMAN, 'speaking', 'off'],
    ['Ferni is not speaking', HUMAN, 'listening', 'on'],
  ])('does nothing when %s', async (_label, sender, state, flag) => {
    vi.stubEnv('TAP_INTERRUPT', flag);
    const c = call(state);
    await c.send(sender, { type: 'user_interrupt' });
    expect(c.interrupt).not.toHaveBeenCalled();
    c.cleanup();
  });
});

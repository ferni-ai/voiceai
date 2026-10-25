/**
 * Let's Play requests through the real data channel handler and the real game
 * engines: an id the text engine doesn't know is a failed start (it used to be
 * acked `success: true` with "I don't know that game"), and every ack carries
 * back the request id the app sent, or none for an app that sends none.
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
const games = await import('../../../services/games/index.js');
type Ctx = Parameters<typeof setupDataChannelHandler>[0];

const HUMAN = 'uid-owner';
const cleanups: Array<() => void> = [];

/** A call with no voice session (nothing is spoken); returns the acks the agent publishes. */
function call(sessionId: string) {
  const acks: Array<Record<string, unknown>> = [];
  const room = Object.assign(new EventEmitter(), {
    localParticipant: {
      identity: 'agent',
      setAttributes: vi.fn(async () => {}),
      publishData: vi.fn(async (bytes: Uint8Array) => {
        acks.push(JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>);
      }),
    },
    remoteParticipants: new Map([[HUMAN, { kind: ParticipantKind.STANDARD }]]),
  });
  const ctx = { room, sessionId, userId: HUMAN, sessionPersona: { id: 'ferni' } } as unknown as Ctx;
  const { cleanup } = setupDataChannelHandler(ctx);
  cleanups.push(cleanup);
  const send = async (message: object): Promise<Record<string, unknown>> => {
    const before = acks.length;
    room.emit('dataReceived', new TextEncoder().encode(JSON.stringify(message)), {
      identity: HUMAN,
    });
    await vi.waitFor(() => expect(acks.length).toBe(before + 1));
    return acks[before] as Record<string, unknown>;
  };
  return { send };
}

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
});

describe('text_game_start_request', () => {
  it('an unknown game is a failed start, with its reason and the request id', async () => {
    const { send } = call('s-unknown');
    const ack = await send({
      type: 'text_game_start_request',
      gameType: 'no-such-game',
      requestId: 'r1',
    });
    expect(ack).toMatchObject({
      type: 'text_game_start_ack',
      gameType: 'no-such-game',
      requestId: 'r1',
      success: false,
      reason: 'unknown_game',
    });
    expect(ack).not.toHaveProperty('message');
  });

  it.each(['constructor', '__proto__', 'toString'])(
    'an id named like a built-in (%s) is unknown too',
    async (gameType) => {
      const { send } = call(`s-${gameType}`);
      const ack = await send({ type: 'text_game_start_request', gameType });
      expect(ack).toMatchObject({ success: false, reason: 'unknown_game' });
    }
  );

  it('an unknown game does not end the game that is on', async () => {
    const { send } = call('s-keep');
    expect(await send({ type: 'text_game_start_request', gameType: 'tic-tac-toe' })).toMatchObject({
      success: true,
    });
    await send({ type: 'text_game_start_request', gameType: 'no-such-game' });
    expect(games.getSessionTextGameEngine('s-keep').getCurrentGameType()).toBe('tic-tac-toe');
  });

  it('a known game starts, and its ack echoes the request id', async () => {
    const { send } = call('s-known');
    const ack = await send({
      type: 'text_game_start_request',
      gameType: 'fortune-cookie',
      requestId: 'r2',
    });
    expect(ack).toMatchObject({ success: true, requestId: 'r2', gameType: 'fortune-cookie' });
    expect(typeof ack['message']).toBe('string');
  });

  it('an app that sends no request id gets an ack without one', async () => {
    const { send } = call('s-old-app');
    const ack = await send({ type: 'text_game_start_request', gameType: 'tic-tac-toe' });
    expect(ack).toMatchObject({ success: true });
    expect(ack).not.toHaveProperty('requestId');
  });

  it('a request id that is not a short string is not echoed', async () => {
    const { send } = call('s-odd-id');
    const ack = await send({
      type: 'text_game_start_request',
      gameType: 'tic-tac-toe',
      requestId: 'x'.repeat(65),
    });
    expect(ack).not.toHaveProperty('requestId');
  });
});

describe('game_start_request', () => {
  it('an unknown music game fails with a reason and echoes the request id', async () => {
    const { send } = call('s-music-unknown');
    const ack = await send({
      type: 'game_start_request',
      gameType: 'no-such-game',
      requestId: 'm1',
    });
    expect(ack).toMatchObject({
      type: 'game_start_ack',
      requestId: 'm1',
      success: false,
      reason: 'start_failed',
    });
  });
});

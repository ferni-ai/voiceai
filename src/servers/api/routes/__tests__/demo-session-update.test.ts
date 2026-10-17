/**
 * POST /demo-session-update used to take only a room_name, so anyone could
 * overwrite any demo's conversation. A write now needs that demo's claim_token.
 */

import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../api/auth-middleware.js', () => ({ rateLimit: () => false }));
const getDemoSession = vi.fn();
const updateDemoSessionConversation = vi.fn();
vi.mock('../../services/demo-sessions.js', () => ({
  getDemoSession,
  updateDemoSessionConversation,
}));

const { handleDemoSessionUpdate } = await import('../demo-session-update.js');

const ROOM = 'demo-demo_1_abc';
const CLAIM = 'a'.repeat(32);
const conversation = { highlights: ['forged'] };

async function post(payload: unknown, rawBody?: string): Promise<number> {
  const emitter = new EventEmitter();
  const req = Object.assign(emitter, {
    method: 'POST',
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
  }) as unknown as IncomingMessage;
  let status = 0;
  const fake = {
    headersSent: false,
    writableEnded: false,
    writeHead(code: number): void {
      status = code;
      fake.headersSent = true;
    },
    end(): void {
      fake.writableEnded = true;
    },
  };
  const done = handleDemoSessionUpdate(req, fake as unknown as ServerResponse);
  emitter.emit('data', Buffer.from(rawBody ?? JSON.stringify(payload)));
  emitter.emit('end');
  await done;
  return status;
}

describe('POST /demo-session-update needs the demo claim token', () => {
  beforeEach(() => {
    getDemoSession.mockReset();
    updateDemoSessionConversation.mockReset();
    getDemoSession.mockResolvedValue({ roomName: ROOM, claimToken: CLAIM, claimed: false });
    updateDemoSessionConversation.mockResolvedValue(true);
  });

  it('answers 401 and writes nothing without a claim_token', async () => {
    expect(await post({ room_name: ROOM, conversation })).toBe(401);
    expect(updateDemoSessionConversation).not.toHaveBeenCalled();
  });

  it('answers 403 and writes nothing with the wrong claim_token', async () => {
    expect(await post({ room_name: ROOM, conversation, claim_token: 'b'.repeat(32) })).toBe(403);
    expect(await post({ room_name: ROOM, conversation, claim_token: 'short' })).toBe(403);
    expect(updateDemoSessionConversation).not.toHaveBeenCalled();
  });

  it('answers 403 for an unknown room, the same as a wrong token', async () => {
    getDemoSession.mockResolvedValue(null);
    expect(await post({ room_name: 'demo-nope', conversation, claim_token: CLAIM })).toBe(403);
    expect(updateDemoSessionConversation).not.toHaveBeenCalled();
  });

  it('answers 409 once the demo has been claimed', async () => {
    getDemoSession.mockResolvedValue({ roomName: ROOM, claimToken: CLAIM, claimed: true });
    expect(await post({ room_name: ROOM, conversation, claim_token: CLAIM })).toBe(409);
    expect(updateDemoSessionConversation).not.toHaveBeenCalled();
  });

  it('writes the conversation with the matching claim_token', async () => {
    expect(await post({ room_name: ROOM, conversation, claim_token: CLAIM })).toBe(200);
    expect(updateDemoSessionConversation).toHaveBeenCalledWith(ROOM, conversation);
  });

  it('answers 400 for a body that is not a conversation', async () => {
    expect(await post(undefined, 'not json')).toBe(400);
    expect(await post({ room_name: ROOM, conversation: 'x', claim_token: CLAIM })).toBe(400);
    expect(updateDemoSessionConversation).not.toHaveBeenCalled();
  });
});

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

const { handleDemoSessionUpdate, claimTokenMatches } = await import('../demo-session-update.js');

const ROOM = 'demo-demo_1_abc';
const CLAIM = 'a'.repeat(32);
const conversation = { highlights: ['forged'] };

interface Sent {
  statuses: number[];
  destroyed: boolean;
}

/** Send `chunks` as the body and report every status written. */
async function send(chunks: Buffer[]): Promise<Sent> {
  const emitter = new EventEmitter();
  const sent: Sent = { statuses: [], destroyed: false };
  const req = Object.assign(emitter, {
    method: 'POST',
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
    destroy: (): void => {
      sent.destroyed = true;
    },
  }) as unknown as IncomingMessage;
  const fake = {
    headersSent: false,
    writableEnded: false,
    writeHead(code: number): void {
      sent.statuses.push(code);
      fake.headersSent = true;
    },
    end(): void {
      fake.writableEnded = true;
    },
  };
  const done = handleDemoSessionUpdate(req, fake as unknown as ServerResponse);
  for (const chunk of chunks) emitter.emit('data', chunk);
  if (!sent.destroyed) emitter.emit('end');
  await done;
  return sent;
}

async function post(payload: unknown, rawBody?: string): Promise<number> {
  const { statuses } = await send([Buffer.from(rawBody ?? JSON.stringify(payload))]);
  return statuses[0] ?? 0;
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

  it('answers 413 once and stops reading when the body is over 256 KB', async () => {
    // Multi-byte characters: 100k of them is ~300 KB though the string is 100k long
    const big = Buffer.from(
      JSON.stringify({ room_name: ROOM, claim_token: CLAIM, x: '€'.repeat(100_000) })
    );
    const half = Math.ceil(big.length / 2);
    const sent = await send([big.subarray(0, half), big.subarray(half), Buffer.from('more')]);
    expect(sent.statuses).toEqual([413]);
    expect(sent.destroyed).toBe(true);
    expect(getDemoSession).not.toHaveBeenCalled();
    expect(updateDemoSessionConversation).not.toHaveBeenCalled();
  });

  it('answers 403 when the stored session has no usable claim token', async () => {
    getDemoSession.mockResolvedValue({ roomName: ROOM, claimToken: undefined, claimed: false });
    expect(await post({ room_name: ROOM, conversation, claim_token: CLAIM })).toBe(403);
    expect(updateDemoSessionConversation).not.toHaveBeenCalled();
  });
});

describe('claimTokenMatches', () => {
  it('is false for a missing, empty or non-string stored token', () => {
    expect(claimTokenMatches(CLAIM, undefined)).toBe(false);
    expect(claimTokenMatches(CLAIM, null)).toBe(false);
    expect(claimTokenMatches(CLAIM, 42)).toBe(false);
    expect(claimTokenMatches('', '')).toBe(false);
  });

  it('is true only for the same token', () => {
    expect(claimTokenMatches(CLAIM, CLAIM)).toBe(true);
    expect(claimTokenMatches(CLAIM, 'b'.repeat(32))).toBe(false);
  });
});

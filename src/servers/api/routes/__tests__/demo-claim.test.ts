/**
 * POST /demo-claim attaches a demo conversation to the account in the verified
 * Firebase ID token. The body's firebase_uid used to be trusted, so anyone
 * holding a claim token could attach the conversation to any account.
 */

import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../api/auth-middleware.js', () => ({ rateLimit: () => false }));
const verifyFirebaseToken = vi.fn();
vi.mock('../../../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken,
  isVerifiedToken: (r: unknown) => r !== null && typeof r === 'object' && !('expired' in r),
}));
const claimDemoSession = vi.fn();
vi.mock('../../services/demo-sessions.js', () => ({ claimDemoSession }));

const { handleDemoClaim } = await import('../demo-claim.js');

interface Reply {
  status: number;
  body: Record<string, unknown>;
}

async function postClaim(payload: unknown, authorization?: string): Promise<Reply> {
  const emitter = new EventEmitter();
  const req = Object.assign(emitter, {
    method: 'POST',
    headers: authorization ? { authorization } : {},
    socket: { remoteAddress: '127.0.0.1' },
  }) as unknown as IncomingMessage;
  const reply: Reply = { status: 0, body: {} };
  const fake = {
    headersSent: false,
    writableEnded: false,
    writeHead(code: number): void {
      reply.status = code;
      fake.headersSent = true;
    },
    end(text?: string): void {
      if (text) reply.body = JSON.parse(text) as Record<string, unknown>;
      fake.writableEnded = true;
    },
  };
  const res = fake as unknown as ServerResponse;

  const done = handleDemoClaim(req, res);
  emitter.emit('data', Buffer.from(JSON.stringify(payload)));
  emitter.emit('end');
  await done;
  return reply;
}

describe('POST /demo-claim takes the account from the verified token', () => {
  beforeEach(() => {
    verifyFirebaseToken.mockReset();
    claimDemoSession.mockReset();
    claimDemoSession.mockResolvedValue({
      success: true,
      alreadyClaimed: false,
      session: { conversation: { highlights: ['h'] } },
    });
  });

  it('answers 401 when no ID token is sent', async () => {
    const reply = await postClaim({ claim_token: 'ct', firebase_uid: 'victim' });
    expect(reply.status).toBe(401);
    expect(verifyFirebaseToken).not.toHaveBeenCalled();
    expect(claimDemoSession).not.toHaveBeenCalled();
  });

  it('answers 401 when the ID token is invalid', async () => {
    verifyFirebaseToken.mockResolvedValue(null);
    const reply = await postClaim({ claim_token: 'ct' }, 'Bearer forged');
    expect(reply.status).toBe(401);
    expect(verifyFirebaseToken).toHaveBeenCalledWith('forged');
    expect(claimDemoSession).not.toHaveBeenCalled();
  });

  it('answers 401 when the ID token has expired', async () => {
    verifyFirebaseToken.mockResolvedValue({ expired: true });
    const reply = await postClaim({ claim_token: 'ct' }, 'Bearer old');
    expect(reply.status).toBe(401);
    expect(claimDemoSession).not.toHaveBeenCalled();
  });

  it('claims for the verified uid', async () => {
    verifyFirebaseToken.mockResolvedValue({ uid: 'uid-real', claims: {} });
    const reply = await postClaim({ claim_token: 'ct' }, 'Bearer good');
    expect(reply.status).toBe(200);
    expect(reply.body.success).toBe(true);
    expect(claimDemoSession).toHaveBeenCalledWith('ct', 'uid-real');
  });

  it('accepts a body uid equal to the verified uid', async () => {
    verifyFirebaseToken.mockResolvedValue({ uid: 'uid-real', claims: {} });
    const reply = await postClaim({ claim_token: 'ct', firebase_uid: 'uid-real' }, 'Bearer good');
    expect(reply.status).toBe(200);
    expect(claimDemoSession).toHaveBeenCalledWith('ct', 'uid-real');
  });

  it('refuses a body uid that differs from the verified uid and never claims for it', async () => {
    verifyFirebaseToken.mockResolvedValue({ uid: 'uid-real', claims: {} });
    const reply = await postClaim({ claim_token: 'ct', firebase_uid: 'victim' }, 'Bearer good');
    expect(reply.status).toBe(403);
    expect(claimDemoSession).not.toHaveBeenCalled();
  });

  it('answers 503 when the verifier is unavailable', async () => {
    verifyFirebaseToken.mockRejectedValue(new Error('Authentication service unavailable'));
    const reply = await postClaim({ claim_token: 'ct' }, 'Bearer good');
    expect(reply.status).toBe(503);
    expect(claimDemoSession).not.toHaveBeenCalled();
  });

  it('answers 400 without a claim token', async () => {
    verifyFirebaseToken.mockResolvedValue({ uid: 'uid-real', claims: {} });
    const reply = await postClaim({}, 'Bearer good');
    expect(reply.status).toBe(400);
    expect(claimDemoSession).not.toHaveBeenCalled();
  });
});

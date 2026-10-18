/**
 * POST /api/auth/revoke revokes only the verified caller's refresh tokens.
 *
 * `ferni auth logout` called this route for months while no server had it
 * (#2127). Requests go through the /api/auth/* router the API server uses,
 * with the real auth middleware; only token verification, the revoke call
 * and rate limiting are faked.
 */
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// "tok-<name>" verifies as uid-<name> padded to a real uid's length.
const uidOf = (name: string) => `uid-${name}`.padEnd(28, '0');
const revokeRefreshTokens = vi.fn(async (_uid: string) => true);
vi.mock('../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token.startsWith('tok-')
      ? { uid: uidOf(token.slice(4)), email: `${token.slice(4)}@example.com`, claims: {} }
      : null
  ),
  isVerifiedToken: (r: unknown) => r !== null && typeof r === 'object',
  claimsFirebaseIssuer: () => true,
  revokeRefreshTokens: (uid: string) => revokeRefreshTokens(uid),
}));
vi.mock('../auth-middleware.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../auth-middleware.js')>()),
  rateLimit: () => false,
}));

const { handleAuthMonitoringRoutes } = await import('../auth-monitoring-routes.js');

async function revoke(
  body: Record<string, unknown>,
  token?: string,
  method = 'POST'
): Promise<{ handled: boolean; status: number; body: Record<string, unknown> }> {
  const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), {
    url: '/api/auth/revoke',
    method,
    headers: {
      host: 'localhost',
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    socket: { remoteAddress: '127.0.0.1' },
  });
  let status = 0;
  let text = '';
  const res = {
    statusCode: 200,
    writableEnded: false,
    headersSent: false,
    writeHead(s: number) {
      status = s;
      return this;
    },
    setHeader: () => {},
    end(b?: string) {
      text = b ?? '';
    },
  };
  const handled = await handleAuthMonitoringRoutes(
    req as unknown as IncomingMessage,
    res as unknown as ServerResponse,
    '/api/auth/revoke'
  );
  return { handled, status: status || res.statusCode, body: text ? JSON.parse(text) : {} };
}

describe('POST /api/auth/revoke', () => {
  beforeEach(() => {
    revokeRefreshTokens.mockClear();
    revokeRefreshTokens.mockImplementation(async () => true);
  });

  it('refuses a request with no token and revokes nothing', async () => {
    const { handled, status } = await revoke({ uid: uidOf('bob') });
    expect(handled).toBe(true);
    expect(status).toBe(401);
    expect(revokeRefreshTokens).not.toHaveBeenCalled();
  });

  it("revokes exactly the caller's own uid", async () => {
    const { status, body } = await revoke({}, 'tok-alice');
    expect(status).toBe(200);
    expect(body).toEqual({ revoked: true });
    expect(revokeRefreshTokens).toHaveBeenCalledTimes(1);
    expect(revokeRefreshTokens).toHaveBeenCalledWith(uidOf('alice'));
  });

  it('ignores a uid in the body', async () => {
    const victim = uidOf('bob');
    const { status } = await revoke(
      { uid: victim, firebaseUid: victim, userId: victim },
      'tok-mallory'
    );
    expect(status).toBe(200);
    expect(revokeRefreshTokens.mock.calls).toEqual([[uidOf('mallory')]]);
  });

  it('says so when Firebase cannot revoke', async () => {
    revokeRefreshTokens.mockImplementation(async () => false);
    const { status } = await revoke({}, 'tok-alice');
    expect(status).toBe(502);
  });

  it('leaves other methods to the rest of the router', async () => {
    const { handled } = await revoke({}, 'tok-alice', 'GET');
    expect(handled).toBe(false);
    expect(revokeRefreshTokens).not.toHaveBeenCalled();
  });
});

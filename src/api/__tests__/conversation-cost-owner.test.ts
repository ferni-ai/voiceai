/**
 * GET /api/conversation/cost answers only the signed-in caller, about their own sessions.
 *
 * It had no auth and took whose costs to return from ?userId= or ?user_id=.
 * The request-identity door rewrites ?userId= in production but not
 * ?user_id=, so anyone could read anyone's latest session (id, duration,
 * cost breakdown), and any session by ?sessionId=. The real auth middleware
 * runs; token verification, rate limiting and the cost ledger are faked.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { describe, expect, it, vi } from 'vitest';

const { sessions } = vi.hoisted(() => {
  const session = (sessionId: string, userId?: string) => ({
    sessionId,
    userId,
    startTime: 1,
    durationMinutes: 12,
    totalCost: 0.04,
    trueCost: 0.1,
    costs: { llm: 0.01, tts: 0.01, stt: 0.01, livekit: 0.005, infra: 0.005 },
  });
  return {
    sessions: [session('s-alice', 'uid-alice'), session('s-bob', 'uid-bob'), session('s-nobody')],
  };
});

// "tok-<name>" verifies as uid-<name>
vi.mock('../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token.startsWith('tok-') ? { uid: `uid-${token.slice(4)}`, claims: {} } : null
  ),
  isVerifiedToken: (r: unknown) => r !== null && typeof r === 'object',
  claimsFirebaseIssuer: () => true,
}));
vi.mock('../../services/observability/finops.js', () => ({
  finops: {
    getSessionCost: (id: string) => sessions.find((s) => s.sessionId === id) ?? null,
    getSessionCostByUserId: (uid: string) => sessions.find((s) => s.userId === uid) ?? null,
  },
}));
vi.mock('../auth-middleware.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../auth-middleware.js')>()),
  rateLimit: () => false,
}));

const { handleConversationCostRoutes } = await import('../conversation-cost-routes.js');

async function getCost(
  query: string,
  token?: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  const url = new URL(`http://localhost/api/conversation/cost${query}`);
  const req = {
    method: 'GET',
    url: `${url.pathname}${url.search}`,
    headers: { host: 'localhost', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    socket: { remoteAddress: '127.0.0.1' },
  };
  let status = 200;
  let raw = '';
  const res = {
    writableEnded: false,
    headersSent: false,
    statusCode: 200,
    setHeader: () => {},
    writeHead(code: number) {
      status = code;
      return this;
    },
    end(chunk?: string) {
      raw = chunk ?? '';
    },
  };
  await handleConversationCostRoutes(
    req as unknown as IncomingMessage,
    res as unknown as ServerResponse,
    url.pathname,
    url
  );
  return { status, body: raw ? (JSON.parse(raw) as Record<string, unknown>) : {} };
}

describe('conversation cost is the caller’s own', () => {
  it('refuses a request with no token, even naming a user by user_id', async () => {
    expect((await getCost('?user_id=uid-bob')).status).toBe(401);
    expect((await getCost('?userId=uid-bob')).status).toBe(401);
  });

  it('gives alice her own latest session, never the one her query names', async () => {
    const { status, body } = await getCost('?user_id=uid-bob', 'tok-alice');
    expect(status).toBe(200);
    expect(body['sessionId']).toBe('s-alice');
  });

  it("answers 404 for someone else's session id", async () => {
    expect((await getCost('?sessionId=s-bob', 'tok-alice')).status).toBe(404);
    expect((await getCost('?sessionId=s-nobody', 'tok-alice')).status).toBe(404);
  });

  it('serves the owner their own session by id', async () => {
    const { status, body } = await getCost('?sessionId=s-alice', 'tok-alice');
    expect(status).toBe(200);
    expect(body['sessionId']).toBe('s-alice');
  });
});

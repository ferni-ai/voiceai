/**
 * Journal chronicle and twin replies answer only a signed-in caller, about themselves.
 *
 * GET /api/journal/chronicle took whose chronicle to return from ?userId= with
 * no auth, and POST /api/journal/twin-response needed no auth at all. The real
 * auth middleware runs; token verification, rate limiting and the journal
 * store are faked.
 */
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getAllEntries } = vi.hoisted(() => ({
  getAllEntries: vi.fn(async (_uid: string) => [
    { id: 'e1', content: 'a private entry', createdAt: new Date(), themes: [] },
  ]),
}));

// "tok-<name>" verifies as uid-<name>
vi.mock('../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token.startsWith('tok-') ? { uid: `uid-${token.slice(4)}`, claims: {} } : null
  ),
  isVerifiedToken: (r: unknown) => r !== null && typeof r === 'object',
  claimsFirebaseIssuer: () => true,
}));
vi.mock('../../services/journal/index.js', () => ({
  getJournalService: () => ({
    getAllEntries,
    getStats: async () => ({ totalEntries: 1, currentStreak: 0, entriesThisWeek: 1 }),
  }),
}));
vi.mock('../auth-middleware.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../auth-middleware.js')>()),
  rateLimit: () => false,
}));

const { handleJournalRoutes } = await import('../journal-routes.js');

async function call(
  method: 'GET' | 'POST',
  url: string,
  token?: string,
  body?: unknown
): Promise<number> {
  const req = Object.assign(Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []), {
    url,
    method,
    headers: {
      host: 'localhost',
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    socket: { remoteAddress: '127.0.0.1' },
  });
  let status = 0;
  const res = {
    statusCode: 200,
    writableEnded: false,
    headersSent: false,
    writeHead(code: number) {
      status = code;
      return this;
    },
    setHeader: () => {},
    end: () => {},
  };
  await handleJournalRoutes(
    req as unknown as IncomingMessage,
    res as unknown as ServerResponse,
    new URL(url, 'http://localhost').pathname
  );
  return status || res.statusCode;
}

describe('journal routes act only for the verified caller', () => {
  beforeEach(() => getAllEntries.mockClear());

  it("refuses a chronicle request with no token and reads nobody's journal", async () => {
    expect(await call('GET', '/api/journal/chronicle?userId=uid-bob')).toBe(401);
    expect(getAllEntries).not.toHaveBeenCalled();
  });

  it("refuses alice's token asking for bob's chronicle", async () => {
    expect(await call('GET', '/api/journal/chronicle?userId=uid-bob', 'tok-alice')).toBe(403);
    expect(getAllEntries).not.toHaveBeenCalled();
  });

  it('serves the owner their own chronicle, by token', async () => {
    expect(await call('GET', '/api/journal/chronicle?userId=uid-alice', 'tok-alice')).toBe(200);
    expect(await call('GET', '/api/journal/chronicle', 'tok-alice')).toBe(200);
    expect(getAllEntries.mock.calls.map(([uid]) => uid)).toEqual(['uid-alice', 'uid-alice']);
  });

  it('refuses a twin reply with no token', async () => {
    const body = { userMessage: 'hi', profile: {}, relevantJournals: [], keyThemes: [] };
    expect(await call('POST', '/api/journal/twin-response', undefined, body)).toBe(401);
  });

  it('gets past the auth gate for a twin reply with a token', async () => {
    // No userMessage: a 400 proves the request reached the handler behind the gate
    expect(await call('POST', '/api/journal/twin-response', 'tok-alice', {})).toBe(400);
  });
});

/**
 * /token keeps its own rate-limit bucket.
 *
 * The global /api/ limit and the /token limit both keyed a signed-in person
 * as `user:<uid>`, so the app's own /api/ calls on load (a few dozen) spent
 * the 20-a-minute /token budget. Production answered Connect with 429 and the
 * call never started (2026-10-10).
 *
 * Real bindVerifiedIdentity, real limiters and the real /token route; only
 * token verification is mocked. A /token request with no room is answered 400
 * once it is past the rate limit, so 400 means "not rate limited".
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token.startsWith('tok-')
      ? { uid: `uid-${token.slice(4)}`, claims: {}, isAnonymous: false, emailVerified: true }
      : null
  ),
  isVerifiedToken: (r: unknown) => r !== null && typeof r === 'object',
}));

const { bindVerifiedIdentity } = await import('../../servers/api/request-identity.js');
const { limitApiRequest, API_GLOBAL_LIMIT } = await import('../global-rate-limit.js');
const { handleTokenRoutes } = await import('../../servers/api/routes/token.js');

function response() {
  const res = {
    statusCode: 0,
    setHeader: () => res,
    writeHead: (c: number) => ((res.statusCode = c), res),
    end: () => res,
  };
  return res as unknown as ServerResponse & { statusCode: number };
}

async function signedIn(name: string, url: string, ip: string) {
  const req = {
    url,
    method: 'GET',
    headers: { authorization: `Bearer tok-${name}` },
    socket: { remoteAddress: ip },
  } as unknown as IncomingMessage;
  await bindVerifiedIdentity(req, { NODE_ENV: 'production' });
  return req;
}

/** Status /token answers with for a request missing its room. */
async function tokenStatus(name: string, ip: string): Promise<number> {
  const req = await signedIn(name, '/token?username=x', ip);
  const res = response();
  await handleTokenRoutes(req, res, '/token', new URL('http://localhost/token?username=x'));
  return res.statusCode;
}

describe('/token rate limit', () => {
  it('is not spent by the app loading: 30 /api/ calls, then Connect still works', async () => {
    const ip = '198.51.100.71';
    for (let i = 0; i < 30; i++) {
      expect(limitApiRequest(await signedIn('cara', '/api/rituals', ip), response())).toBe(false);
    }
    expect(await tokenStatus('cara', ip)).toBe(400);
  });

  it('still turns away the 21st token in a minute', async () => {
    const ip = '198.51.100.72';
    for (let i = 0; i < 20; i++) expect(await tokenStatus('dev', ip)).toBe(400);
    expect(await tokenStatus('dev', ip)).toBe(429);
  });

  it('does not spend the global /api/ budget', async () => {
    const ip = '198.51.100.73';
    for (let i = 0; i < 20; i++) await tokenStatus('eve', ip);
    for (let i = 0; i < API_GLOBAL_LIMIT.maxRequests; i++) {
      expect(limitApiRequest(await signedIn('eve', '/api/rituals', ip), response())).toBe(false);
    }
    expect(limitApiRequest(await signedIn('eve', '/api/rituals', ip), response())).toBe(true);
  });
});

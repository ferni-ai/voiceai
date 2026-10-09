/**
 * Route rate limits count signed-in people, not the address they share.
 *
 * ~70 routes call rateLimit() with its default key. The synchronous
 * authenticate() behind it can't verify Firebase tokens, so every signed-in
 * person was keyed by IP, and most routes share that one key: everyone behind an
 * office or carrier address drew from a single bucket across routes. The e2e
 * walk saw 429s on profile, rituals and journal with a fresh account per test.
 *
 * Real bindVerifiedIdentity + real rateLimit; only token verification is mocked.
 */
import { readFileSync } from 'fs';
import type { IncomingMessage, ServerResponse } from 'http';
import { resolve } from 'path';
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
const { rateLimit } = await import('../auth-middleware.js');
const { rateLimitUid } = await import('../rate-limit-identity.js');

let net = 0;
function request(headers: Record<string, string> = {}, ip = '203.0.113.7') {
  return { url: '/api/rituals', method: 'GET', headers, socket: { remoteAddress: ip } } as unknown as IncomingMessage;
}
function response() {
  const res = { statusCode: 0, setHeader: () => res, writeHead: (c: number) => ((res.statusCode = c), res), end: () => res };
  return res as unknown as ServerResponse & { statusCode: number };
}
/** Signed-in request, verified at the door the way the API server does it */
async function signedIn(name: string, ip: string) {
  const req = request({ authorization: `Bearer tok-${name}` }, ip);
  await bindVerifiedIdentity(req, { NODE_ENV: 'production' });
  return req;
}
/** rateLimit's verdict for this request: true when it was turned away */
const limited = (req: IncomingMessage) => rateLimit(req, response(), { maxRequests: 3, windowMs: 60_000 });

describe('route rate limits', () => {
  it('know the person the server verified at the door', async () => {
    const req = await signedIn('ann', '198.51.100.1');
    expect(rateLimitUid(req)).toBe('uid-ann');
  });

  it('give two people on one network their own budget', async () => {
    const ip = `198.51.100.${(net += 1) + 10}`;
    for (let i = 0; i < 3; i++) expect(limited(await signedIn('ann', ip))).toBe(false);
    expect(limited(await signedIn('ann', ip))).toBe(true); // Ann is out
    expect(limited(await signedIn('bob', ip))).toBe(false); // Bob, same address, is not
  });

  it('ignore a claimed identity: a spoofed uid header is stripped and the caller is keyed by IP', async () => {
    const ip = `198.51.100.${(net += 1) + 10}`;
    const spoof = async () => {
      const req = request({ 'x-firebase-uid': `victim-${Math.random()}` }, ip);
      await bindVerifiedIdentity(req, { NODE_ENV: 'production' });
      return req;
    };
    const first = await spoof();
    expect(rateLimitUid(first)).toBeNull();
    for (let i = 0; i < 2; i++) expect(limited(await spoof())).toBe(false);
    expect(limited(first)).toBe(false);
    expect(limited(await spoof())).toBe(true); // fresh fake ids don't buy fresh budgets
  });

  it('key anonymous and rejected callers by IP', async () => {
    const ip = `198.51.100.${(net += 1) + 10}`;
    const forged = request({ authorization: 'Bearer forged' }, ip);
    await bindVerifiedIdentity(forged, { NODE_ENV: 'production' });
    expect(rateLimitUid(forged)).toBeNull();
    expect(rateLimitUid(request({}, ip))).toBeNull();
  });

  it('run after the server has verified who is asking (index.ts binds identity first)', () => {
    // Global and route limits read the uid bindVerifiedIdentity records. If a limiter
    // ran first it would see no one and quietly key everyone by IP again.
    const server = readFileSync(resolve(__dirname, '../../servers/api/index.ts'), 'utf8');
    const bound = server.indexOf('await bindVerifiedIdentity(req)');
    const limited = server.indexOf('rateLimitUid(req)');
    const firstRoute = server.search(/await handle\w+Routes\(/);
    expect(bound).toBeGreaterThan(-1);
    expect(limited).toBeGreaterThan(bound);
    expect(firstRoute).toBeGreaterThan(bound);
  });
});

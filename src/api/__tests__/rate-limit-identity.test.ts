import type { IncomingMessage } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const verifyFirebaseToken = vi.fn();
vi.mock('../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: (...args: unknown[]) => verifyFirebaseToken(...args),
  isVerifiedToken: (r: unknown) => r !== null && typeof r === 'object' && !('expired' in (r as object)),
}));

const { rateLimitUid, clearRateLimitIdentityCache } = await import('../rate-limit-identity.js');

let ip = 0;
const req = (authorization?: string, from = `198.51.100.${ip}`) =>
  ({ headers: authorization ? { authorization } : {}, socket: { remoteAddress: from } }) as unknown as IncomingMessage;
const NOW = 1_800_000_000_000;
const valid = (uid: string) => ({ uid, expiresAt: NOW / 1000 + 3600, emailVerified: true, isAnonymous: false, claims: {} });

beforeEach(() => {
  ip += 1; // a fresh address per test, so verification budgets don't carry over
  verifyFirebaseToken.mockReset();
  clearRateLimitIdentityCache();
});

describe('rateLimitUid', () => {
  it('counts a signed-in request against its user, verifying the token once', async () => {
    verifyFirebaseToken.mockResolvedValue(valid('uid-a'));
    expect(await rateLimitUid(req('Bearer tok-a'), NOW)).toBe('uid-a');
    expect(await rateLimitUid(req('Bearer tok-a'), NOW + 60_000)).toBe('uid-a');
    expect(verifyFirebaseToken).toHaveBeenCalledTimes(1);
  });

  it('keeps two people on one network apart', async () => {
    verifyFirebaseToken.mockImplementation(async (t: string) => valid(t === 'tok-a' ? 'uid-a' : 'uid-b'));
    expect(await rateLimitUid(req('Bearer tok-a'), NOW)).toBe('uid-a');
    expect(await rateLimitUid(req('Bearer tok-b'), NOW)).toBe('uid-b');
  });

  it('falls back to the IP key without a token, with a bad token, or when verification fails', async () => {
    expect(await rateLimitUid(req(), NOW)).toBeNull();
    verifyFirebaseToken.mockResolvedValueOnce(null);
    expect(await rateLimitUid(req('Bearer forged'), NOW)).toBeNull();
    verifyFirebaseToken.mockRejectedValueOnce(new Error('auth down'));
    expect(await rateLimitUid(req('Bearer other'), NOW)).toBeNull();
  });

  it('checks a token again once it nears expiry', async () => {
    verifyFirebaseToken.mockResolvedValue(valid('uid-a'));
    await rateLimitUid(req('Bearer tok-a'), NOW);
    await rateLimitUid(req('Bearer tok-a'), NOW + 3600_000);
    expect(verifyFirebaseToken).toHaveBeenCalledTimes(2);
  });

  it('never caches a rejected token, so junk cannot crowd out real users', async () => {
    verifyFirebaseToken.mockResolvedValue(valid('uid-a'));
    await rateLimitUid(req('Bearer real'), NOW);
    verifyFirebaseToken.mockResolvedValue(null);
    for (let i = 0; i < 50; i++) expect(await rateLimitUid(req(`Bearer junk-${i}`), NOW)).toBeNull();
    verifyFirebaseToken.mockClear();
    expect(await rateLimitUid(req('Bearer real'), NOW)).toBe('uid-a');
    expect(verifyFirebaseToken).not.toHaveBeenCalled();
  });

  it('does not key anything on the client address, which callers can spoof', async () => {
    verifyFirebaseToken.mockResolvedValue(valid('uid-a'));
    for (let i = 0; i < 60; i++) expect(await rateLimitUid(req(`Bearer t-${i}`, '203.0.113.9'), NOW)).toBe('uid-a');
  });
});

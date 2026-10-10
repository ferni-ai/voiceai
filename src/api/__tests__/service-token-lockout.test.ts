/**
 * A Google service token is not a failed sign-in.
 *
 * Cloud Scheduler calls /api/jobs/* with a Google OIDC bearer token. Every request with a
 * bearer token went through Firebase verification, which that token fails by design, and the
 * failure counted toward lockout: production logged "🚨 CRITICAL: Account locked" about every
 * 3 minutes (288 a day) while the job itself succeeded. A token that claims to be a Firebase
 * ID token and fails still counts, and so does one we can't read.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IncomingMessage } from 'http';

const { trackFailedAuth } = vi.hoisted(() => ({
  trackFailedAuth: vi.fn(async () => ({ shouldLock: false, attemptsRemaining: 4 })),
}));

vi.mock('../../services/security-events.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  trackFailedAuth,
  isLockedOut: vi.fn(async () => false),
  recordSecurityEvent: vi.fn(async () => undefined),
}));
vi.mock('../../services/identity/firebase-auth.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  verifyFirebaseToken: vi.fn(async () => null), // every token fails verification
}));

const { optionalAuthAsync } = await import('../auth-middleware.js');
const { claimsFirebaseIssuer } = await import('../../services/identity/firebase-auth.js');

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (payload: object) => `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(payload)}.sig`;
const SCHEDULER = jwt({ iss: 'https://accounts.google.com', aud: 'https://api', email: 'scheduler@x.iam.gserviceaccount.com' });
const FIREBASE = jwt({ iss: 'https://securetoken.google.com/johnb-2025', aud: 'johnb-2025', sub: 'u1' });

function request(token: string): IncomingMessage {
  return {
    headers: { authorization: `Bearer ${token}`, 'user-agent': 'test' },
    socket: { remoteAddress: '203.0.113.7' },
    url: '/api/jobs/execute-scheduled-outreach',
    method: 'POST',
  } as unknown as IncomingMessage;
}

describe('claimsFirebaseIssuer', () => {
  it('tells a Firebase ID token from a Google service token, and distrusts the unreadable', () => {
    expect(claimsFirebaseIssuer(FIREBASE)).toBe(true);
    expect(claimsFirebaseIssuer(SCHEDULER)).toBe(false);
    expect(claimsFirebaseIssuer('not-a-jwt')).toBe(true);
    expect(claimsFirebaseIssuer(jwt({ sub: 'no issuer' }))).toBe(true);
  });
});

describe('failed bearer tokens and lockout', () => {
  beforeEach(() => trackFailedAuth.mockClear());

  it("doesn't count Cloud Scheduler's OIDC token as a failed sign-in", async () => {
    expect(await optionalAuthAsync(request(SCHEDULER))).toBeNull();
    await new Promise((r) => {
      setTimeout(r, 0);
    });
    expect(trackFailedAuth).not.toHaveBeenCalled();
  });

  it('still counts a Firebase token that fails, and an unreadable one', async () => {
    await optionalAuthAsync(request(FIREBASE));
    await optionalAuthAsync(request('garbage'));
    await new Promise((r) => {
      setTimeout(r, 0);
    });
    expect(trackFailedAuth).toHaveBeenCalledTimes(2);
    expect(trackFailedAuth).toHaveBeenCalledWith(
      expect.stringMatching(/^firebase:/),
      expect.anything(),
      'firebase_token_invalid'
    );
  });
});

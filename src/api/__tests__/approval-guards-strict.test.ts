/**
 * The step-up check behind approvals and passkeys (signedInRecently) re-verifies the
 * token strictly: the account is looked up now, never from the cache or a stale state,
 * and a lookup that can't run answers 503 (fail closed), never a pass.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => {
  const signedIn = Math.floor(Date.now() / 1000) - 60; // a minute ago: a fresh sign-in
  const mode = { account: 'live' as 'live' | 'revoked' | 'outage' };
  const fail = (code: string) => Object.assign(new Error(code), { code });
  const verifyIdToken = async (token: string) => ({
    uid: `uid-${token}`,
    auth_time: signedIn,
    exp: 4102444800,
    email: `${token}@example.com`,
    firebase: { sign_in_provider: 'password' },
  });
  const getUser = async () => {
    if (mode.account === 'outage') throw fail('auth/internal-error');
    if (mode.account === 'live') return { disabled: false };
    return {
      disabled: false,
      tokensValidAfterTime: new Date((signedIn + 30) * 1000).toUTCString(),
    };
  };
  return { mode, verifyIdToken: vi.fn(verifyIdToken), getUser: vi.fn(getUser) };
});
vi.mock('firebase-admin', () => ({
  default: {
    apps: [{}],
    auth: () => ({ verifyIdToken: auth.verifyIdToken, getUser: auth.getUser }),
  },
}));

const { signedInRecently } = await import('../approval-guards.js');
const { authCheckUnavailable } = await import('../verify-token-once.js');
const { verifyFirebaseToken } = await import('../../services/identity/firebase-auth.js');

const request = (token: string) =>
  ({ headers: { authorization: `Bearer ${token}` } }) as unknown as IncomingMessage;
function response() {
  const sent = { status: 0, headers: {} as Record<string, string> };
  const res = {
    writeHead: (status: number, headers: Record<string, string>) => {
      Object.assign(sent, { status, headers });
    },
    end: vi.fn(),
  } as unknown as ServerResponse;
  return { res, sent };
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.mode.account = 'live';
});

describe('strict step-up check', () => {
  it('a live account with a fresh sign-in passes', async () => {
    expect(await signedInRecently(request('ok-1'), 'uid-ok-1')).toBe(true);
  });

  it('a revoked token does not pass, and the route answers its 401 (not a 503)', async () => {
    auth.mode.account = 'revoked';
    const req = request('revoked-1');
    const { res, sent } = response();

    expect(await signedInRecently(req, 'uid-revoked-1')).toBe(false);
    expect(authCheckUnavailable(req, res)).toBe(false);
    expect(sent.status).toBe(0);
  });

  it('a lookup error is a 503, try again: never a pass', async () => {
    auth.mode.account = 'outage';
    const req = request('outage-1');
    const { res, sent } = response();

    expect(await signedInRecently(req, 'uid-outage-1')).toBe(false);
    expect(authCheckUnavailable(req, res)).toBe(true);
    expect(sent.status).toBe(503);
  });

  it('a cached state never passes it: the account is looked up again, now', async () => {
    expect(await verifyFirebaseToken('cached-1')).not.toBeNull(); // a lax check caches it live
    expect(auth.getUser).toHaveBeenCalledTimes(1);

    auth.mode.account = 'revoked';
    expect(await signedInRecently(request('cached-1'), 'uid-cached-1')).toBe(false);
    expect(auth.getUser).toHaveBeenCalledTimes(2);

    auth.mode.account = 'outage'; // and a stale state is no fallback either
    const req = request('cached-1');
    const { res } = response();
    expect(await signedInRecently(req, 'uid-cached-1')).toBe(false);
    expect(authCheckUnavailable(req, res)).toBe(true);
  });
});

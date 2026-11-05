/**
 * POST /api/identity/merge-anonymous moves a Firebase anonymous account's data
 * into the account the user just signed in to, and only on two verified tokens.
 *
 * Requests go in through handleMigrationRoutes, where the route is mounted, and
 * the real auth middleware runs. Only token verification, rate limiting and
 * Firestore are faked.
 */
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { docs, db } = await vi.hoisted(async () =>
  (await import('../../services/identity/__tests__/fake-firestore-tree.js')).fakeFirestoreTree()
);
const tokens = vi.hoisted(() => new Map<string, Record<string, unknown>>());

vi.mock('../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) => {
    if (token === 'tok-unchecked')
      throw Object.assign(new Error('unchecked'), { code: 'auth/revocation-check-unavailable' });
    return tokens.get(token) ?? null;
  }),
  isVerifiedToken: (r: unknown) => r !== null && typeof r === 'object' && !('expired' in r),
  claimsFirebaseIssuer: () => true,
}));
vi.mock('../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/firestore-utils.js')>()),
  getFirestoreDb: () => db,
}));
vi.mock('../../memory/firestore-store.js', () => ({ getFirestoreStore: () => null }));
vi.mock('../auth-middleware.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../auth-middleware.js')>()),
  rateLimit: () => false,
}));

const { handleMigrationRoutes } = await import('../migration-routes.js');
const { linkIdentity, linkVerifiedAnonymousIdentity } =
  await import('../../services/identity/identity-linking.js');

const REAL = 'RealSethGoogleAndPhone000001';
const ANON = 'AnonRNt9iPhoneNoProviders001';
const STALE = 'AnonStaleSignIn0000000000001';
const OTHER = 'SomeoneElsesPasswordAcct0001';
const VICTIM = 'VictimNamedOnlyInTheBody0001';

const now = () => Math.floor(Date.now() / 1000);
function token(name: string, uid: string, signInProvider: string, iat: number, authTime: number) {
  tokens.set(name, {
    uid,
    signInProvider,
    isAnonymous: signInProvider === 'anonymous',
    email: signInProvider === 'anonymous' ? undefined : `${uid}@example.com`,
    claims: { iat, auth_time: authTime },
  });
}

let ip = 0;
async function merge(
  body: Record<string, unknown>,
  bearer?: string
): Promise<{ status: number; retryAfter?: string; body: Record<string, unknown> }> {
  const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), {
    url: '/api/identity/merge-anonymous',
    method: 'POST',
    headers: {
      host: 'localhost',
      'content-type': 'application/json',
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
    },
    // Each request its own address, so failed-token lockout never carries over
    socket: { remoteAddress: `10.0.0.${++ip}` },
  });
  let status = 0;
  let text = '';
  const res = {
    statusCode: 200,
    writableEnded: false,
    headersSent: false,
    retryAfter: undefined as string | undefined,
    writeHead(s: number, h?: Record<string, string>) {
      status = s;
      this.retryAfter = h?.['Retry-After'];
      return this;
    },
    setHeader: () => {},
    end(b?: string) {
      text = b ?? '';
    },
  };
  const handled = await handleMigrationRoutes(
    req as unknown as IncomingMessage,
    res as unknown as ServerResponse,
    '/api/identity/merge-anonymous'
  );
  expect(handled).toBe(true);
  return {
    status: status || res.statusCode,
    retryAfter: res.retryAfter,
    body: text ? JSON.parse(text) : {},
  };
}

const at = (path: string) => docs.get(`bogle_users/${path}`);

beforeEach(() => {
  docs.clear();
  tokens.clear();
  process.env.IDENTITY_MERGE_ANON = 'on';
  // The real account signed in a month ago; the anonymous one three days ago, token fresh
  token('tok-real', REAL, 'google.com', now() - 60, now() - 30 * 86400);
  token('tok-anon', ANON, 'anonymous', now() - 60, now() - 3 * 86400);
  token('tok-stale', STALE, 'anonymous', now() - 2 * 3600, now() - 2 * 86400);
  token('tok-other', OTHER, 'password', now() - 60, now() - 60);

  docs.set(`bogle_users/${REAL}`, { name: 'Seth' });
  docs.set(`bogle_users/${REAL}/summaries/s1`, { text: 'real', updatedAt: '2026-10-19T12:00:00Z' });
  docs.set(`bogle_users/${ANON}`, { name: 'Friend' });
  docs.set(`bogle_users/${ANON}/summaries/s1`, { text: 'anon', updatedAt: '2026-10-18T12:00:00Z' });
  docs.set(`bogle_users/${ANON}/summaries/s2`, { text: 'call on the 19th' });
  docs.set(`bogle_users/${ANON}/memories/m1`, { text: 'training for a half marathon' });
  docs.set(`bogle_users/${ANON}/moments/k1`, { text: 'got the job' });
  docs.set(`bogle_users/${ANON}/conversations/c1/turns/t1`, { said: 'hello' });
  for (const uid of [STALE, OTHER, VICTIM]) {
    docs.set(`bogle_users/${uid}/memories/m9`, { text: `${uid} only` });
  }
});

describe('POST /api/identity/merge-anonymous', () => {
  it("answers 503 with Retry-After, not 401, when the anonymous token's account couldn't be checked", async () => {
    const { status, retryAfter } = await merge({ anonIdToken: 'tok-unchecked' }, 'tok-real');

    expect(status).toBe(503);
    expect(retryAfter).toBe('5');
    expect(at(ANON)?._migratedTo).toBeUndefined();
  });

  it("merges the anonymous account's data into the real one, newer wins", async () => {
    expect(at(`${REAL}/summaries/s2`)).toBeUndefined();

    const { status, body } = await merge({ anonIdToken: 'tok-anon' }, 'tok-real');

    expect(status).toBe(200);
    expect(body).toEqual({ merged: true, conversations: 1, memories: 2 });
    expect(at(`${REAL}/summaries/s2`)).toMatchObject({ text: 'call on the 19th' });
    expect(at(`${REAL}/summaries/s1`)).toMatchObject({ text: 'real' });
    expect(at(`${REAL}/memories/m1`)).toMatchObject({ _migratedFrom: ANON });
    expect(at(`${REAL}/conversations/c1/turns/t1`)).toMatchObject({ said: 'hello' });
    expect(at(REAL)?.name).toBe('Seth');
    expect(at(ANON)?._migratedTo).toBe(REAL);
  });

  it('answers a replay with 409 already-merged and copies nothing again', async () => {
    expect((await merge({ anonIdToken: 'tok-anon' }, 'tok-real')).status).toBe(200);
    docs.delete(`bogle_users/${REAL}/summaries/s2`);

    const replay = await merge({ anonIdToken: 'tok-anon' }, 'tok-real');

    expect(replay).toEqual({ status: 409, body: { merged: false, reason: 'already-merged' } });
    expect(at(`${REAL}/summaries/s2`)).toBeUndefined();
  });

  it('claims an anonymous account with no data, so a replay is already-merged too', async () => {
    token('tok-empty', 'AnonWithNothingStored0000001', 'anonymous', now() - 60, now() - 60);
    expect((await merge({ anonIdToken: 'tok-empty' }, 'tok-real')).body).toEqual({
      merged: true,
      conversations: 0,
      memories: 0,
    });
    expect((await merge({ anonIdToken: 'tok-empty' }, 'tok-real')).body.reason).toBe(
      'already-merged'
    );
  });

  it('refuses an anonIdToken that is not an anonymous sign-in', async () => {
    const { status, body } = await merge({ anonIdToken: 'tok-other' }, 'tok-real');
    expect(status).toBe(409);
    expect(body).toEqual({ merged: false, reason: 'not-anonymous' });
    expect(at(`${REAL}/memories/m9`)).toBeUndefined();
    expect(at(OTHER)?._migratedTo).toBeUndefined();
  });

  it('refuses the same account as both tokens', async () => {
    const { status, body } = await merge({ anonIdToken: 'tok-real' }, 'tok-real');
    expect(status).toBe(409);
    expect(body).toEqual({ merged: false, reason: 'same-account' });
  });

  it('refuses an anonymous sign-in older than an hour (auth_time and iat both)', async () => {
    const { status } = await merge({ anonIdToken: 'tok-stale' }, 'tok-real');
    expect(status).toBe(401);
    expect(at(`${REAL}/memories/m9`)).toBeUndefined();
    expect(at(STALE)?._migratedTo).toBeUndefined();
  });

  it('refuses a real account that is itself anonymous', async () => {
    token('tok-anon-2', 'AnotherAnonymousAccount00001', 'anonymous', now() - 60, now() - 60);
    const { status } = await merge({ anonIdToken: 'tok-anon' }, 'tok-anon-2');
    expect(status).toBe(403);
    expect(at(ANON)?._migratedTo).toBeUndefined();
  });

  it.each([
    ['no bearer token', undefined, 'tok-anon'],
    ['an invalid bearer token', 'not-a-token', 'tok-anon'],
    ['no anonIdToken', 'tok-real', undefined],
    ['an invalid anonIdToken', 'tok-real', 'not-a-token'],
  ])('answers %s with 401 and moves nothing', async (_case, bearer, anonIdToken) => {
    const { status } = await merge({ anonIdToken }, bearer);
    expect(status).toBe(401);
    expect(at(`${REAL}/summaries/s2`)).toBeUndefined();
    expect(at(ANON)?._migratedTo).toBeUndefined();
  });

  it('never uses a uid named in the body', async () => {
    const noToken = await merge({ anonUid: VICTIM, uid: VICTIM, sourceUid: VICTIM }, 'tok-real');
    expect(noToken.status).toBe(401);

    const withToken = await merge({ anonUid: VICTIM, anonIdToken: 'tok-anon' }, 'tok-real');
    expect(withToken.status).toBe(200);
    expect(at(`${REAL}/memories/m9`)).toBeUndefined();
    expect(at(VICTIM)?._migratedTo).toBeUndefined();
    expect(at(ANON)?._migratedTo).toBe(REAL);
  });

  it('is 404 while IDENTITY_MERGE_ANON is off', async () => {
    delete process.env.IDENTITY_MERGE_ANON;
    const { status } = await merge({ anonIdToken: 'tok-anon' }, 'tok-real');
    expect(status).toBe(404);
    expect(at(`${REAL}/summaries/s2`)).toBeUndefined();
  });
});

describe('linking a raw uid', () => {
  it('linkIdentity still refuses a source without a device: or anon: prefix', async () => {
    const result = await linkIdentity(ANON, REAL);
    expect(result.errors).toEqual(['Source is not a device or anonymous ID']);
    expect(at(`${REAL}/summaries/s2`)).toBeUndefined();
  });

  it('linkVerifiedAnonymousIdentity refuses a token from any other provider', async () => {
    const result = await linkVerifiedAnonymousIdentity(
      { uid: OTHER, signInProvider: 'password' },
      REAL
    );
    expect(result.success).toBe(false);
    expect(at(`${REAL}/memories/m9`)).toBeUndefined();
  });
});

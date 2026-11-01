/**
 * Third-party processing consent (App Store 5.1.2(i)) through the real
 * /api/account routes over the shared fake Firestore: the record is the
 * VERIFIED caller's (never a uid in the body), anonymous users can consent, a
 * service key can't, withdrawal stamps the record, agreeing again clears it,
 * and account deletion erases it. Only the token verifier, the data sweep,
 * the other linked-record sweeps and Firebase user deletion are doubles.
 */
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetFakeFirestore } from '../../tests/helpers/fake-firestore.js';

const fake = await vi.hoisted(async () =>
  (await import('../../tests/helpers/fake-firestore.js')).newFakeFirestoreState()
);

vi.mock('../../utils/firestore-utils.js', async (importOriginal) => {
  const { createFakeFirestore } = await import('../../tests/helpers/fake-firestore.js');
  return {
    ...(await importOriginal<typeof import('../../utils/firestore-utils.js')>()),
    getFirestoreDb: createFakeFirestore(fake),
  };
});
vi.mock('../auth-middleware.js', () => ({
  requireAuth: vi.fn(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.headers['x-api-key'] === 'service-key') {
      return { userId: 'api-user', isAdmin: false, authMethod: 'api_key' };
    }
    const header = req.headers.authorization;
    const match = typeof header === 'string' ? header.match(/^Bearer (anon|verified)-(.+)$/) : null;
    if (!match) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return null;
    }
    return {
      userId: match[2],
      firebaseUid: match[2],
      isAdmin: false,
      authMethod: 'firebase',
      isAnonymous: match[1] === 'anon',
    };
  }),
  rateLimit: vi.fn(() => false),
}));
vi.mock('../../services/data-export.js', () => ({
  getDataExportService: () => ({ deleteAllData: vi.fn(async () => undefined) }),
}));
vi.mock('../../services/identity/firebase-auth.js', () => ({
  setFirebaseUserDisabled: vi.fn(async () => 'done' as const),
  getFirebaseUserOrThrow: vi.fn(async () => null),
  deleteFirebaseUser: vi.fn(async () => true),
  getFirebaseUser: vi.fn(async () => null),
}));
vi.mock('../../services/security-events.js', () => ({
  recordSecurityEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../services/push-endpoint-owners.js', () => ({
  erasePushRecordsFor: vi.fn(async () => undefined),
}));
vi.mock('../../servers/token/oauth-link-state.js', () => ({
  deleteOAuthLinkStatesFor: vi.fn(async () => undefined),
}));
vi.mock('../../services/billing/apple-signed-data.js', () => ({
  tombstoneTransactionOwnersFor: vi.fn(async () => undefined),
}));
vi.mock('../../services/musical-you/social.js', () => ({
  eraseMusicalSocialData: vi.fn(async () => undefined),
}));
vi.mock('../../services/social/challenges.js', () => ({
  eraseSocialChallengesFor: vi.fn(async () => undefined),
}));
vi.mock('../../services/social/leaderboards.js', () => ({
  eraseSocialStatsFor: vi.fn(async () => undefined),
}));

const { handleAccountRoutes } = await import('../account-routes.js');
const { consentCovers } = await import('../../services/processing-consent.js');

const PATH = '/api/account/processing-consent';
const AGREE = { version: '2026-10-18', agreedAt: '2026-10-18T12:00:00.000Z', source: 'ios' };

function request(method: string, path: string, body: unknown, headers: Record<string, string>) {
  const req = new EventEmitter() as IncomingMessage;
  req.method = method;
  req.url = path;
  req.headers = headers;
  (req as unknown as { socket: unknown }).socket = { remoteAddress: '127.0.0.1' };
  setTimeout(() => {
    if (body !== undefined) req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  }, 0);
  return req;
}

async function call(method: string, headers: Record<string, string>, body?: unknown, path = PATH) {
  const sent = { status: 200, body: {} as Record<string, unknown> };
  const res = {
    setHeader: vi.fn(),
    writeHead: vi.fn((status: number) => {
      sent.status = status;
    }),
    end: vi.fn((data?: string) => {
      sent.body = JSON.parse(data || '{}') as Record<string, unknown>;
    }),
  } as unknown as ServerResponse;
  await handleAccountRoutes(request(method, path, body, headers), res, path);
  return sent;
}

const as = (uid: string, kind = 'verified') => ({ authorization: `Bearer ${kind}-${uid}` });
const stored = (uid: string) => fake.docs.get(`processing_consent/${uid}`);

beforeEach(() => resetFakeFirestore(fake));

describe('POST /api/account/processing-consent', () => {
  it("records the verified caller's consent, never a uid named in the body", async () => {
    expect(stored('alice')).toBeUndefined();

    const sent = await call('POST', as('alice'), { ...AGREE, uid: 'bob', userId: 'bob' });

    expect(sent.status).toBe(200);
    expect(stored('alice')).toMatchObject({ uid: 'alice', version: '2026-10-18', source: 'ios' });
    expect(stored('bob')).toBeUndefined();
  });

  it('lets an anonymous Firebase user consent before signing in', async () => {
    const sent = await call('POST', as('anon-1', 'anon'), AGREE);
    expect(sent.status).toBe(200);
    expect(stored('anon-1')).toMatchObject({ version: '2026-10-18' });
  });

  it('refuses a service API key and an unauthenticated caller, storing nothing', async () => {
    expect((await call('POST', { 'x-api-key': 'service-key' }, AGREE)).status).toBe(403);
    expect((await call('POST', {}, AGREE)).status).toBe(401);
    expect(fake.docs.size).toBe(0);
  });

  it.each([
    ['no version', { ...AGREE, version: undefined }],
    ['a version with a slash', { ...AGREE, version: 'v1/../x' }],
    ['no agreedAt', { ...AGREE, agreedAt: undefined }],
    ['an agreedAt that is not a time', { ...AGREE, agreedAt: 'yesterday' }],
    ['an agreedAt in the future', { ...AGREE, agreedAt: '2999-01-01T00:00:00Z' }],
    ['an unknown source', { ...AGREE, source: 'android' }],
  ])('rejects %s', async (_label, body) => {
    expect((await call('POST', as('alice'), body)).status).toBe(400);
    expect(stored('alice')).toBeUndefined();
  });
});

describe('GET and DELETE /api/account/processing-consent', () => {
  it("answers each person's own record only", async () => {
    await call('POST', as('alice'), AGREE);

    expect((await call('GET', as('alice'))).body.consent).toMatchObject({ version: '2026-10-18' });
    expect((await call('GET', as('bob'))).body.consent).toBeNull();
  });

  it('withdrawal stamps the record, and agreeing again clears it', async () => {
    await call('POST', as('alice'), AGREE);
    expect(
      consentCovers((await call('GET', as('alice'))).body.consent as never, '2026-10-18')
    ).toBe(true);

    const withdrawn = await call('DELETE', as('alice'));
    expect(withdrawn.body.consent).toMatchObject({ withdrawnAt: expect.any(String) });
    expect(consentCovers(stored('alice') as never, '2026-10-18')).toBe(false);

    await call('POST', as('alice'), AGREE);
    expect(stored('alice')?.withdrawnAt).toBeUndefined();
    expect(consentCovers(stored('alice') as never, '2026-10-18')).toBe(true);
  });

  it("bob's withdrawal doesn't touch alice's consent", async () => {
    await call('POST', as('alice'), AGREE);
    expect((await call('DELETE', as('bob'))).body.consent).toBeNull();
    expect(stored('alice')?.withdrawnAt).toBeUndefined();
  });
});

describe('account deletion', () => {
  it("erases the person's consent record and keeps everyone else's", async () => {
    await call('POST', as('alice'), AGREE);
    await call('POST', as('bob'), AGREE);

    const sent = await call(
      'DELETE',
      as('alice'),
      { confirmation: 'DELETE_MY_ACCOUNT' },
      '/api/account'
    );

    expect(sent.status).toBe(200);
    expect(stored('alice')).toBeUndefined();
    expect(stored('bob')).toBeDefined();
  });
});

describe('consentCovers', () => {
  const record = { uid: 'a', ...AGREE, source: 'ios' as const, recordedAt: AGREE.agreedAt };
  it('holds only for a standing agreement to that exact version', () => {
    expect(consentCovers(record, '2026-10-18')).toBe(true);
    expect(consentCovers(record, '2026-11-01')).toBe(false);
    expect(consentCovers({ ...record, withdrawnAt: AGREE.agreedAt }, '2026-10-18')).toBe(false);
    expect(consentCovers(null, '2026-10-18')).toBe(false);
  });
});

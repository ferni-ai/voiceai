/**
 * "Help shape Ferni" consent through the real /api/account routes over the shared fake
 * Firestore: absent while CALL_CAPTURE_CONSENT is off, the record is the VERIFIED caller's (never
 * a uid in the body), a minor-care hold hides and refuses it, withdrawal stamps it. Only the token
 * verifier, the hold read and the account-deletion sweeps' other stores are doubles.
 */
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetFakeFirestore } from '../../tests/helpers/fake-firestore.js';

const fake = await vi.hoisted(async () =>
  (await import('../../tests/helpers/fake-firestore.js')).newFakeFirestoreState()
);
const held = vi.hoisted(() => new Set<string>());

vi.mock('../../utils/firestore-utils.js', async (importOriginal) => {
  const { createFakeFirestore } = await import('../../tests/helpers/fake-firestore.js');
  return {
    ...(await importOriginal<typeof import('../../utils/firestore-utils.js')>()),
    getFirestoreDb: createFakeFirestore(fake),
  };
});
vi.mock('../../services/outreach/minor-care-shared-hold.js', () => ({
  sharedHeldStrict: vi.fn(async (uid: string) => held.has(uid)),
}));
vi.mock('../auth-middleware.js', () => ({
  requireAuth: vi.fn(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.headers['x-api-key'] === 'service-key') {
      return { userId: 'api-user', isAdmin: false, authMethod: 'api_key' };
    }
    const match = String(req.headers.authorization ?? '').match(/^Bearer verified-(.+)$/);
    if (!match) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return null;
    }
    return { userId: match[1], firebaseUid: match[1], isAdmin: false, authMethod: 'firebase' };
  }),
  rateLimit: vi.fn(() => false),
}));

const { handleAccountRoutes } = await import('../account-routes.js');

const PATH = '/api/account/call-capture-consent';
const AGREE = { version: '2026-11-01', agreedAt: '2026-11-01T12:00:00.000Z', source: 'web' };

function request(method: string, body: unknown, headers: Record<string, string>) {
  const req = new EventEmitter() as IncomingMessage;
  req.method = method;
  req.url = PATH;
  req.headers = headers;
  (req as unknown as { socket: unknown }).socket = { remoteAddress: '127.0.0.1' };
  setTimeout(() => {
    if (body !== undefined) req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  }, 0);
  return req;
}

async function call(method: string, headers: Record<string, string>, body?: unknown) {
  const sent: { status: number; body: Record<string, unknown> } = { status: 200, body: {} };
  const res = {
    setHeader: vi.fn(),
    writeHead: vi.fn((status: number) => {
      sent.status = status;
    }),
    end: vi.fn((data?: string) => {
      sent.body = JSON.parse(data || '{}') as Record<string, unknown>;
    }),
  } as unknown as ServerResponse;
  await handleAccountRoutes(request(method, body, headers), res, PATH);
  return sent;
}

const as = (uid: string) => ({ authorization: `Bearer verified-${uid}` });
const stored = (uid: string) => fake.docs.get(`call_capture_consent/${uid}`);

beforeEach(() => {
  resetFakeFirestore(fake);
  held.clear();
  vi.stubEnv('CALL_CAPTURE_CONSENT', 'on');
});

describe('flag off', () => {
  it.each(['GET', 'POST', 'DELETE'])('%s answers 404 and stores nothing', async (method) => {
    vi.stubEnv('CALL_CAPTURE_CONSENT', 'off');
    const sent = await call(method, as('riley'), method === 'POST' ? AGREE : undefined);
    expect(sent.status).toBe(404);
    expect(fake.docs.size).toBe(0);
  });
});

describe('POST', () => {
  it("records the verified caller's consent, never a uid named in the body", async () => {
    const sent = await call('POST', as('riley'), { ...AGREE, uid: 'sam', userId: 'sam' });

    expect(sent.status).toBe(200);
    expect(stored('riley')).toMatchObject({ uid: 'riley', version: '2026-11-01', source: 'web' });
    expect(stored('sam')).toBeUndefined();
  });

  it('refuses a service key and an unauthenticated caller', async () => {
    expect((await call('POST', { 'x-api-key': 'service-key' }, AGREE)).status).toBe(403);
    expect((await call('POST', {}, AGREE)).status).toBe(401);
    expect(fake.docs.size).toBe(0);
  });

  it('refuses a person under a minor-care hold, storing nothing', async () => {
    held.add('riley');
    expect((await call('POST', as('riley'), AGREE)).status).toBe(403);
    expect(stored('riley')).toBeUndefined();
  });

  it('rejects an agreement that is not one', async () => {
    expect((await call('POST', as('riley'), { ...AGREE, agreedAt: 'soon' })).status).toBe(400);
    expect(stored('riley')).toBeUndefined();
  });
});

describe('GET and DELETE', () => {
  it("answers each person's own record, and whether the switch is offered", async () => {
    await call('POST', as('riley'), AGREE);
    held.add('sam');

    expect((await call('GET', as('riley'))).body).toMatchObject({
      consent: { version: '2026-11-01' },
      available: true,
    });
    expect((await call('GET', as('sam'))).body).toEqual({ consent: null, available: false });
  });

  it("withdrawal stamps the caller's record only", async () => {
    await call('POST', as('riley'), AGREE);
    await call('POST', as('sam'), AGREE);

    const sent = await call('DELETE', as('riley'), { uid: 'sam' });

    expect(sent.body.consent).toMatchObject({ withdrawnAt: expect.any(String) });
    expect(stored('sam')?.withdrawnAt).toBeUndefined();
  });
});

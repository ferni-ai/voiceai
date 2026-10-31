/**
 * /api/webhooks: create refuses a private URL, an update cannot store one either, and the test route
 * reports status only, never the body the destination sent back. Real routes, real store
 * (in-memory, Firestore unavailable) and real executor; auth, DNS and the network are doubles.
 */
import dns from 'node:dns';
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@google-cloud/firestore', () => ({
  FieldValue: { delete: () => undefined },
  Firestore: class {
    constructor() {
      throw new Error('Firestore unavailable in this test');
    }
  },
}));

vi.mock('../../../../api/auth-middleware.js', () => ({
  requireAuth: vi.fn(async () => ({ userId: 'alice', isAdmin: false, authMethod: 'firebase' })),
  requireAdmin: vi.fn(() => null),
  rateLimit: vi.fn(() => false),
}));

const { handleWebhookRoutes } = await import('../webhooks.js');

const METADATA_LIKE_BODY = '{"access_token":"ya29.SECRET-TOKEN-VALUE","token_type":"Bearer"}';

function request(method: string, url: string, body?: unknown): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = { authorization: 'Bearer test' };
  setTimeout(() => {
    if (body !== undefined) req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  }, 0);
  return req;
}

async function call(method: string, path: string, body?: unknown) {
  const sent = { status: 0, body: '' };
  const res = {
    writeHead: vi.fn((status: number) => {
      sent.status = status;
    }),
    setHeader: vi.fn(),
    end: vi.fn((data?: string) => {
      sent.body = data ?? '';
    }),
  } as unknown as ServerResponse;
  await handleWebhookRoutes(request(method, path, body), res, path, new URL(path, 'https://x'));
  return { ...sent, json: sent.body ? (JSON.parse(sent.body) as Record<string, unknown>) : {} };
}

async function createHook(): Promise<string> {
  const created = await call('POST', '/api/webhooks', {
    name: 'Porch lights',
    url: 'https://hooks.example.com/porch',
    method: 'GET',
    voiceTriggers: ['porch lights'],
  });
  expect(created.status).toBe(201);
  return created.json.id as string;
}

// Webhooks are only saved sealed: give the store a token key (LOG_HASH_SECRET is the last link).
const savedHashSecret = process.env.LOG_HASH_SECRET;

beforeEach(() => {
  process.env.LOG_HASH_SECRET = 'test-only-hash-secret';
  vi.spyOn(dns.promises, 'lookup').mockImplementation((async () => [
    { address: '93.184.215.14', family: 4 },
  ]) as unknown as typeof dns.promises.lookup);
});

afterEach(() => {
  if (savedHashSecret === undefined) delete process.env.LOG_HASH_SECRET;
  else process.env.LOG_HASH_SECRET = savedHashSecret;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Create has no inline guard call of its own: validateWebhookInput sends the URL through
// validateWebhookUrl, so this is the test that a private URL still cannot be created.
describe('POST /api/webhooks', () => {
  it.each([
    'https://169.254.169.254/computeMetadata/v1/',
    'https://[::1]/x',
    'http://10.0.0.8/api/webhook/x',
    'https://localhost/x',
  ])('refuses to create a webhook for %s and stores nothing', async (url) => {
    const created = await call('POST', '/api/webhooks', {
      name: 'Sneaky',
      url,
      method: 'GET',
      voiceTriggers: ['sneaky'],
    });

    expect(created.status).toBe(400);
    const list = await call('GET', '/api/webhooks');
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.json)).not.toContain('Sneaky');
  });

  it('creates a webhook for a public https URL', async () => {
    const id = await createHook();
    expect(id).toEqual(expect.any(String));
  });

  it('with no token key, answers 503 with an honest message and stores nothing', async () => {
    delete process.env.LOG_HASH_SECRET;
    const created = await call('POST', '/api/webhooks', {
      name: 'Unsealed',
      url: 'https://hooks.example.com/unsealed',
      method: 'GET',
      voiceTriggers: ['unsealed'],
    });
    expect(created.status).toBe(503);
    expect(created.body).toContain('Nothing was saved');
    const listed = await call('GET', '/api/webhooks');
    expect(JSON.stringify(listed.json)).not.toContain('hooks.example.com/unsealed');
  });
});

describe('PUT /api/webhooks/:id', () => {
  it.each([
    'https://169.254.169.254/computeMetadata/v1/',
    'https://[::1]/x',
    'http://10.0.0.8/api/webhook/x',
    'https://[::ffff:127.0.0.1]/x',
  ])('refuses to store %s and keeps the old URL', async (url) => {
    const id = await createHook();

    const put = await call('PUT', `/api/webhooks/${id}`, { url });

    expect(put.status).toBe(400);
    const got = await call('GET', `/api/webhooks/${id}`);
    expect(got.json.url).toBe('https://hooks.example.com/porch');
  });

  it('still updates a webhook to another public https URL', async () => {
    const id = await createHook();
    const put = await call('PUT', `/api/webhooks/${id}`, { url: 'https://hooks.example.com/new' });
    expect(put.status).toBe(200);
    expect(put.json.url).toBe('https://hooks.example.com/new');
  });
});

describe('POST /api/webhooks/:id/test', () => {
  it('reports the status but never relays the response body', async () => {
    const id = await createHook();
    const fetchSpy = vi.fn(
      async () =>
        new Response(METADATA_LIKE_BODY, {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    );
    vi.stubGlobal('fetch', fetchSpy);

    const res = await call('POST', `/api/webhooks/${id}/test`);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ success: true, statusCode: 200 });
    expect(res.body).not.toContain('SECRET-TOKEN-VALUE');
    expect(res.json).not.toHaveProperty('responseBody');
  });
});

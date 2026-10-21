/**
 * v2 developer tools: a webhook tool's URL must be a public https destination on create and
 * update, a stored URL that predates that rule is refused at test time, and the test route
 * reports status, type and size, never the body. Real routes and schemas; auth, Firestore,
 * DNS and the network are doubles.
 */
import dns from 'node:dns';
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const docs = new Map<string, Record<string, unknown>>();

vi.mock('../shared/middleware.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shared/middleware.js')>()),
  requireApiKeyAuth: vi.fn(async () => ({ publisherId: 'pub_1', apiKeyId: 'key_1' })),
}));

vi.mock('../../../v1/developers/shared/developer-auth.js', () => ({
  getFirestore: async () => ({
    collection: () => ({
      doc: (id: string) => ({
        get: async () => ({ id, exists: docs.has(id), data: () => docs.get(id) }),
        update: async (patch: Record<string, unknown>) => {
          docs.set(id, { ...docs.get(id), ...patch });
        },
      }),
    }),
  }),
}));

const { handleToolsRoutes } = await import('../tools-routes.js');
const schemas = await import('../shared/validation.js');

const METADATA_LIKE_BODY = '{"access_token":"ya29.SECRET-TOKEN-VALUE","token_type":"Bearer"}';
const BASE = '/api/v2/developers/tools';

function storeTool(url: string) {
  docs.set('tool_1', {
    id: 'tool_1',
    publisherId: 'pub_1',
    name: 'lookup',
    type: 'webhook',
    config: { url, method: 'GET' },
  });
}

async function call(method: string, path: string, body?: unknown) {
  const req = new EventEmitter() as IncomingMessage;
  req.method = method;
  req.url = path;
  req.headers = {};
  setTimeout(() => {
    if (body !== undefined) req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  }, 0);
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
  await handleToolsRoutes(req, res, path);
  return sent;
}

beforeEach(() => {
  docs.clear();
  vi.spyOn(dns.promises, 'lookup').mockImplementation((async () => [
    { address: '93.184.215.14', family: 4 },
  ]) as unknown as typeof dns.promises.lookup);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const PRIVATE_URLS = [
  'https://169.254.169.254/computeMetadata/v1/',
  'http://10.0.0.4/internal',
  'https://[::1]/x',
  'https://[::ffff:127.0.0.1]/x',
];

describe('schemas refuse URLs the server must not fetch', () => {
  it.each(PRIVATE_URLS)('%s', (url) => {
    const tool = {
      name: 'lookup',
      displayName: 'Lookup',
      description: 'd',
      llmDescription: 'd',
      type: 'webhook',
      config: { url },
      parameters: { type: 'object', properties: {} },
    };
    expect(schemas.CreateToolSchema.safeParse(tool).success).toBe(false);
    expect(schemas.UpdateToolSchema.safeParse({ config: { url } }).success).toBe(false);
    expect(schemas.UpdateWebhookSchema.safeParse({ url }).success).toBe(false);
    expect(schemas.UpdateMCPServerSchema.safeParse({ endpoint: url }).success).toBe(false);
    expect(schemas.UpdateOAuthProviderSchema.safeParse({ tokenUrl: url }).success).toBe(false);
  });

  it('still accepts a public https URL', () => {
    expect(
      schemas.UpdateToolSchema.safeParse({ config: { url: 'https://api.example.com/x' } }).success
    ).toBe(true);
  });
});

describe('PUT /tools/:id', () => {
  it('cannot store a private URL', async () => {
    storeTool('https://api.example.com/lookup');
    const res = await call('PUT', `${BASE}/tool_1`, {
      config: { url: 'https://169.254.169.254/computeMetadata/v1/' },
    });
    expect(res.status).toBe(400);
    expect((docs.get('tool_1')?.config as { url: string }).url).toBe(
      'https://api.example.com/lookup'
    );
  });
});

describe('POST /tools/:id/test', () => {
  it('never relays the response body', async () => {
    storeTool('https://api.example.com/lookup');
    const fetchSpy = vi.fn(
      async () =>
        new Response(METADATA_LIKE_BODY, {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    );
    vi.stubGlobal('fetch', fetchSpy);

    const res = await call('POST', `${BASE}/tool_1/test`, { params: {} });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(res.body).not.toContain('SECRET-TOKEN-VALUE');
    expect(JSON.parse(res.body).result).toEqual({
      statusCode: 200,
      contentType: 'application/json',
      bytes: METADATA_LIKE_BODY.length,
    });
  });

  it('refuses a private URL stored before the rule, without fetching it', async () => {
    storeTool('https://169.254.169.254/computeMetadata/v1/');
    const fetchSpy = vi.fn(async () => new Response(METADATA_LIKE_BODY, { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    const res = await call('POST', `${BASE}/tool_1/test`, { params: {} });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res.body).not.toContain('SECRET-TOKEN-VALUE');
    expect(JSON.parse(res.body)).toMatchObject({ success: false });
  });
});

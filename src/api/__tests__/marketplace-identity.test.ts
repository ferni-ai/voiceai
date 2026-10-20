/**
 * Marketplace admin and publisher identity come from the verified token.
 *
 * The admin routes accepted any request carrying an x-admin-id header, and the
 * publisher routes took the publisher from x-publisher-id. Both are client
 * claims. Admin now requires the shared requireAdmin (Firebase admin claim or
 * admin API key); the publisher is the record linked to the caller's verified,
 * non-anonymous Firebase uid; publisher writes can never mark an item verified.
 *
 * Real HTTP, real routes and auth middleware. Firebase token verification, the
 * uid -> publisher lookup, the registry, the review queue and email are mocked.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/identity/firebase-auth.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/identity/firebase-auth.js')>()),
  verifyFirebaseToken: vi.fn(async (token: string) => {
    const users: Record<string, object> = {
      'tok-admin': { uid: 'admin-1', email: 'ops@example.com', claims: { admin: true } },
      'tok-user': { uid: 'uid-user', claims: {} },
      'tok-owner': { uid: 'uid-owner', claims: {} },
      'tok-other': { uid: 'uid-other', claims: {} },
      'tok-anon': { uid: 'uid-anon', claims: {}, isAnonymous: true },
    };
    const user = users[token];
    return user ? { emailVerified: true, isAnonymous: false, ...user } : null;
  }),
}));

const publishersByUid = vi.hoisted(
  () =>
    new Map<string, { id: string; email: string; name: string; verified: boolean }>([
      [
        'uid-owner',
        { id: 'pub-owner', email: 'owner@example.com', name: 'Owner', verified: false },
      ],
      [
        'uid-other',
        { id: 'pub-other', email: 'other@example.com', name: 'Other', verified: false },
      ],
      // An anonymous uid that was linked to a publisher before linking was fixed
      ['uid-anon', { id: 'pub-shared', email: '', name: 'Developer', verified: false }],
    ])
);
vi.mock('../v1/developers/shared/developer-auth.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../v1/developers/shared/developer-auth.js')>()),
  findPublisherByFirebaseUid: vi.fn(async (uid: string) => {
    const p = publishersByUid.get(uid);
    return p ? { ...p, createdAt: new Date() } : null;
  }),
}));

type Item = {
  id: string;
  name: string;
  version: string;
  publisher: { id: string; name: string; email?: string; verified: boolean };
  verification: { trustLevel: string; verified: boolean; verifiedAt?: string; verifiedBy?: string };
  [k: string]: unknown;
};
const tools = vi.hoisted(() => new Map<string, Item>());
vi.mock('../../marketplace/index.js', () => ({
  getTool: (id: string) => tools.get(id),
  getAgent: () => undefined,
  listTools: () => [...tools.values()],
  listAgents: () => [],
  listInstallations: () => [],
  getExecutionHistory: () => [],
  registerTool: (m: Item) => {
    tools.set(m.id, structuredClone(m));
    return { success: true };
  },
  registerAgent: () => ({ success: true }),
}));

vi.mock('../review-queue.js', () => ({
  submitForReview: vi.fn(async () => ({
    id: 'sub-1',
    status: 'pending_review',
    automatedChecks: { passedValidation: true },
  })),
  getReviewHistory: vi.fn(async () => []),
  getReviewQueue: vi.fn(async () => []),
  assignReviewer: vi.fn(),
  getSubmission: vi.fn(),
  submitReview: vi.fn(),
}));

vi.mock('../../marketplace/reviews/index.js', () => ({
  getPendingReviews: () => [],
  getReviewStats: () => ({}),
  moderateReview: vi.fn(),
}));

vi.mock('../../marketplace/billing/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../marketplace/billing/index.js')>()),
  getPendingPayouts: () => [{ amountCents: 1234 }],
}));

const sendEmail = vi.hoisted(() => vi.fn(async () => ({ success: true, messageId: 'm1' })));
vi.mock('../../services/outreach/delivery/email-delivery.js', () => ({
  sendEmail,
  isEmailDeliveryAvailable: () => true,
  generatePersonaEmailHTML: () => '<p></p>',
}));

const { handleMarketplaceRoutes } = await import('../marketplace/index.js');
const { handleMarketplaceAdminRoutes } = await import('../routes/marketplace-admin.js');

let server: Server;
let base = '';
beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const done = url.pathname.startsWith('/api/admin/marketplace')
      ? handleMarketplaceAdminRoutes(req, res, url.pathname)
      : handleMarketplaceRoutes(req, res, url.pathname, url);
    void done.then((handled) => {
      if (!handled && !res.writableEnded) res.writeHead(404).end();
    });
  });
  await new Promise<void>((r) => {
    server.listen(0, '127.0.0.1', r);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(
  () =>
    new Promise<void>((r) => {
      server.close(() => r());
    })
);

function toolManifest(id: string, publisherId: string, version = '1.0.0'): Item {
  return {
    id,
    name: id,
    version,
    publisher: { id: publisherId, name: 'Pub', verified: false },
    description: { short: 'A tool', long: 'A tool' },
    execution: { runtime: { type: 'webhook' } },
    interface: { llmDescription: 'Does a thing' },
    verification: { trustLevel: 'unverified', verified: false },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  tools.clear();
  tools.set(
    'owner-tool',
    toolManifest('owner-tool', 'pub-owner') // owned by uid-owner's publisher
  );
  tools.get('owner-tool')!.publisher.email = 'owner@example.com';
});

function call(
  method: string,
  path: string,
  opts: { token?: string; headers?: Record<string, string>; body?: unknown } = {}
) {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...opts.headers,
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

describe('marketplace admin routes', () => {
  const approve = '/api/admin/marketplace/item/owner-tool/approve';

  it('refuses a request that only carries x-admin-id', async () => {
    const res = await call('POST', approve, { headers: { 'x-admin-id': 'x' }, body: {} });
    expect(res.status).toBe(401);
    expect(tools.get('owner-tool')!.verification.verified).toBe(false);
  });

  it('refuses a signed-in user without the admin claim, header or not', async () => {
    const res = await call('POST', approve, {
      token: 'tok-user',
      headers: { 'x-admin-id': 'x' },
      body: {},
    });
    expect(res.status).toBe(403);
    expect(tools.get('owner-tool')!.verification.verified).toBe(false);
  });

  it('refuses the review queue without a verified admin', async () => {
    const res = await call('GET', '/api/admin/marketplace/queue', {
      headers: { 'x-admin-id': 'x' },
    });
    expect(res.status).toBe(401);
  });

  it('lets a verified admin approve, recording the admin uid', async () => {
    const res = await call('POST', approve, { token: 'tok-admin', body: {} });
    expect(res.status).toBe(200);
    const item = tools.get('owner-tool')!;
    expect(item.verification.verified).toBe(true);
    expect(item.verification.verifiedBy).toBe('admin-1');
  });

  it('sends the rejection only to the publisher address on record', async () => {
    const res = await call('POST', '/api/admin/marketplace/item/owner-tool/reject', {
      token: 'tok-admin',
      headers: { 'x-admin-id': 'admin-1' },
      body: { reason: 'Incomplete', publisherEmail: 'someone-else@example.com' },
    });
    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'owner@example.com' }));
  });

  it('sends no rejection email when the item has no address on record', async () => {
    delete tools.get('owner-tool')!.publisher.email;
    const res = await call('POST', '/api/admin/marketplace/item/owner-tool/reject', {
      token: 'tok-admin',
      headers: { 'x-admin-id': 'admin-1' },
      body: { reason: 'Incomplete', publisherEmail: 'someone-else@example.com' },
    });
    expect(res.status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe('marketplace publisher routes', () => {
  it('refuses a submission that only carries x-publisher-id', async () => {
    const res = await call('POST', '/api/marketplace/publisher/submit', {
      headers: { 'x-publisher-id': 'pub-x', 'x-publisher-name': 'X' },
      body: { type: 'tool', manifest: toolManifest('new-tool', 'pub-x') },
    });
    expect(res.status).toBe(401);
    expect(tools.has('new-tool')).toBe(false);
  });

  it("refuses another publisher updating the owner's tool, whatever x-publisher-id says", async () => {
    const res = await call('PUT', '/api/marketplace/publisher/owner-tool', {
      token: 'tok-other',
      headers: { 'x-publisher-id': 'pub-owner' },
      body: { type: 'tool', manifest: toolManifest('owner-tool', 'pub-owner', '2.0.0') },
    });
    expect(res.status).toBe(403);
    expect(tools.get('owner-tool')!.version).toBe('1.0.0');
  });

  it("refuses a submission that reuses another publisher's item id", async () => {
    const res = await call('POST', '/api/marketplace/publisher/submit', {
      token: 'tok-other',
      headers: { 'x-publisher-id': 'pub-other' },
      body: { type: 'tool', manifest: toolManifest('owner-tool', 'pub-other', '2.0.0') },
    });
    expect(res.status).toBe(403);
    expect(tools.get('owner-tool')!.publisher.id).toBe('pub-owner');
  });

  it('ignores verified flags a publisher sends in an update', async () => {
    const manifest = toolManifest('owner-tool', 'pub-owner', '2.0.0');
    manifest.verification = { trustLevel: 'verified', verified: true, verifiedBy: 'me' };
    manifest.publisher.verified = true;
    const res = await call('PUT', '/api/marketplace/publisher/owner-tool', {
      token: 'tok-owner',
      headers: { 'x-publisher-id': 'pub-owner' },
      body: { type: 'tool', manifest },
    });
    expect(res.status).toBe(200);
    const stored = tools.get('owner-tool')!;
    expect(stored.version).toBe('2.0.0');
    expect(stored.verification.verified).toBe(false);
    expect(stored.verification.trustLevel).toBe('unverified');
    expect(stored.verification.verifiedBy).toBeUndefined();
    expect(stored.publisher.verified).toBe(false);
  });

  it('refuses an update whose manifest names a different item', async () => {
    const res = await call('PUT', '/api/marketplace/publisher/owner-tool', {
      token: 'tok-owner',
      headers: { 'x-publisher-id': 'pub-owner' },
      body: { type: 'tool', manifest: toolManifest('elsewhere', 'pub-owner', '2.0.0') },
    });
    expect(res.status).toBe(400);
    expect(tools.has('elsewhere')).toBe(false);
  });

  it('lets the owner submit, stamping the publisher from their record', async () => {
    const manifest = toolManifest('fresh-tool', 'pub-owner');
    manifest.verification = { trustLevel: 'verified', verified: true };
    const res = await call('POST', '/api/marketplace/publisher/submit', {
      token: 'tok-owner',
      body: { type: 'tool', manifest },
    });
    expect(res.status).toBe(200);
    const stored = tools.get('fresh-tool')!;
    expect(stored.publisher).toMatchObject({
      id: 'pub-owner',
      name: 'Owner',
      email: 'owner@example.com',
      verified: false,
    });
    expect(stored.verification.verified).toBe(false);
  });

  it('does not treat an anonymous account as a publisher, even one linked earlier', async () => {
    const res = await call('POST', '/api/marketplace/publisher/submit', {
      token: 'tok-anon',
      headers: { 'x-publisher-id': 'pub-shared' },
      body: { type: 'tool', manifest: toolManifest('anon-tool', 'pub-shared') },
    });
    expect(res.status).toBe(401);
    expect(tools.has('anon-tool')).toBe(false);
  });

  it('refuses payouts to a request that only carries x-publisher-id', async () => {
    const res = await call('GET', '/api/marketplace/billing/payouts', {
      headers: { 'x-publisher-id': 'pub-owner' },
    });
    expect(res.status).toBe(401);
  });

  it("returns the owner's payouts to the owner", async () => {
    const res = await call('GET', '/api/marketplace/billing/payouts', { token: 'tok-owner' });
    expect(res.status).toBe(200);
    expect((await res.json()).totalCount).toBe(1);
  });
});

/**
 * Marketplace admin and publisher identity come from the verified token.
 *
 * The admin routes accepted any request carrying an x-admin-id header, and the
 * publisher routes took the publisher from x-publisher-id. Both are client
 * claims. Admin now requires the shared requireAdmin (Firebase admin claim or
 * admin API key); the publisher is the record linked to the caller's verified,
 * non-anonymous Firebase uid, re-checked on every request against a verified
 * email equal to the record's; publisher writes can never mark an item
 * verified; an id owned by another publisher in either store (tool or agent)
 * is refused; an admin approves only the current submission of the current
 * content.
 *
 * Real HTTP, real routes, auth middleware and publisher resolution. Firebase
 * token verification, Firestore, the registry, the review queue's storage and
 * email are fakes.
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
      'tok-owner': { uid: 'uid-owner', email: 'Owner@Example.com', claims: {} },
      'tok-other': { uid: 'uid-other', email: 'other@example.com', claims: {} },
      'tok-anon': { uid: 'uid-anon', claims: {}, isAnonymous: true, emailVerified: false },
      // Anonymous, yet carrying a verified email equal to its publisher's: only the
      // anonymous check can refuse it
      'tok-anon-verified': {
        uid: 'uid-anon-verified',
        email: 'anonv@example.com',
        isAnonymous: true,
        claims: {},
      },
      // Linked earlier, but the email was never verified / is someone else's
      'tok-owner-unverified': {
        uid: 'uid-owner',
        email: 'owner@example.com',
        emailVerified: false,
        claims: {},
      },
      'tok-owner-other-email': { uid: 'uid-owner', email: 'mallory@example.com', claims: {} },
    };
    const user = users[token];
    return user ? { emailVerified: true, isAnonymous: false, ...user } : null;
  }),
}));

// The publishers collection, keyed by doc id (Firestore fake)
const publishers = vi.hoisted(
  () =>
    new Map<string, Record<string, unknown>>([
      [
        'pub-owner',
        { email: 'owner@example.com', name: 'Owner', verified: false, firebaseUid: 'uid-owner' },
      ],
      [
        'pub-other',
        { email: 'other@example.com', name: 'Other', verified: false, firebaseUid: 'uid-other' },
      ],
      // An anonymous uid that was linked to a publisher before linking was fixed
      ['pub-shared', { email: '', name: 'Developer', verified: false, firebaseUid: 'uid-anon' }],
      [
        'pub-anonv',
        {
          email: 'anonv@example.com',
          name: 'AnonV',
          verified: false,
          firebaseUid: 'uid-anon-verified',
        },
      ],
    ])
);
vi.mock('@google-cloud/firestore', () => {
  const query = (field: string, value: unknown) => ({
    limit: () => query(field, value),
    get: async () => {
      const docs = [...publishers.entries()]
        .filter(([, d]) => d[field] === value)
        .map(([id, d]) => ({ id, exists: true, data: () => d }));
      return { empty: docs.length === 0, docs, size: docs.length };
    },
  });
  class Firestore {
    collection() {
      return { where: (f: string, _op: string, v: unknown) => query(f, v) };
    }
  }
  return { Firestore };
});

type Item = {
  id: string;
  name: string;
  version: string;
  publisher: { id: string; name: string; email?: string; verified: boolean };
  verification: { trustLevel: string; verified: boolean; verifiedAt?: string; verifiedBy?: string };
  [k: string]: unknown;
};
const tools = vi.hoisted(() => new Map<string, Item>());
const agents = vi.hoisted(() => new Map<string, Item>());
vi.mock('../../marketplace/index.js', () => ({
  getTool: (id: string) => tools.get(id),
  getAgent: (id: string) => agents.get(id),
  listTools: () => [...tools.values()],
  listAgents: () => [...agents.values()],
  listInstallations: () => [],
  getExecutionHistory: () => [],
  registerTool: (m: Item) => {
    tools.set(m.id, structuredClone(m));
    return { success: true };
  },
  registerAgent: (m: Item) => {
    agents.set(m.id, structuredClone(m));
    return { success: true };
  },
}));

// Real content hashing; the submissions store is a map of the open submission per item
const openSubmissions = vi.hoisted(() => new Map<string, { id: string; contentHash: string }>());
vi.mock('../review-queue.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../review-queue.js')>()),
  submitForReview: vi.fn(async () => ({
    id: 'sub-1',
    status: 'pending_review',
    automatedChecks: { passedValidation: true },
  })),
  getOpenSubmission: vi.fn(async (itemId: string) => openSubmissions.get(itemId) ?? null),
  getReviewHistory: vi.fn(async () => []),
  getReviewQueue: vi.fn(async () => []),
  assignReviewer: vi.fn(),
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

const { manifestContentHash } = await import('../review-content-hash.js');
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
  agents.clear();
  openSubmissions.clear();
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

  it('lets a verified admin approve the current submission, recording the admin uid', async () => {
    const hash = manifestContentHash(tools.get('owner-tool') as never);
    openSubmissions.set('owner-tool', { id: 'sub-now', contentHash: hash });
    const res = await call('POST', approve, {
      token: 'tok-admin',
      body: { submissionId: 'sub-now' },
    });
    expect(res.status).toBe(200);
    const item = tools.get('owner-tool')!;
    expect(item.verification.verified).toBe(true);
    expect(item.verification.verifiedBy).toBe('admin-1');
  });

  it('refuses to approve content that changed after the reviewed submission', async () => {
    // The reviewer looked at version 1; the publisher has since replaced it
    const reviewed = manifestContentHash(tools.get('owner-tool') as never);
    tools.set('owner-tool', {
      ...toolManifest('owner-tool', 'pub-owner', '2.0.0'),
      name: 'swapped',
    });
    openSubmissions.set('owner-tool', { id: 'sub-old', contentHash: reviewed });
    const res = await call('POST', approve, {
      token: 'tok-admin',
      body: { submissionId: 'sub-old' },
    });
    expect(res.status).toBe(409);
    expect(tools.get('owner-tool')!.verification.verified).toBe(false);
  });

  it('refuses to approve a superseded submission', async () => {
    const hash = manifestContentHash(tools.get('owner-tool') as never);
    openSubmissions.set('owner-tool', { id: 'sub-new', contentHash: hash });
    const res = await call('POST', approve, {
      token: 'tok-admin',
      body: { submissionId: 'sub-old' },
    });
    expect(res.status).toBe(409);
    expect(tools.get('owner-tool')!.verification.verified).toBe(false);
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
    expect(res.status).toBe(403);
    expect(tools.has('anon-tool')).toBe(false);
  });

  it('refuses an anonymous account even with a verified email matching its publisher', async () => {
    const res = await call('GET', '/api/marketplace/billing/payouts', {
      token: 'tok-anon-verified',
    });
    expect(res.status).toBe(403);
  });

  // The victim's item sits only in the OTHER store, so each direction of the
  // cross-store check is exercised on its own
  it("refuses an agent submission whose id is another publisher's tool", async () => {
    tools.set('victim-tool', toolManifest('victim-tool', 'pub-other'));
    const res = await call('POST', '/api/marketplace/publisher/submit', {
      token: 'tok-owner',
      body: {
        type: 'agent',
        manifest: { ...toolManifest('victim-tool', 'pub-owner'), displayName: 'Mine' },
      },
    });
    expect(res.status).toBe(403);
    expect(agents.has('victim-tool')).toBe(false);
  });

  it("refuses a tool submission whose id is another publisher's agent", async () => {
    agents.set('victim-agent', toolManifest('victim-agent', 'pub-other'));
    const res = await call('POST', '/api/marketplace/publisher/submit', {
      token: 'tok-owner',
      body: { type: 'tool', manifest: toolManifest('victim-agent', 'pub-owner') },
    });
    expect(res.status).toBe(403);
    expect(tools.has('victim-agent')).toBe(false);
  });

  it("refuses a tool owner writing another publisher's agent with the same id", async () => {
    tools.set('shared-id', toolManifest('shared-id', 'pub-owner'));
    agents.set('shared-id', toolManifest('shared-id', 'pub-other'));
    const res = await call('POST', '/api/marketplace/publisher/submit', {
      token: 'tok-owner',
      body: {
        type: 'agent',
        manifest: { ...toolManifest('shared-id', 'pub-owner', '2.0.0'), displayName: 'Mine' },
      },
    });
    expect(res.status).toBe(403);
    expect(agents.get('shared-id')!.publisher.id).toBe('pub-other');
    expect(agents.get('shared-id')!.version).toBe('1.0.0');
  });

  it('refuses a publisher whose link came from an unverified email', async () => {
    const res = await call('GET', '/api/marketplace/billing/payouts', {
      token: 'tok-owner-unverified',
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/re-link/i);
  });

  it("refuses a token whose verified email is not the publisher's", async () => {
    const res = await call('PUT', '/api/marketplace/publisher/owner-tool', {
      token: 'tok-owner-other-email',
      body: { type: 'tool', manifest: toolManifest('owner-tool', 'pub-owner', '2.0.0') },
    });
    expect(res.status).toBe(403);
    expect(tools.get('owner-tool')!.version).toBe('1.0.0');
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

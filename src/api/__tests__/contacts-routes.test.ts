/**
 * Contacts Routes API Tests
 *
 * Covers DELETE /api/contacts/:id (owner only) and the service-level
 * deleteContact() ownership scoping.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';

// ============================================================================
// MOCKS
// ============================================================================

const mockDeleteContact = vi.fn();

vi.mock('../auth-middleware.js', () => ({
  rateLimit: vi.fn(() => false),
  requireAuth: vi.fn(async (req: IncomingMessage, res: ServerResponse) => {
    const userId = req.headers['x-test-auth-uid'] as string | undefined;
    if (!userId) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return null;
    }
    return { userId, isAdmin: false, isDevMode: false, authMethod: 'firebase' };
  }),
}));

vi.mock('../../services/contacts/contact-relationship-service.js', () => ({
  getContacts: vi.fn(),
  getContact: vi.fn(),
  upsertContact: vi.fn(),
  deleteContact: (...args: unknown[]) => mockDeleteContact(...args),
  recordInteraction: vi.fn(),
  getContactsNeedingAttention: vi.fn(),
  getRelationshipInsights: vi.fn(),
  searchContacts: vi.fn(),
  getInteractionHistory: vi.fn(),
  getInteractionStats: vi.fn(),
  getTopicsToDiscuss: vi.fn(),
}));

vi.mock('../../services/contacts/contact-groups.js', () => ({
  getGroups: vi.fn(),
  getGroup: vi.fn(),
  createGroup: vi.fn(),
  updateGroup: vi.fn(),
  deleteGroup: vi.fn(),
}));

vi.mock('../../services/contacts/outreach-nudges.js', () => ({
  buildNudgeContext: vi.fn(),
  getOverdueFrequentContacts: vi.fn(),
}));

// Firestore + semantic hooks for the service-level tests (importActual)
const mockDocDelete = vi.fn().mockResolvedValue(undefined);
const mockDoc = vi.fn(() => ({ delete: mockDocDelete, set: vi.fn() }));
const storedContacts = [
  {
    id: 'contact_alice_1',
    userId: 'alice',
    contactId: 'sam@example.com',
    name: 'Sam',
    topics: [],
    recentContext: [],
    lastInteraction: new Date(),
    firstInteraction: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

vi.mock('@google-cloud/firestore', () => ({
  Firestore: class {
    collection(): unknown {
      const query = {
        _userId: '',
        where(_field: string, _op: string, value: string) {
          query._userId = value;
          return query;
        },
        orderBy() {
          return query;
        },
        async get() {
          const docs = storedContacts
            .filter((c) => c.userId === query._userId)
            .map((c) => ({ id: c.id, data: () => c }));
          return { empty: docs.length === 0, docs };
        },
        doc: mockDoc,
      };
      return query;
    }
  },
}));

vi.mock('../../services/data-layer/hooks/contacts-hooks.js', () => ({
  onContactChange: vi.fn(),
  onContactInteractionChange: vi.fn(),
}));

// ============================================================================
// HELPERS
// ============================================================================

interface MockResponse extends ServerResponse {
  _status: number;
  _body: string;
}

function createRequest(method: string, url: string, uid?: string): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = uid ? { 'x-test-auth-uid': uid } : {};
  return req;
}

function createResponse(): MockResponse {
  const res = new EventEmitter() as MockResponse;
  res._status = 200;
  res._body = '';
  res.setHeader = vi.fn() as unknown as MockResponse['setHeader'];
  res.writeHead = vi.fn((status: number) => {
    res._status = status;
    return res;
  }) as unknown as MockResponse['writeHead'];
  res.end = vi.fn((body?: string) => {
    res._body = body ?? '';
    return res;
  }) as unknown as MockResponse['end'];
  return res;
}

async function call(method: string, path: string, uid?: string): Promise<MockResponse> {
  const { handleContactsRoutes } = await import('../contacts-routes.js');
  const req = createRequest(method, path, uid);
  const res = createResponse();
  const url = new URL(`http://localhost${path}`);
  await handleContactsRoutes(req, res, url.pathname, url);
  return res;
}

// ============================================================================
// TESTS
// ============================================================================

describe('DELETE /api/contacts/:id', () => {
  beforeEach(() => {
    mockDeleteContact.mockReset();
  });

  it('requires authentication', async () => {
    const res = await call('DELETE', '/api/contacts/contact_1');
    expect(res._status).toBe(401);
    expect(mockDeleteContact).not.toHaveBeenCalled();
  });

  it('deletes the contact for the verified user', async () => {
    mockDeleteContact.mockResolvedValue(true);
    const res = await call('DELETE', '/api/contacts/contact_1', 'alice');
    expect(res._status).toBe(200);
    expect(JSON.parse(res._body)).toEqual({ deleted: true });
    expect(mockDeleteContact).toHaveBeenCalledWith('alice', 'contact_1');
  });

  it('ignores a spoofed userId query param', async () => {
    mockDeleteContact.mockResolvedValue(true);
    await call('DELETE', '/api/contacts/contact_1?userId=mallory', 'alice');
    expect(mockDeleteContact).toHaveBeenCalledWith('alice', 'contact_1');
  });

  it('returns 404 when the user has no such contact', async () => {
    mockDeleteContact.mockResolvedValue(false);
    const res = await call('DELETE', '/api/contacts/someone-elses', 'alice');
    expect(res._status).toBe(404);
  });

  it('returns 500 when deletion fails', async () => {
    mockDeleteContact.mockRejectedValue(new Error('firestore down'));
    const res = await call('DELETE', '/api/contacts/contact_1', 'alice');
    expect(res._status).toBe(500);
  });
});

describe('deleteContact service', () => {
  type Service = typeof import('../../services/contacts/contact-relationship-service.js');

  beforeEach(() => {
    mockDocDelete.mockClear();
    mockDoc.mockClear();
  });

  it("refuses to delete another user's contact", async () => {
    const svc = await vi.importActual<Service>(
      '../../services/contacts/contact-relationship-service.js'
    );
    svc.clearCache();
    expect(await svc.deleteContact('mallory', 'contact_alice_1')).toBe(false);
    expect(mockDocDelete).not.toHaveBeenCalled();
  });

  it("deletes the owner's contact from Firestore and the cache", async () => {
    const svc = await vi.importActual<Service>(
      '../../services/contacts/contact-relationship-service.js'
    );
    svc.clearCache();
    expect(await svc.deleteContact('alice', 'sam@example.com')).toBe(true);
    expect(mockDoc).toHaveBeenCalledWith('contact_alice_1');
    expect(mockDocDelete).toHaveBeenCalledTimes(1);
    expect(await svc.getContact('alice', 'contact_alice_1')).toBeNull();
  });
});

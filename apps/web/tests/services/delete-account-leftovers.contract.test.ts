/**
 * Contract: when DELETE /api/account deletes the account but couldn't remove
 * some linked records, the server says so in details.failures and the web
 * tells the user. It must not show a plain "deleted" success.
 *
 * The server half is the REAL route handler (src/api/account-routes.ts), with
 * its token verifier, data sweep, Firebase deletion and Firestore stubbed so
 * that the Apple-owner sweep fails. Its real JSON body is then served to the
 * REAL web client (dataExportService.deleteAccount).
 */
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';

// ---- server-side stubs (external services only) ----
vi.mock('../../../../src/api/auth-middleware.js', () => ({
  requireAuth: vi.fn(async () => ({
    userId: 'uid-1',
    firebaseUid: 'uid-1',
    isAdmin: false,
    authMethod: 'firebase',
  })),
  rateLimit: vi.fn(() => false),
}));
vi.mock('../../../../src/services/data-export.js', () => ({
  getDataExportService: () => ({ deleteAllData: vi.fn(async () => undefined) }),
}));
vi.mock('../../../../src/services/identity/firebase-auth.js', () => ({
  deleteFirebaseUser: vi.fn(async () => true),
  getFirebaseUser: vi.fn(),
}));
vi.mock('../../../../src/services/security-events.js', () => ({
  recordSecurityEvent: vi.fn(async () => undefined),
}));
vi.mock('../../../../src/memory/index.js', () => ({ getDefaultStore: vi.fn() }));
vi.mock('../../../../src/utils/firestore-utils.js', () => {
  const empty = { get: async () => ({ empty: true, size: 0, docs: [] }) };
  return {
    getFirestoreDb: () => ({
      collection: (name: string) => ({
        where: () =>
          name === 'apple_transaction_owners'
            ? {
                get: async () => {
                  throw new Error('firestore down');
                },
              }
            : empty,
      }),
      doc: () => ({ delete: async () => undefined }),
    }),
  };
});

// ---- web-side stubs ----
const signOut = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../../src/services/firebase-auth.service.js', () => ({
  initAuth: vi.fn(async () => ({})),
  getAuthToken: vi.fn(async () => 'id-token'),
  getFirebaseUid: vi.fn(() => 'uid-1'),
  signOut,
}));
vi.mock('../../src/services/push-preference.js', () => ({ signOutReleasingPush: signOut }));
vi.mock('../../src/services/rituals.service.js', () => ({
  ritualsService: { clearAll: vi.fn() },
}));

const { handleAccountRoutes } = await import('../../../../src/api/account-routes.js');
const { dataExportService } = await import('../../src/services/data-export.service.js');

/** Run the real server route and capture its status and JSON body. */
async function serverDelete(): Promise<{ status: number; body: string }> {
  const req = new EventEmitter() as IncomingMessage;
  req.method = 'DELETE';
  req.url = '/api/account';
  req.headers = { authorization: 'Bearer id-token' };
  (req as unknown as { socket: unknown }).socket = { remoteAddress: '127.0.0.1' };
  setTimeout(() => {
    req.emit('data', Buffer.from(JSON.stringify({ confirmation: 'DELETE_MY_ACCOUNT' })));
    req.emit('end');
  }, 0);
  const out = { status: 200, body: '' };
  const res = {
    setHeader: vi.fn(),
    writeHead: vi.fn((s: number) => {
      out.status = s;
    }),
    end: vi.fn((data?: string) => {
      out.body = data ?? '';
    }),
  } as unknown as ServerResponse;
  await handleAccountRoutes(req, res, '/api/account');
  return out;
}

describe('DELETE /api/account leftovers reach the user', () => {
  it('the web turns the real server body with failures into a notice', async () => {
    const served = await serverDelete();
    expect(served.status).toBe(200);
    globalThis.fetch = vi.fn(
      async () => new Response(served.body, { status: served.status })
    ) as typeof fetch;

    const notice = await dataExportService.deleteAccount();

    expect(notice).toMatch(/didn't clear/);
    expect(signOut).toHaveBeenCalled();
  });
});

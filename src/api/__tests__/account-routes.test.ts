/**
 * DELETE /api/account must erase every data store for the VERIFIED caller and
 * close their Firebase sign-in, and must not claim success when either fails.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';

const { mockDeleteAllData, mockDeleteFirebaseUser } = vi.hoisted(() => ({
  mockDeleteAllData: vi.fn(),
  mockDeleteFirebaseUser: vi.fn(),
}));

vi.mock('../auth-middleware.js', () => ({
  requireAuth: vi.fn(async (req: IncomingMessage, res: ServerResponse) => {
    const header = req.headers.authorization;
    const match = typeof header === 'string' ? header.match(/^Bearer verified-(.+)$/) : null;
    if (!match) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return null;
    }
    return { userId: match[1], firebaseUid: match[1], isAdmin: false, authMethod: 'firebase' };
  }),
  rateLimit: vi.fn(() => false),
}));

vi.mock('../../services/data-export.js', () => ({
  getDataExportService: () => ({ deleteAllData: mockDeleteAllData }),
}));

vi.mock('../../services/identity/firebase-auth.js', () => ({
  deleteFirebaseUser: mockDeleteFirebaseUser,
  getFirebaseUser: vi.fn(),
}));

vi.mock('../../services/security-events.js', () => ({
  recordSecurityEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../memory/index.js', () => ({ getDefaultStore: vi.fn() }));

function deleteRequest(body: unknown, headers: Record<string, string> = {}): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.method = 'DELETE';
  req.url = '/api/account';
  req.headers = { authorization: 'Bearer verified-user-123', ...headers };
  (req as unknown as { socket: unknown }).socket = { remoteAddress: '127.0.0.1' };
  setTimeout(() => {
    req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  }, 0);
  return req;
}

function response(): ServerResponse & { status: number; body: () => Record<string, unknown> } {
  let raw = '';
  const res = {
    status: 0,
    writeHead: vi.fn(function (this: { status: number }, status: number) {
      this.status = status;
    }),
    setHeader: vi.fn(),
    end: vi.fn((data?: string) => {
      raw = data ?? '';
    }),
    body: () => JSON.parse(raw || '{}') as Record<string, unknown>,
  };
  return res as unknown as ServerResponse & { status: number; body: () => Record<string, unknown> };
}

describe('DELETE /api/account', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteAllData.mockResolvedValue(undefined);
    mockDeleteFirebaseUser.mockResolvedValue(true);
  });

  it('erases all data stores and the sign-in for the verified caller', async () => {
    const { handleAccountRoutes } = await import('../account-routes.js');
    const res = response();

    await handleAccountRoutes(
      deleteRequest({ confirmation: 'DELETE_MY_ACCOUNT' }),
      res,
      '/api/account'
    );

    expect(mockDeleteAllData).toHaveBeenCalledWith('user-123');
    expect(mockDeleteFirebaseUser).toHaveBeenCalledWith('user-123');
    expect(res.status).toBe(200);
    expect(res.body().success).toBe(true);
  });

  it('ignores a spoofed identity header and needs a verified token', async () => {
    const { handleAccountRoutes } = await import('../account-routes.js');
    const res = response();
    const req = deleteRequest(
      { confirmation: 'DELETE_MY_ACCOUNT' },
      { 'x-firebase-uid': 'victim' }
    );
    delete req.headers.authorization;

    await handleAccountRoutes(req, res, '/api/account');

    expect(res.status).toBe(401);
    expect(mockDeleteAllData).not.toHaveBeenCalled();
  });

  it('requires the explicit confirmation phrase', async () => {
    const { handleAccountRoutes } = await import('../account-routes.js');
    const res = response();

    await handleAccountRoutes(deleteRequest({}), res, '/api/account');

    expect(res.status).toBe(400);
    expect(mockDeleteAllData).not.toHaveBeenCalled();
  });

  it('reports failure, and keeps the sign-in, when erasing data fails', async () => {
    mockDeleteAllData.mockRejectedValue(new Error('firestore down'));
    const { handleAccountRoutes } = await import('../account-routes.js');
    const res = response();

    await handleAccountRoutes(
      deleteRequest({ confirmation: 'DELETE_MY_ACCOUNT' }),
      res,
      '/api/account'
    );

    expect(res.status).toBe(500);
    expect(mockDeleteFirebaseUser).not.toHaveBeenCalled();
  });

  it('does not claim success when the sign-in could not be closed', async () => {
    mockDeleteFirebaseUser.mockResolvedValue(false);
    const { handleAccountRoutes } = await import('../account-routes.js');
    const res = response();

    await handleAccountRoutes(
      deleteRequest({ confirmation: 'DELETE_MY_ACCOUNT' }),
      res,
      '/api/account'
    );

    expect(res.status).toBe(500);
    expect(res.body().success).not.toBe(true);
  });
});

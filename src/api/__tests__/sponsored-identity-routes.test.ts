/**
 * /api/sponsored-identities must identify the sponsor from the verified token
 * (like every other authenticated route), not from an x-firebase-uid header
 * that no client sets and any client could forge.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';

const svc = vi.hoisted(() => ({
  getSponsoredIdentities: vi.fn(),
  getPendingIdentities: vi.fn(),
  approveSelfRegisteredIdentity: vi.fn(),
}));

vi.mock('../../services/identity/sponsored-identity.js', () => ({
  createSponsoredIdentity: vi.fn(),
  getSponsoredIdentity: vi.fn(),
  getSponsoredIdentities: svc.getSponsoredIdentities,
  updateSponsoredIdentity: vi.fn(),
  deleteSponsoredIdentity: vi.fn(),
  revokeSponsoredIdentity: vi.fn(),
  getPendingIdentities: svc.getPendingIdentities,
  approveSelfRegisteredIdentity: svc.approveSelfRegisteredIdentity,
}));

vi.mock('../auth-middleware.js', () => ({
  requireAuth: vi.fn(async (req: IncomingMessage, res: ServerResponse) => {
    const header = req.headers.authorization;
    const match = typeof header === 'string' ? header.match(/^Bearer verified-(.+)$/) : null;
    if (!match) {
      res.writeHead(401);
      res.end('{"error":"Auth required"}');
      return null;
    }
    return { userId: match[1], isAdmin: match[1] === 'admin' };
  }),
}));

import { handleSponsoredIdentityRoutes } from '../sponsored-identity-routes.js';

function request(method: string, headers: Record<string, string>): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.method = method;
  req.headers = headers;
  setTimeout(() => req.emit('end'), 0);
  return req;
}

function response(): ServerResponse & { status: number; json: () => Record<string, unknown> } {
  let raw = '';
  const res = {
    status: 0,
    writeHead: vi.fn(function (this: { status: number }, status: number) {
      this.status = status;
    }),
    end: vi.fn((data?: string) => {
      raw = data ?? '';
    }),
    json: () => JSON.parse(raw || '{}') as Record<string, unknown>,
  };
  return res as unknown as ServerResponse & { status: number; json: () => Record<string, unknown> };
}

describe('sponsored identity routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    svc.getSponsoredIdentities.mockResolvedValue([]);
    svc.getPendingIdentities.mockResolvedValue([]);
  });

  it("lists the signed-in sponsor's identities from the verified token", async () => {
    const res = response();
    await handleSponsoredIdentityRoutes(
      request('GET', { authorization: 'Bearer verified-sponsor-1' }),
      res,
      '/api/sponsored-identities'
    );

    expect(res.status).toBe(200);
    expect(svc.getSponsoredIdentities).toHaveBeenCalledWith('sponsor-1');
  });

  it('rejects a forged x-firebase-uid header without a token', async () => {
    const res = response();
    await handleSponsoredIdentityRoutes(
      request('GET', { 'x-firebase-uid': 'victim' }),
      res,
      '/api/sponsored-identities'
    );

    expect(res.status).toBe(401);
    expect(svc.getSponsoredIdentities).not.toHaveBeenCalled();
  });

  it("does not show a regular user every caller's pending registration", async () => {
    const res = response();
    await handleSponsoredIdentityRoutes(
      request('GET', { authorization: 'Bearer verified-sponsor-1' }),
      res,
      '/api/sponsored-identities/pending'
    );

    expect(res.status).toBe(403);
    expect(svc.getPendingIdentities).not.toHaveBeenCalled();
  });

  it("does not let a regular user claim someone else's pending caller", async () => {
    const res = response();
    await handleSponsoredIdentityRoutes(
      request('POST', { authorization: 'Bearer verified-sponsor-1' }),
      res,
      '/api/sponsored-identities/si_123/approve'
    );

    expect(res.status).toBe(403);
    expect(svc.approveSelfRegisteredIdentity).not.toHaveBeenCalled();
  });

  it('still lets an admin review pending registrations', async () => {
    const res = response();
    await handleSponsoredIdentityRoutes(
      request('GET', { authorization: 'Bearer verified-admin' }),
      res,
      '/api/sponsored-identities/pending'
    );

    expect(res.status).toBe(200);
  });
});

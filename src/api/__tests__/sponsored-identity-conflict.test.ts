/**
 * Adding a family member whose number is already set up answers 409, not 500.
 *
 * A phone number maps to one identity (so calls can be recognised), so a
 * second sponsor adding it is a normal conflict. It used to come back as a
 * 500 carrying the raw error text, so the app could only say "couldn't add",
 * and any unexpected error's internal message went to the client too.
 */
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import { describe, expect, it, vi } from 'vitest';
import { PhoneInUseError } from '../../services/identity/phone-in-use-error.js';
import { handleSponsoredIdentityRoutes } from '../sponsored-identity-routes.js';

// A plain function, not vi.fn: what it throws is the route's to handle, not the mock's to record
const create = vi.hoisted(() => ({ impl: async (): Promise<unknown> => ({}) }));
vi.mock('../../services/identity/sponsored-identity.js', () => ({
  createSponsoredIdentity: () => create.impl(),
  getSponsoredIdentity: vi.fn(),
  getSponsoredIdentities: vi.fn(),
  updateSponsoredIdentity: vi.fn(),
  deleteSponsoredIdentity: vi.fn(),
  revokeSponsoredIdentity: vi.fn(),
  getPendingIdentities: vi.fn(),
  approveSelfRegisteredIdentity: vi.fn(),
}));
vi.mock('../auth-middleware.js', () => ({
  requireAuth: vi.fn(async () => ({ userId: 'sponsor-1', isAdmin: false })),
}));


function post(body: unknown): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.method = 'POST';
  req.headers = { authorization: 'Bearer token', 'content-type': 'application/json' };
  setTimeout(() => {
    req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  }, 0);
  return req;
}

function response() {
  let raw = '';
  const res = {
    status: 0,
    setHeader: vi.fn(),
    writeHead: vi.fn(function (this: { status: number }, status: number) {
      this.status = status;
    }),
    end: vi.fn((data?: string) => void (raw = data ?? '')),
    body: () => raw,
  };
  return res as unknown as ServerResponse & { status: number; body: () => string };
}

const member = { displayName: 'Aunt Robin', phoneNumber: '+15550100199', relationship: 'friend' };

describe('adding a family member', () => {

  it('answers 409 phone_in_use when the number already belongs to an identity', async () => {
    create.impl = async () => {
      throw new PhoneInUseError('+15550100199');
    };
    const res = response();
    await handleSponsoredIdentityRoutes(post(member), res, '/api/sponsored-identities');
    expect(res.status).toBe(409);
    expect(res.body()).toContain('phone_in_use');
  });

  it('answers a plain 500 for anything unexpected, without its internal message', async () => {
    create.impl = async () => {
      throw new Error('Firestore index users_by_phone is missing');
    };
    const res = response();
    await handleSponsoredIdentityRoutes(post(member), res, '/api/sponsored-identities');
    expect(res.status).toBe(500);
    expect(res.body()).not.toContain('Firestore');
  });
});

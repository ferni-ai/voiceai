/**
 * A sponsor's edit (PUT /api/sponsored-identities/:id) changes only the editable
 * fields. It used to spread the request body over the stored record, so a sponsor
 * could forge phoneVerifiedAt (a verifier marked a number verified with zero texts),
 * hand the identity to another account via sponsorUserId, rewrite its id, or
 * un-revoke it. These drive the real route and the real service (Firestore off, so
 * the service's cache is the store).
 */
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/firebase-admin-app.js', () => ({
  getAdminFirestore: () => {
    throw new Error('no Firestore in this test');
  },
}));
vi.mock('../auth-middleware.js', () => ({
  rateLimit: () => false, // never limited here
  requireAuth: vi.fn(async () => ({ userId: 'sponsor-1', isAdmin: false })),
}));

import { handleSponsoredIdentityRoutes } from '../sponsored-identity-routes.js';
import {
  clearCaches,
  createSponsoredIdentity,
  getSponsoredIdentity,
  type SponsoredIdentity,
} from '../../services/identity/sponsored-identity.js';

function put(body: unknown): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.method = 'PUT';
  req.headers = { authorization: 'Bearer token', 'content-type': 'application/json' };
  setTimeout(() => {
    req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  }, 0);
  return req;
}

async function edit(
  id: string,
  body: unknown
): Promise<{ status: number; json: Record<string, unknown> }> {
  let raw = '';
  const res = {
    status: 0,
    writeHead: vi.fn(function (this: { status: number }, status: number) {
      this.status = status;
    }),
    end: vi.fn((data?: string) => void (raw = data ?? '')),
  };
  await handleSponsoredIdentityRoutes(put(body), res as never, `/api/sponsored-identities/${id}`);
  return { status: res.status, json: JSON.parse(raw || '{}') as Record<string, unknown> };
}

let mom: SponsoredIdentity;

async function stored(): Promise<SponsoredIdentity & Record<string, unknown>> {
  return (await getSponsoredIdentity(mom.id)) as SponsoredIdentity & Record<string, unknown>;
}

beforeEach(async () => {
  clearCaches();
  mom = await createSponsoredIdentity('sponsor-1', {
    displayName: 'Mom',
    phoneNumber: '+16175550123',
    relationship: 'mother',
  });
});

describe('a sponsor editing a sponsored identity', () => {
  it.each([
    ['phoneVerifiedAt', { phoneVerifiedAt: '2026-10-25T00:00:00.000Z' }],
    ['sponsorUserId', { sponsorUserId: 'someone-else' }],
    ['id', { id: 'sponsored_other' }],
    ['voiceEnrolled beside an editable field', { displayName: 'Mama', voiceEnrolled: true }],
  ])('refuses a field that is not editable and applies nothing: %s', async (_field, body) => {
    const before = { ...(await stored()) };

    const { status, json } = await edit(mom.id, body);

    expect(status).toBe(400);
    expect(json.error).toBe('invalid_update');
    const after = await stored();
    expect(after.phoneVerifiedAt).toBeUndefined();
    expect(after.sponsorUserId).toBe('sponsor-1');
    expect(after.id).toBe(mom.id);
    expect(after.displayName).toBe(before.displayName);
    expect(after.voiceEnrolled).toBe(false);
  });

  it.each([
    ['an unknown relationship', { relationship: 'boss' }],
    ['an unknown accessLevel', { accessLevel: 'admin' }],
    ['an unknown status', { status: 'deleted' }],
    ['an 81-character displayName', { displayName: 'x'.repeat(81) }],
    ['a blank displayName', { displayName: '   ' }],
    ['a numeric displayName', { displayName: 42 }],
    ['2001-character notes', { notes: 'n'.repeat(2001) }],
    ['allowedPersonas that is not a list', { allowedPersonas: 'ferni' }],
    ['an empty persona id', { allowedPersonas: [''] }],
  ])('refuses %s', async (_case, body) => {
    const { status } = await edit(mom.id, body);

    expect(status).toBe(400);
    const after = await stored();
    expect(after.relationship).toBe('mother');
    expect(after.displayName).toBe('Mom');
    expect(after.notes).toBeUndefined();
  });

  it('still applies a normal edit (what the web app sends)', async () => {
    const { status, json } = await edit(mom.id, {
      displayName: 'Barbara',
      relationship: 'parent',
      preferredName: 'Barb',
      notes: 'Prefers morning calls',
    });

    expect(status).toBe(200);
    expect((json.identity as Record<string, unknown>).displayName).toBe('Barbara');
    const after = await stored();
    expect(after).toMatchObject({
      displayName: 'Barbara',
      relationship: 'parent',
      preferredName: 'Barb',
      notes: 'Prefers morning calls',
    });
  });

  it('lets a sponsor pause and resume an identity', async () => {
    expect((await edit(mom.id, { status: 'suspended' })).status).toBe(200);
    expect((await stored()).status).toBe('suspended');
    expect((await edit(mom.id, { status: 'active' })).status).toBe(200);
    expect((await stored()).status).toBe('active');
  });

  it.each([
    { from: 'revoked', to: 'active' },
    { from: 'revoked', to: 'suspended' },
    { from: 'pending', to: 'active' },
    { from: 'active', to: 'pending' },
    { from: 'active', to: 'revoked' },
    { from: 'suspended', to: 'revoked' },
  ] as const)('refuses a status move from $from to $to', async ({ from, to }) => {
    (await stored()).status = from;

    const { status } = await edit(mom.id, { status: to });

    expect(status).toBe(400);
    expect((await stored()).status).toBe(from);
  });
});

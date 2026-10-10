/**
 * PUT /api/contacts/:id saves only what a person may edit, and an emptied field is removed.
 *
 * The route used to spread the request body over the stored contact: a `userId` in the
 * body moved the contact into someone else's list, scores could be set at will, and the
 * edit form could never clear a phone number or a note.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';

const { upsertContact } = vi.hoisted(() => ({
  upsertContact: vi.fn(async (_userId: string, contact: Record<string, unknown>) => contact),
}));

vi.mock('../api/auth-middleware.js', () => ({
  requireAuth: vi.fn(async () => ({ userId: 'u1', isAdmin: false })),
  rateLimit: vi.fn(() => false),
}));

vi.mock('../services/contacts/contact-relationship-service.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    getContact: vi.fn(async () => ({
      id: 'doc1',
      contactId: 'c1',
      userId: 'u1',
      name: 'Priya Raman',
      phone: '+15555550123',
      notes: 'Met at the climbing gym',
      strengthScore: 50,
    })),
    upsertContact,
  };
});

import { handleContactsRoutes } from '../api/contacts-routes.js';

async function put(body: unknown): Promise<number> {
  const req = new EventEmitter() as IncomingMessage;
  req.method = 'PUT';
  req.headers = { 'x-firebase-uid': 'u1' };
  let status = 200;
  const res = {
    writeHead: vi.fn((code: number) => {
      status = code;
    }),
    setHeader: vi.fn(),
    end: vi.fn(),
  } as unknown as ServerResponse;
  setTimeout(() => {
    req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  }, 0);
  await handleContactsRoutes(req, res, '/api/contacts/c1', new URL('http://localhost/api/contacts/c1'));
  return status;
}

describe('PUT /api/contacts/:id', () => {
  beforeEach(() => upsertContact.mockClear());

  it('an emptied phone and note are removed', async () => {
    expect(await put({ name: 'Priya Raman', phone: '', notes: '' })).toBe(200);
    const saved = upsertContact.mock.calls[0][1];
    expect(saved).toHaveProperty('phone', undefined);
    expect(saved).toHaveProperty('notes', undefined);
  });

  it("can't change the owner, the scores or the document", async () => {
    await put({ notes: 'still friends', userId: 'someone-else', strengthScore: 100, id: 'other-doc' });
    const [owner, saved] = upsertContact.mock.calls[0];
    expect(owner).toBe('u1');
    expect(saved).toMatchObject({ userId: 'u1', strengthScore: 50, id: 'doc1', notes: 'still friends' });
  });

  it('a blank name is refused, and nothing is saved', async () => {
    expect(await put({ name: '  ' })).toBe(400);
    expect(upsertContact).not.toHaveBeenCalled();
  });
});

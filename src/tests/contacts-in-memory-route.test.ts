/**
 * PUT /api/contacts/:id never saves an `inMemory` field a client sends (the
 * CONTACT_IN_MEMORY experiment was removed on 2026-10-31); the rest of the edit
 * is saved. The real route and the real contact store run; only Firestore and
 * auth are faked.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';

vi.mock('@google-cloud/firestore', () => ({
  Firestore: vi.fn().mockImplementation(() => ({
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({ exists: false, data: () => null }),
        set: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
      }),
      where: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({ docs: [] }),
    }),
  })),
}));

vi.mock('../api/auth-middleware.js', () => ({
  requireAuth: vi.fn(async (req: IncomingMessage) => ({
    userId: req.headers['x-firebase-uid'],
    isAdmin: false,
  })),
  rateLimit: vi.fn(() => false),
}));

// Nobody here was saved by the voice agent, so the second store is empty
vi.mock('../services/contacts/saved-contact-edits.js', () => ({
  editSavedContact: vi.fn(async () => null),
}));

import { handleContactsRoutes } from '../api/contacts-routes.js';
import {
  clearCache,
  getContact,
  upsertContact,
} from '../services/contacts/contact-relationship-service.js';

async function put(uid: string, body: unknown): Promise<number> {
  const req = new EventEmitter() as IncomingMessage;
  req.method = 'PUT';
  req.headers = { 'x-firebase-uid': uid };
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
  const url = new URL('http://localhost/api/contacts/dad');
  await handleContactsRoutes(req, res, url.pathname, url);
  return status;
}

beforeEach(async () => {
  clearCache();
  await upsertContact('owner', { name: 'Dad', contactId: 'dad', relationship: 'family' });
});

describe('PUT /api/contacts/:id inMemory', () => {
  it('saves the rest of the edit and ignores the field', async () => {
    expect(await put('owner', { notes: 'loved tomatoes', inMemory: true })).toBe(200);
    const dad = await getContact('owner', 'dad');
    expect(dad?.notes).toBe('loved tomatoes');
    expect((dad as Record<string, unknown> | null)?.inMemory).toBeUndefined();
  });
});

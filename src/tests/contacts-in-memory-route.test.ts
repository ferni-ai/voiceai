/**
 * PUT /api/contacts/:id lets the owner mark someone in memory, and undo it
 * (CONTACT_IN_MEMORY). The server stamps when it was marked. Another account
 * can't mark someone else's contact, and with the flag off the field is never
 * saved. The real route and the real contact store run; only Firestore and auth
 * are faked.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

afterEach(() => vi.unstubAllEnvs());

describe('PUT /api/contacts/:id inMemory, flag on', () => {
  beforeEach(() => vi.stubEnv('CONTACT_IN_MEMORY', 'on'));

  it('the owner marks Dad in memory with the day he passed, stamped by the server', async () => {
    const before = Date.now();
    expect(await put('owner', { inMemory: { passedOn: '2026-03-14', markedAt: 'client' } })).toBe(
      200
    );
    const dad = await getContact('owner', 'dad');
    expect(dad?.inMemory?.passedOn).toBe('2026-03-14');
    expect(Date.parse(dad?.inMemory?.markedAt ?? '')).toBeGreaterThanOrEqual(before);
  });

  it('the owner can undo it', async () => {
    await put('owner', { inMemory: true });
    expect((await getContact('owner', 'dad'))?.inMemory).toBeDefined();
    expect(await put('owner', { inMemory: null })).toBe(200);
    expect((await getContact('owner', 'dad'))?.inMemory).toBeUndefined();
  });

  it('a day in the future is refused, and nothing is saved', async () => {
    expect(await put('owner', { inMemory: { passedOn: '2999-01-01' } })).toBe(400);
    expect((await getContact('owner', 'dad'))?.inMemory).toBeUndefined();
  });

  it("another account can't mark the owner's contact", async () => {
    expect(await put('stranger', { inMemory: true })).toBe(404);
    expect((await getContact('owner', 'dad'))?.inMemory).toBeUndefined();
    expect(await getContact('stranger', 'dad')).toBeNull();
  });
});

describe('PUT /api/contacts/:id inMemory, flag off', () => {
  beforeEach(() => vi.stubEnv('CONTACT_IN_MEMORY', 'off'));

  it('saves the rest of the edit and ignores the field', async () => {
    expect(await put('owner', { notes: 'loved tomatoes', inMemory: true })).toBe(200);
    const dad = await getContact('owner', 'dad');
    expect(dad?.notes).toBe('loved tomatoes');
    expect(dad?.inMemory).toBeUndefined();
  });
});

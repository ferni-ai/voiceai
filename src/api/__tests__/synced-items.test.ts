/**
 * /api/synced/:kind keeps the caller's own copies of web-kept items (custom rituals,
 * marketplace installs) under bogle_users/{uid}, so a second device reads what the first
 * saved, a deletion reaches every device, and nobody reads anyone else's.
 * Firestore is an in-memory fake: nothing here touches a real project.
 */

import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => new Map<string, Record<string, unknown>>());

vi.mock('firebase-admin/firestore', () => {
  const collection = (path: string) => ({
    doc: (id: string) => ({
      set: async (data: Record<string, unknown>) => void store.set(`${path}/${id}`, data),
      collection: (name: string) => collection(`${path}/${id}/${name}`),
    }),
    limit: (n: number) => ({
      get: async () => ({
        docs: [...store.entries()]
          .filter(([key]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/'))
          .slice(0, n)
          .map(([key, data]) => ({ id: key.slice(path.length + 1), data: () => data })),
      }),
    }),
  });
  return { getFirestore: () => ({ collection }) };
});
vi.mock('../../services/identity/firebase-auth.js', () => ({ ensureFirebaseAdmin: () => true }));
vi.mock('../auth-middleware.js', () => ({ rateLimit: () => false }));

const { handleSyncedItemsRoutes, MAX_ITEM_CHARS } = await import('../routes/synced-items.js');

async function call(uid: string | null, method: string, path: string, body?: unknown) {
  const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)]) as unknown as IncomingMessage;
  Object.assign(req, { method, url: path, headers: uid ? { 'x-firebase-uid': uid } : {} });
  let status = 0;
  let text = '';
  const res = {
    writeHead: (s: number) => void (status = s),
    setHeader: () => undefined,
    end: (t: string) => void (text = t),
  } as unknown as ServerResponse;
  const handled = await handleSyncedItemsRoutes(req, res, path, new URL(path, 'http://local'));
  return { handled, status, body: text ? (JSON.parse(text) as Record<string, unknown>) : null };
}

const ritual = { id: 'ritual_1', name: 'Morning pages', updatedAt: '2026-10-01T08:00:00.000Z' };

beforeEach(() => store.clear());

describe('/api/synced', () => {
  it('a second device reads what the first saved, under the caller\'s own record', async () => {
    expect((await call('alice', 'GET', '/api/synced/rituals')).body).toEqual({
      items: [],
      deleted: [],
    });

    const saved = await call('alice', 'PUT', '/api/synced/rituals/ritual_1', {
      item: ritual,
      updatedAt: ritual.updatedAt,
    });
    expect(saved.body).toEqual({ ok: true, updatedAt: ritual.updatedAt });
    expect([...store.keys()]).toEqual(['bogle_users/alice/saved_rituals/ritual_1']);

    const read = await call('alice', 'GET', '/api/synced/rituals');
    expect(read.body).toEqual({ items: [ritual], deleted: [] });
  });

  it('nobody reads anyone else\'s, and no caller means 401', async () => {
    await call('alice', 'PUT', '/api/synced/rituals/ritual_1', { item: ritual });
    expect((await call('bob', 'GET', '/api/synced/rituals')).body).toEqual({
      items: [],
      deleted: [],
    });
    const anon = await call(null, 'GET', '/api/synced/rituals');
    expect(anon.status).toBe(401);
    expect(store.size).toBe(1);
  });

  it('a deletion leaves a tombstone other devices see', async () => {
    await call('alice', 'PUT', '/api/synced/rituals/ritual_1', { item: ritual });
    expect((await call('alice', 'DELETE', '/api/synced/rituals/ritual_1')).body).toEqual({
      ok: true,
    });

    const read = await call('alice', 'GET', '/api/synced/rituals');
    expect(read.body?.items).toEqual([]);
    expect(read.body?.deleted).toEqual([{ id: 'ritual_1', deletedAt: expect.any(String) }]);
  });

  it('keeps kinds apart', async () => {
    const install = { id: 'joel-dickson', installed_at: '2026-10-01T00:00:00.000Z' };
    await call('alice', 'PUT', '/api/synced/marketplace-installs/joel-dickson', { item: install });
    expect((await call('alice', 'GET', '/api/synced/rituals')).body?.items).toEqual([]);
    expect((await call('alice', 'GET', '/api/synced/marketplace-installs')).body?.items).toEqual([
      install,
    ]);
  });

  it('refuses bad input without writing', async () => {
    const mismatch = await call('alice', 'PUT', '/api/synced/rituals/ritual_1', {
      item: { ...ritual, id: 'other' },
    });
    expect(mismatch.status).toBe(400);
    const notObject = await call('alice', 'PUT', '/api/synced/rituals/ritual_1', { item: [1] });
    expect(notObject.status).toBe(400);
    const badId = await call('alice', 'PUT', '/api/synced/rituals/a%2Fb%E0', { item: ritual });
    expect(badId.status).toBe(400);
    const huge = await call('alice', 'PUT', '/api/synced/rituals/ritual_1', {
      item: { ...ritual, notes: 'x'.repeat(MAX_ITEM_CHARS) },
    });
    expect(huge.status).toBe(413);
    expect(store.size).toBe(0);
  });

  it('leaves other paths and unknown kinds to other routes', async () => {
    expect((await call('alice', 'GET', '/api/synced/secrets')).handled).toBe(false);
    expect((await call('alice', 'GET', '/api/rituals')).handled).toBe(false);
  });
});

/**
 * "Forget this memory" must tell the truth.
 *
 * DELETE /api/cognitive/memories/:id used to fall through to a stub
 * (deleteMemoryFromProfile) that always reported success, so forgetting an id the
 * list did not hold - or one that a cold instance / failed save never removed -
 * answered "memory removed" while the memory stayed. The list was also sent with
 * `private, max-age=60`, so the browser's re-fetch could show a forgotten memory.
 *
 * Real HTTP through the real route table and the real persona-memories store; only
 * the profile persistence is faked (in memory) so a save failure can be injected.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  profiles: new Map<string, Record<string, unknown>>(),
  failSaves: false,
}));
const store = {
  // a copy, like a real read: callers mutate what they get before saving it
  getProfile: async (userId: string) =>
    structuredClone(
      db.profiles.get(userId) ?? { userId, personaMemories: {}, totalConversations: 0 }
    ),
  saveProfile: async (profile: Record<string, unknown>) => {
    if (db.failSaves) throw new Error('firestore unavailable');
    db.profiles.set(profile.userId as string, JSON.parse(JSON.stringify(profile)));
  },
};
vi.mock('../../memory/profile-store.js', () => ({
  getProfileStore: async () => store,
  isAgentProfilePersistenceOn: () => false,
}));
vi.mock('../../memory/store-factory.js', () => ({ getStore: async () => store }));

const { handleMemoriesRoutes } = await import('../routes/memories.js');
const { rememberPreference, clearAllMemoriesCache, clearUserMemoriesCache } =
  await import('../../services/memory/persona-memories.js');

let server: Server;
let base = '';
beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    void handleMemoriesRoutes(req, res, url.pathname, url).then((handled) => {
      if (!handled) res.writeHead(404).end();
    });
  });
  await new Promise<void>((r) => {
    server.listen(0, '127.0.0.1', r);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(
  () =>
    new Promise<void>((r) => {
      server.close(() => r());
    })
);
beforeEach(() => {
  db.profiles.clear();
  db.failSaves = false;
  clearAllMemoriesCache();
});

const as = (uid: string) => ({ 'x-firebase-uid': uid });
const list = async (uid: string) => {
  const res = await fetch(`${base}/api/cognitive/memories`, { headers: as(uid) });
  return {
    res,
    body: (await res.json()) as { memories: Array<{ id: string; learnedAt?: string }> },
  };
};
const forgetIt = (uid: string, id: string) =>
  fetch(`${base}/api/cognitive/memories/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: as(uid),
  });

describe('forget this memory', () => {
  it('lists -> deletes -> lists again, and the item is gone', async () => {
    const keep = await rememberPreference('u1', 'jazz');
    const gone = await rememberPreference('u1', 'oat milk');

    const before = await list('u1');
    expect(before.body.memories.map((m) => m.id)).toEqual(
      expect.arrayContaining([keep.id, gone.id])
    );

    const del = await forgetIt('u1', gone.id);
    expect(del.status).toBe(200);
    expect(await del.json()).toMatchObject({ success: true, memoryId: gone.id });

    const after = await list('u1');
    const ids = after.body.memories.map((m) => m.id);
    expect(ids).not.toContain(gone.id);
    expect(ids).toContain(keep.id);
    // and it is gone from the store, not only the cache
    clearUserMemoriesCache('u1');
    expect((await list('u1')).body.memories.map((m) => m.id)).toEqual([keep.id]);
  });

  it('deleting an id that does not exist is NOT a success', async () => {
    const keep = await rememberPreference('u1', 'jazz');

    const del = await forgetIt('u1', 'no-such-memory');

    expect(del.status).toBe(404);
    expect(((await del.json()) as { success?: boolean }).success).not.toBe(true);
    expect((await list('u1')).body.memories.map((m) => m.id)).toContain(keep.id);
  });

  it("deleting someone else's memory is NOT a success and leaves it listed", async () => {
    const theirs = await rememberPreference('owner', 'private thing');

    const del = await forgetIt('attacker', theirs.id);

    expect(del.status).toBe(404);
    expect((await list('owner')).body.memories.map((m) => m.id)).toContain(theirs.id);
  });

  it('still deletes for real when this instance has a cold cache', async () => {
    const m = await rememberPreference('u1', 'oat milk');
    clearUserMemoriesCache('u1'); // e.g. the DELETE lands on a different Cloud Run instance

    const del = await forgetIt('u1', m.id);

    expect(del.status).toBe(200);
    clearUserMemoriesCache('u1');
    expect((await list('u1')).body.memories.map((x) => x.id)).not.toContain(m.id);
  });

  it('a failed save is reported as a failure and the memory stays listed', async () => {
    const m = await rememberPreference('u1', 'oat milk');
    db.failSaves = true;

    const del = await forgetIt('u1', m.id);

    expect(del.status).toBe(500);
    expect(((await del.json()) as { success?: boolean }).success).not.toBe(true);
    db.failSaves = false;
    clearUserMemoriesCache('u1');
    expect((await list('u1')).body.memories.map((x) => x.id)).toContain(m.id);
  });

  it('the list is never HTTP-cacheable, so a re-fetch after forgetting sees the truth', async () => {
    await rememberPreference('u1', 'jazz');
    const { res } = await list('u1');
    expect(res.headers.get('cache-control') ?? '').not.toMatch(/max-age=[1-9]/);
  });

  it('omits learnedAt when the stored memory has no date instead of claiming "now"', async () => {
    db.profiles.set('u2', {
      userId: 'u2',
      personaMemories: {
        jackie: [{ id: 'old-1', type: 'preference', name: 'tea', tags: [], timesReferenced: 0 }],
      },
    });

    const { res, body } = await list('u2');

    expect(res.status).toBe(200);
    expect(body.memories.find((m) => m.id === 'old-1')).toBeDefined();
    expect(body.memories.find((m) => m.id === 'old-1')?.learnedAt).toBeUndefined();
  });
});

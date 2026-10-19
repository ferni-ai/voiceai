/**
 * "Forget this memory" must tell the truth.
 *
 * DELETE /api/cognitive/memories/:id once fell through to a stub that always
 * reported success, and the list was sent with `private, max-age=60`, so a
 * forgotten memory could reappear. The list is now the facts live recall reads
 * (dynamic_facts, memory-control.ts), so forgetting one here is forgetting it
 * for the next call too, and the list (never cached) drops it at once.
 *
 * Real HTTP through the real route and the real memory-control; only the
 * Firestore fact store is faked (in memory) so a write failure can be injected.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type Fact = { id: string; data: Record<string, unknown> };
const db = vi.hoisted(() => ({ facts: new Map<string, Fact[]>(), failWrites: false }));
const factStore = vi.hoisted(() => ({
  facts: async (userId: string) => db.facts.get(userId) ?? [],
  fact: async (userId: string, id: string) =>
    (db.facts.get(userId) ?? []).find((f) => f.id === id)?.data ?? null,
  copies: async () => [],
  forgotten: async () => [] as string[],
  forget: async (userId: string, id: string, _d: unknown, at: string) => {
    if (db.failWrites) throw new Error('firestore unavailable');
    const f = (db.facts.get(userId) ?? []).find((x) => x.id === id);
    if (f) f.data.forgottenAt = at;
  },
  correct: async () => undefined,
}));
vi.mock('../../memory/storage/memory-control-store.js', () => ({
  firestoreMemoryControlStore: factStore,
}));
const profileStore = {
  getProfile: async (userId: string) => ({ userId, totalConversations: 0 }),
  saveProfile: async () => undefined,
};
vi.mock('../../memory/profile-store.js', () => ({
  getProfileStore: async () => profileStore,
  isAgentProfilePersistenceOn: () => false,
}));
vi.mock('../../memory/store-factory.js', () => ({ getStore: async () => profileStore }));

const { handleMemoriesRoutes } = await import('../routes/memories.js');

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

const fact = (id: string, value: string, extractedAt?: string): Fact => ({
  id,
  data: {
    entityName: 'user',
    key: 'likes',
    value,
    confidence: 0.9,
    ...(extractedAt && { extractedAt }),
  },
});
beforeEach(() => {
  db.facts.clear();
  db.failWrites = false;
  db.facts.set('u1', [fact('keep', 'jazz', '2026-10-01T00:00:00.000Z'), fact('gone', 'oat milk')]);
  db.facts.set('owner', [fact('theirs', 'private thing')]);
});

const as = (uid: string) => ({ 'x-firebase-uid': uid });
const list = async (uid: string) => {
  const res = await fetch(`${base}/api/cognitive/memories`, { headers: as(uid) });
  return {
    res,
    body: (await res.json()) as { memories: Array<{ id: string; learnedAt?: string }> },
  };
};
const ids = async (uid: string) => (await list(uid)).body.memories.map((m) => m.id);
const forgetIt = (uid: string, id: string) =>
  fetch(`${base}/api/cognitive/memories/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: as(uid),
  });

describe('forget this memory', () => {
  it('lists -> deletes -> lists again, and the item is gone from the store too', async () => {
    expect(await ids('u1')).toEqual(expect.arrayContaining(['keep', 'gone']));

    const del = await forgetIt('u1', 'gone');
    expect(del.status).toBe(200);
    expect(await del.json()).toMatchObject({ success: true, memoryId: 'gone' });

    expect(await ids('u1')).toEqual(['keep']);
    expect(db.facts.get('u1')!.find((f) => f.id === 'gone')!.data.forgottenAt).toEqual(
      expect.any(String)
    );
  });

  it('deleting an id that does not exist is NOT a success', async () => {
    const del = await forgetIt('u1', 'no-such-memory');

    expect(del.status).toBe(404);
    expect(((await del.json()) as { success?: boolean }).success).not.toBe(true);
    expect(await ids('u1')).toContain('keep');
  });

  it("deleting someone else's memory is NOT a success and leaves it listed", async () => {
    const del = await forgetIt('attacker', 'theirs');

    expect(del.status).toBe(404);
    expect(await ids('owner')).toContain('theirs');
  });

  it('a failed write is reported as a failure and the memory stays listed', async () => {
    db.failWrites = true;

    const del = await forgetIt('u1', 'gone');

    expect(del.status).toBe(500);
    expect(((await del.json()) as { success?: boolean }).success).not.toBe(true);
    db.failWrites = false;
    expect(await ids('u1')).toContain('gone');
  });

  it('the list is never HTTP-cacheable, so a re-fetch after forgetting sees the truth', async () => {
    const { res } = await list('u1');
    expect(res.headers.get('cache-control') ?? '').not.toMatch(/max-age=[1-9]/);
  });

  it('omits learnedAt when the stored fact has no date instead of claiming "now"', async () => {
    const { res, body } = await list('u1');

    expect(res.status).toBe(200);
    expect(body.memories.find((m) => m.id === 'keep')?.learnedAt).toBe('2026-10-01T00:00:00.000Z');
    expect(body.memories.find((m) => m.id === 'gone')).toBeDefined();
    expect(body.memories.find((m) => m.id === 'gone')?.learnedAt).toBeUndefined();
  });
});

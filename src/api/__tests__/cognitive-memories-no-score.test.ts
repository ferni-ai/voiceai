/**
 * "What I've learned" lists the facts Ferni really remembers, with no made-up score.
 *
 * GET /api/cognitive/memories read profile.personaMemories, which is on 0 of 46
 * real profiles (prod audit 2026-10-18), so the panel was empty for everyone.
 * It now reads the facts live recall reads (bogle_users/{uid}/dynamic_facts,
 * through memory-control.ts, the same as /api/memories/remembered), read through
 * on every request. It also used to send `knowledgeScore`, a number nothing
 * measured; that stays gone.
 *
 * Real HTTP through the real route and the real memory-control filters; only
 * the Firestore fact store and the profile store are faked in memory.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type Fact = { id: string; data: Record<string, unknown> };
const facts = vi.hoisted(() => new Map<string, Fact[]>());
const factStore = vi.hoisted(() => ({
  facts: vi.fn(async (userId: string) => facts.get(userId) ?? []),
  fact: vi.fn(
    async (userId: string, id: string) =>
      (facts.get(userId) ?? []).find((f) => f.id === id)?.data ?? null
  ),
  copies: vi.fn(async () => []),
  forgotten: vi.fn(async () => [] as string[]),
  forget: vi.fn(async (userId: string, id: string, _d: unknown, at: string) => {
    const f = (facts.get(userId) ?? []).find((x) => x.id === id);
    if (f) f.data.forgottenAt = at;
  }),
  correct: vi.fn(async () => undefined),
}));
vi.mock('../../memory/storage/memory-control-store.js', () => ({
  firestoreMemoryControlStore: factStore,
}));

const profileStore = vi.hoisted(() => ({
  getProfile: async (userId: string) => ({ userId, personaMemories: {}, totalConversations: 12 }),
  saveProfile: async () => undefined,
}));
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

const fact = (id: string, entityName: string, key: string, value: string): Fact => ({
  id,
  data: { entityName, key, value, confidence: 0.9, extractedAt: '2026-10-01T12:00:00.000Z' },
});

beforeEach(() => {
  facts.clear();
  facts.set('u1', [
    fact('f1', 'Biscuit', 'breed', 'golden retriever'),
    fact('f2', 'user', 'city', 'Austin'),
  ]);
  facts.set('u2', [fact('g1', 'user', 'job', 'nurse')]);
  for (const fn of Object.values(factStore)) fn.mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

const asUser = (uid: string) => ({ headers: { 'x-firebase-uid': uid } });
async function learned(uid: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${base}/api/cognitive/memories`, asUser(uid));
  expect(res.status).toBe(200);
  return (await res.json()) as Record<string, unknown>;
}
const contents = (body: Record<string, unknown>): string[] =>
  (body.memories as Array<{ content: string }>).map((m) => m.content);

describe('GET /api/cognitive/memories', () => {
  it('lists the facts recall reads, with the real conversation count and no score', async () => {
    const body = await learned('u1');

    expect(contents(body)).toEqual(
      expect.arrayContaining(['Biscuit: breed: golden retriever', 'city: Austin'])
    );
    expect(body.memories as unknown[]).toHaveLength(2);
    expect(factStore.facts).toHaveBeenCalledWith('u1');
    expect(body.totalInteractions).toBe(12);
    expect(body).not.toHaveProperty('knowledgeScore');
  });

  it("only ever reads the verified caller's facts", async () => {
    expect((await fetch(`${base}/api/cognitive/memories`)).status).toBe(401);
    expect(contents(await learned('u2'))).toEqual(['job: nurse']);
    expect(factStore.facts).not.toHaveBeenCalledWith('u1');
  });

  it('reads the store on every request, so a fact learned since shows at once', async () => {
    await learned('u1');
    facts.get('u1')!.push(fact('f3', 'user', 'sport', 'climbing'));

    expect(contents(await learned('u1'))).toContain('sport: climbing');
    expect(factStore.facts).toHaveBeenCalledTimes(2);
  });
});

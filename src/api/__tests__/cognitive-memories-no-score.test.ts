/**
 * "What I've learned" lists what was learned, with no made-up score.
 *
 * GET /api/cognitive/memories used to send `knowledgeScore`, a number built as
 * memories*3 + conversations*2 + patterns*5 (capped at 100) that the panel showed
 * as "X% understanding". Nothing measured understanding, so it is gone.
 *
 * Real HTTP through the real route; only the profile store is faked in memory.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  getProfile: async (userId: string) => ({ userId, personaMemories: {}, totalConversations: 12 }),
  saveProfile: async () => undefined,
}));
vi.mock('../../memory/profile-store.js', () => ({
  getProfileStore: async () => store,
  isAgentProfilePersistenceOn: () => false,
}));
vi.mock('../../memory/store-factory.js', () => ({ getStore: async () => store }));

const { handleMemoriesRoutes } = await import('../routes/memories.js');
const { rememberPreference } = await import('../../services/memory/persona-memories.js');

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

describe('GET /api/cognitive/memories', () => {
  it('sends the real conversation count and no understanding score', async () => {
    await rememberPreference('u1', 'jazz');

    const res = await fetch(`${base}/api/cognitive/memories`, {
      headers: { 'x-firebase-uid': 'u1' },
    });
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.totalInteractions).toBe(12);
    expect((body.memories as unknown[]).length).toBeGreaterThan(0);
    expect(body).not.toHaveProperty('knowledgeScore');
  });
});

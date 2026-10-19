/**
 * GET /api/memories/from-call: the caller's own facts from this call only, light
 * topics only, and the same ids "Forget" and "Not quite" already take.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemoryControlStore } from '../../../memory/recall/memory-control.js';
import type { AuthContext } from '../../auth-middleware.js';
import { handleCallRememberedRoute } from '../call-remembered.js';

const NOW = new Date('2026-10-18T20:00:00.000Z');
const START = Date.parse('2026-10-18T19:30:00.000Z');
const at = (m: number) => new Date(START + m * 60_000).toISOString();

const row = (id: string, key: string, value: string, extractedAt: string, over = {}) => ({
  id,
  data: { entityName: 'user', key, value, confidence: 0.9, extractedAt, ...over },
});

const FACTS: Record<string, Array<ReturnType<typeof row>>> = {
  'uid-A': [
    row('a1', 'dog name', 'Biscuit', at(5)),
    row('a2', 'trip', 'Lisbon in May', at(10)),
    row('a3', 'condition', 'biopsy on Friday', at(12)),
    row('a4', 'job', 'nurse', at(-30)),
    row('a5', 'cat name', 'Miso', at(14), { forgottenAt: at(15) }),
  ],
  'uid-B': [row('b1', 'secret errand', 'someone else', at(5))],
};
const asked: string[] = [];
const store: MemoryControlStore = {
  facts: async (uid: string) => {
    asked.push(uid);
    return FACTS[uid] ?? [];
  },
  forgotten: async () => [],
} as unknown as MemoryControlStore;

let server: Server;
let base = '';
let auth: AuthContext | null;
let crisis = false;

beforeAll(async () => {
  vi.stubEnv('MEMORY_VIEW', 'on');
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    void handleCallRememberedRoute(req, res, url.pathname, url, {
      authenticate: async () => auth,
      store,
      recentCrisis: async () => crisis,
      now: () => NOW,
    }).then((handled) => {
      if (!handled) res.writeHead(404).end();
    });
  });
  await new Promise<void>((r) => {
    server.listen(0, '127.0.0.1', r);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await new Promise<void>((r) => {
    server.close(() => r());
  });
});
beforeEach(() => {
  asked.length = 0;
  crisis = false;
  auth = { userId: 'uid-A', isAdmin: false, isDevMode: false, authMethod: 'firebase' };
  vi.stubEnv('MEMORY_VIEW', 'on');
});

const get = (qs: string, init?: RequestInit) => fetch(`${base}/api/memories/from-call${qs}`, init);

describe('GET /api/memories/from-call', () => {
  it("lists this call's light, live facts, newest first, with the ids Forget takes", async () => {
    const res = await get(`?since=${START}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toMatch(/no-store|no-cache/);
    const body = (await res.json()) as { items: Array<Record<string, unknown>> };
    // a3 is a health topic, a4 predates the call, a5 was forgotten
    expect(body.items).toEqual([
      { id: 'a2', subject: 'you', detail: 'trip: Lisbon in May', learnedAt: at(10) },
      { id: 'a1', subject: 'you', detail: 'dog name: Biscuit', learnedAt: at(5) },
    ]);
  });

  it('takes an ISO since too', async () => {
    const res = await get(`?since=${encodeURIComponent(at(0))}`);
    expect(((await res.json()) as { items: unknown[] }).items).toHaveLength(2);
  });

  it('binds to the token alone: a named userId, header or admin flag reads no one else', async () => {
    auth = { ...auth!, isAdmin: true };
    const res = await get(`?since=${START}&userId=uid-B`, {
      headers: { 'x-user-id': 'uid-B', 'x-firebase-uid': 'uid-B' },
    });
    expect(JSON.stringify(await res.json())).not.toContain('someone else');
    expect(new Set(asked)).toEqual(new Set(['uid-A']));
  });

  it('is 401 with no verified person or with a service API key, reading nothing', async () => {
    auth = null;
    expect((await get(`?since=${START}`)).status).toBe(401);
    auth = { userId: 'svc', isAdmin: false, isDevMode: false, authMethod: 'api_key' };
    expect((await get(`?since=${START}`)).status).toBe(401);
    expect(asked).toEqual([]);
  });

  it('is 400 without a usable since', async () => {
    for (const qs of ['', '?since=', '?since=yesterday', '?since=0']) {
      expect((await get(qs)).status).toBe(400);
    }
    expect(asked).toEqual([]);
  });

  it('shows nothing after a recent crisis signal', async () => {
    crisis = true;
    const res = await get(`?since=${START}`);
    expect(await res.json()).toEqual({ items: [] });
    expect(asked).toEqual([]);
  });

  it('is 404 with MEMORY_VIEW off, like the other memory routes', async () => {
    vi.stubEnv('MEMORY_VIEW', 'off');
    expect((await get(`?since=${START}`)).status).toBe(404);
    expect(asked).toEqual([]);
  });

  it('is an error, not an empty list, when the read fails', async () => {
    const original = store.facts;
    (store as { facts: unknown }).facts = async () => {
      throw new Error('down');
    };
    expect((await get(`?since=${START}`)).status).toBe(500);
    (store as { facts: unknown }).facts = original;
  });
});

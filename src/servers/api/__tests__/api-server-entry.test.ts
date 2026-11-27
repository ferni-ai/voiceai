/**
 * The API server entry (index.ts), imported for real with only its listen and startup exit mocked.
 *
 * - It hands its server, PORT and LIVEKIT_URL to listenAndStart once (#4371): drop that call and
 *   the server never listens or starts its background services.
 * - Its request handler applies the global limits (#3797): an /api/ path and a /plaid path each
 *   get the global 429 (limit 100) once their own bucket is used up. Delete the
 *   limitServerRequest call in handleRequest and both rows go red; the unit suite had no other
 *   row that would.
 *
 * Importing index.ts loads every route module, so this file takes ~20 s.
 */
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const listenAndStart = vi.fn();
vi.mock('../api-listen.js', () => ({ listenAndStart }));
// decideCallsAtStartup exits the process when calls can't be offered; the rest stays real.
vi.mock('../call-availability.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../call-availability.js')>()),
  decideCallsAtStartup: () => true,
}));
// Process-wide error handlers belong to the server process, not the test worker.
vi.mock('../process-guards.js', () => ({ installProcessGuards: vi.fn() }));

type Entry = typeof import('../index.js');
let entry: Entry;
let base = '';
/** listenAndStart's calls as the import made them (the shared setup clears mocks between tests). */
let listenCalls: unknown[][] = [];
const SIGNALS = ['SIGTERM', 'SIGINT'] as const;
const signalListeners = new Map(SIGNALS.map((s) => [s, new Set(process.listeners(s))]));

beforeAll(async () => {
  vi.stubEnv('PORT', '4567');
  vi.stubEnv('LIVEKIT_URL', 'wss://entry.example.test');
  entry = await import('../index.js');
  listenCalls = [...listenAndStart.mock.calls];
  entry.stopDDoSMonitoring();
  await new Promise<void>((resolve) => {
    entry.server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(entry.server.address() as AddressInfo).port}`;
}, 120_000);

afterAll(async () => {
  vi.unstubAllEnvs();
  // index.ts adds shutdown handlers that exit the process; drop the ones it added
  for (const signal of SIGNALS) {
    for (const fn of process.listeners(signal)) {
      if (!signalListeners.get(signal)?.has(fn)) process.off(signal, fn);
    }
  }
  await new Promise((resolve) => {
    entry.server.close(resolve);
  });
});

interface Reply {
  status: number;
  limit: string | null;
}

/** Send `count` GETs to one path, one after another (the bucket counts them in order). */
async function hit(path: string, count: number): Promise<Reply[]> {
  const res = await fetch(`${base}${path}`);
  await res.arrayBuffer();
  const reply = { status: res.status, limit: res.headers.get('x-ratelimit-limit') };
  return count > 1 ? [reply, ...(await hit(path, count - 1))] : [reply];
}

describe('API server entry', () => {
  it('hands its server, PORT and LIVEKIT_URL to listenAndStart, once', () => {
    expect(listenCalls).toEqual([
      [entry.server, { port: 4567, livekitUrl: 'wss://entry.example.test' }],
    ]);
  });

  it.each([
    ['an /api/ path', '/api/no-such-route'],
    ['a /plaid path', '/plaid/no-such-route'],
  ])(
    '%s gets the global 429 once its bucket is used up',
    async (_label, path) => {
      const replies = await hit(path, 101);

      expect(replies.slice(0, 100).filter((r) => r.status === 429)).toEqual([]);
      expect(replies[100]).toEqual({ status: 429, limit: '100' });
    },
    60_000
  );
});

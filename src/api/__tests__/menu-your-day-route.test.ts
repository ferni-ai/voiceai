/**
 * "Your Day" (menu item 1): when the commitments store can't be read, the route
 * answers 500 so the hub shows its error state. It used to read through the
 * keeper's quiet loader, which turns any failure into [], so a broken store
 * looked like "nothing on your mind".
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => null,
  cleanForFirestore: <T>(value: T) => value,
  recordDegradation: vi.fn(),
}));

let server: Server;
let base: string;

beforeAll(async () => {
  const { handleCommitmentsRoutes } = await import('../routes/commitments.js');
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    void handleCommitmentsRoutes(req, res, url.pathname, url);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server?.close());

describe('GET /api/commitments when the store is down', () => {
  it('answers 500, not an empty list', async () => {
    const res = await fetch(`${base}/api/commitments?userId=u1&status=active&limit=8`, {
      headers: { 'x-firebase-uid': 'u1' },
    });

    expect(res.status).toBe(500);
    expect(await res.json()).not.toHaveProperty('items');
  });
});

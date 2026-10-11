/**
 * What Ferni knows, through real HTTP and the real route: only the verified
 * caller's own view, never a uid named in the request, and nothing at all
 * while MEMORY_VIEW is off. The aggregation is a spy.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const known = vi.hoisted(() => ({
  isMemoryViewOn: vi.fn(() => true),
  loadKnownView: vi.fn(async (userId: string) => ({
    people: [{ id: 'w1', kind: 'world', text: `about ${userId}`, source: 'told' }],
    lifeNow: [],
    dates: [],
    preferences: [],
    readsYou: [],
  })),
}));
vi.mock('../../intelligence/memory-view/known.js', () => known);

const { handleKnownRoutes } = await import('../routes/known.js');

let server: Server;
let base = '';
beforeAll(async () => {
  server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (!(await handleKnownRoutes(req, res, url.pathname, url))) {
      res.statusCode = 418;
      res.end();
    }
  });
  await new Promise<void>((r) => {
    server.listen(0, r);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(
  () =>
    new Promise<void>((r) => {
      server.close(() => r());
    })
);
beforeEach(() => known.loadKnownView.mockClear());
afterEach(() => known.isMemoryViewOn.mockReturnValue(true));

// The verified identity header (set by bindVerifiedIdentity from a checked token).
const asUser = { 'x-firebase-uid': 'u-1' };

describe('GET /api/memories/known', () => {
  it('answers only a verified caller, with their own view, uncached', async () => {
    expect((await fetch(`${base}/api/memories/known`)).status).toBe(401);
    const res = await fetch(`${base}/api/memories/known`, { headers: asUser });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect((await res.json()).people[0].text).toBe('about u-1');
    expect(known.loadKnownView).toHaveBeenCalledWith('u-1');
  });

  it('cannot be pointed at another uid', async () => {
    expect((await fetch(`${base}/api/memories/known?userId=u-2`)).status).toBe(401);
    const res = await fetch(`${base}/api/memories/known?userId=u-2`, { headers: asUser });
    expect(res.status).toBe(200);
    expect(known.loadKnownView).toHaveBeenCalledTimes(1);
    expect(known.loadKnownView).toHaveBeenCalledWith('u-1');
    expect(known.loadKnownView).not.toHaveBeenCalledWith('u-2');
  });

  it('is not served at all while the flag is off', async () => {
    known.isMemoryViewOn.mockReturnValue(false);
    expect((await fetch(`${base}/api/memories/known`, { headers: asUser })).status).toBe(418);
    expect(known.loadKnownView).not.toHaveBeenCalled();
  });

  it('says it failed rather than showing an empty memory', async () => {
    known.loadKnownView.mockRejectedValueOnce(new Error('firestore down'));
    expect((await fetch(`${base}/api/memories/known`, { headers: asUser })).status).toBe(500);
  });

  it('leaves other paths and methods to other routes', async () => {
    const post = await fetch(`${base}/api/memories/known`, { method: 'POST', headers: asUser });
    expect(post.status).toBe(418);
    expect((await fetch(`${base}/api/memories/remembered`, { headers: asUser })).status).toBe(418);
  });
});

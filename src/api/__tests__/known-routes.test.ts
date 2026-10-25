/**
 * What Ferni knows, through real HTTP and the real route: only the verified
 * caller's own view, never a uid named in the request, and nothing at all
 * while MEMORY_VIEW is off. The aggregation is a spy.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const known = vi.hoisted(() => ({
  ForgottenTopicsUnreadable: class ForgottenTopicsUnreadable extends Error {},
  isMemoryViewOn: vi.fn(() => true),
  isMemoryViewPonderingOn: vi.fn(() => false),
  loadKnownView: vi.fn(async (userId: string) => ({
    people: [{ id: 'w1', kind: 'world', text: `about ${userId}`, source: 'told' }],
    lifeNow: [],
    dates: [],
    preferences: [],
    readsYou: [],
  })),
}));
vi.mock('../../intelligence/memory-view/known.js', () => known);
const actions = vi.hoisted(() => ({
  applyKnownAction: vi.fn(async (_u: string, item: { id: string }) =>
    item.id === 'missing'
      ? { kind: 'not-found' as const }
      : item.id === 'code'
        ? { kind: 'not-kept' as const, reason: 'credential' as const }
        : { kind: 'done' as const }
  ),
}));
vi.mock('../../intelligence/memory-view/actions.js', () => actions);
vi.mock('../routes/known-store.js', () => ({ firestoreKnownStore: { tag: 'firestore' } }));
vi.mock('../routes/known-action-store.js', () => ({ firestoreActionStore: { tag: 'actions' } }));

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
beforeEach(() => {
  known.loadKnownView.mockClear();
  actions.applyKnownAction.mockClear();
});
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
    expect(known.loadKnownView).toHaveBeenCalledWith('u-1', { tag: 'firestore' });
  });

  it('cannot be pointed at another uid', async () => {
    expect((await fetch(`${base}/api/memories/known?userId=u-2`)).status).toBe(401);
    const res = await fetch(`${base}/api/memories/known?userId=u-2`, { headers: asUser });
    expect(res.status).toBe(200);
    expect(known.loadKnownView).toHaveBeenCalledTimes(1);
    expect(known.loadKnownView).toHaveBeenCalledWith('u-1', { tag: 'firestore' });
    expect(known.loadKnownView).not.toHaveBeenCalledWith('u-2', expect.anything());
  });

  it('is not served at all while the flag is off', async () => {
    known.isMemoryViewOn.mockReturnValue(false);
    expect((await fetch(`${base}/api/memories/known`, { headers: asUser })).status).toBe(418);
    expect(known.loadKnownView).not.toHaveBeenCalled();
  });

  it('refuses with 503 and no items when what was forgotten cannot be read', async () => {
    known.loadKnownView.mockRejectedValueOnce(new known.ForgottenTopicsUnreadable());
    const res = await fetch(`${base}/api/memories/known`, { headers: asUser });
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    for (const section of ['people', 'lifeNow', 'dates', 'preferences', 'readsYou']) {
      expect(body[section]).toBeUndefined();
    }
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

describe('POST /api/memories/known/:kind/:id', () => {
  const post = (path: string, body: unknown, headers: Record<string, string> = asUser) =>
    fetch(`${base}/api/memories/known/${path}`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('acts only for a verified caller, on their own record', async () => {
    expect((await post('world/w1', { action: 'forget' }, {})).status).toBe(401);
    expect(actions.applyKnownAction).not.toHaveBeenCalled();
    expect((await post('world/w1', { action: 'correct', value: 'hip surgery' })).status).toBe(200);
    expect(actions.applyKnownAction).toHaveBeenCalledWith(
      'u-1',
      { kind: 'world', id: 'w1' },
      { action: 'correct', value: 'hip surgery' },
      { store: { tag: 'actions' } }
    );
  });

  it('answers 200 with not-kept when a correction was a code', async () => {
    const res = await post('fact/code', { action: 'correct', value: '5512' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, status: 'not-kept', reason: 'credential' });
  });

  it('says when the caller has no such item', async () => {
    expect((await post('fact/missing', { action: 'forget' })).status).toBe(404);
  });

  it('refuses unknown kinds, malformed ids and unknown actions without acting', async () => {
    expect((await post('profile/x', { action: 'forget' })).status).toBe(404);
    expect((await post('fact/a%2Fb', { action: 'forget' })).status).toBe(404);
    expect((await post('fact/f1', { action: 'delete' })).status).toBe(400);
    expect(actions.applyKnownAction).not.toHaveBeenCalled();
  });

  it('hides pondering items unless their own flag is on', async () => {
    expect((await post('ponder/abc', { action: 'forget' })).status).toBe(404);
    known.isMemoryViewPonderingOn.mockReturnValueOnce(true);
    expect((await post('ponder/abc', { action: 'forget' })).status).toBe(200);
  });

  it('is not served while the view is off', async () => {
    known.isMemoryViewOn.mockReturnValue(false);
    expect((await post('fact/f1', { action: 'forget' })).status).toBe(418);
    expect(actions.applyKnownAction).not.toHaveBeenCalled();
  });
});

/**
 * What Ferni remembers, through real HTTP and the real route: only ever the
 * verified caller's own facts. The memory-control functions are spies.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const control = vi.hoisted(() => ({
  listRemembered: vi.fn(async (_u: string) => [
    { id: 'f1', subject: 'Biscuit', detail: 'breed: golden retriever' },
  ]),
  forgetRemembered: vi.fn(async (_u: string, id: string) => id === 'f1'),
  correctRemembered: vi.fn(async (_u: string, _id: string, value: unknown) =>
    typeof value === 'string' && value
      ? {
          kind: 'corrected' as const,
          fact: { id: 'f2', subject: 'Biscuit', detail: `breed: ${value}`, fromYou: true },
        }
      : { kind: 'invalid' as const, reason: 'value is empty' }
  ),
}));
vi.mock('../../memory/recall/memory-control.js', () => control);

const { handleRememberedRoutes } = await import('../routes/remembered.js');

let server: Server;
let base = '';
beforeAll(async () => {
  server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (!(await handleRememberedRoutes(req, res, url.pathname, url))) {
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
  for (const f of Object.values(control)) f.mockClear();
});

// The verified identity header (set by bindVerifiedIdentity from a checked token).
const asUser = { 'x-firebase-uid': 'u-1', 'content-type': 'application/json' };

describe('/api/memories/remembered', () => {
  it('answers only a verified caller, and lists their own facts', async () => {
    expect((await fetch(`${base}/api/memories/remembered`)).status).toBe(401);
    expect((await fetch(`${base}/api/memories/remembered?userId=someone-else`)).status).toBe(401);
    const res = await fetch(`${base}/api/memories/remembered`, { headers: asUser });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      facts: [{ id: 'f1', subject: 'Biscuit', detail: 'breed: golden retriever' }],
    });
    expect(control.listRemembered).toHaveBeenCalledWith('u-1');
  });

  it('forgets one of the caller’s facts, and says when there is no such fact', async () => {
    expect(
      (await fetch(`${base}/api/memories/remembered/f1`, { method: 'DELETE', headers: asUser }))
        .status
    ).toBe(200);
    expect(control.forgetRemembered).toHaveBeenCalledWith('u-1', 'f1');
    expect(
      (await fetch(`${base}/api/memories/remembered/f9`, { method: 'DELETE', headers: asUser }))
        .status
    ).toBe(404);
  });

  it('refuses malformed ids without touching storage', async () => {
    for (const bad of ['a%2Fb', '%E0%A4%A', 'x'.repeat(201)]) {
      const res = await fetch(`${base}/api/memories/remembered/${bad}`, {
        method: 'DELETE',
        headers: asUser,
      });
      expect(res.status, bad).toBe(404);
    }
    expect(control.forgetRemembered).not.toHaveBeenCalled();
  });

  it('corrects a fact, and turns an empty correction away', async () => {
    const ok = await fetch(`${base}/api/memories/remembered/f1`, {
      method: 'PATCH',
      headers: asUser,
      body: JSON.stringify({ value: 'labradoodle' }),
    });
    expect(ok.status).toBe(200);
    expect(control.correctRemembered).toHaveBeenCalledWith('u-1', 'f1', 'labradoodle');
    const empty = await fetch(`${base}/api/memories/remembered/f1`, {
      method: 'PATCH',
      headers: asUser,
      body: JSON.stringify({ value: '' }),
    });
    expect(empty.status).toBe(400);
  });

  it('leaves other paths and methods to other routes', async () => {
    expect(
      (await fetch(`${base}/api/memories/remembered/f1`, { method: 'POST', headers: asUser }))
        .status
    ).toBe(418);
    expect((await fetch(`${base}/api/memories/highlights`, { headers: asUser })).status).toBe(418);
  });
});

/**
 * What Ferni remembers, through real HTTP and the real route: only ever the
 * verified caller's own facts, and only with MEMORY_VIEW=on. The
 * memory-control functions are spies; one server also runs the real
 * bindVerifiedIdentity in front, with token verification mocked.
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
    value === '5512'
      ? { kind: 'not-kept' as const, reason: 'credential' as const }
      : typeof value === 'string' && value
        ? {
            kind: 'corrected' as const,
            fact: { id: 'f2', subject: 'Biscuit', detail: `breed: ${value}`, fromYou: true },
          }
        : { kind: 'invalid' as const, reason: 'value is empty' }
  ),
}));
vi.mock('../../memory/recall/memory-control.js', () => control);
const store = vi.hoisted(() => ({ firestoreMemoryControlStore: { adapter: 'firestore' } }));
vi.mock('../../memory/storage/memory-control-store.js', () => store);
const firestore = store.firestoreMemoryControlStore;
vi.mock('../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token === 'tok-A' ? { uid: 'uid-A', claims: {}, isAnonymous: false } : null
  ),
}));

const { handleRememberedRoutes } = await import('../routes/remembered.js');
const { bindVerifiedIdentity } = await import('../../servers/api/request-identity.js');

async function listen(bind: boolean): Promise<{ server: Server; base: string }> {
  const server = createServer(async (req, res) => {
    if (bind) await bindVerifiedIdentity(req, { NODE_ENV: 'production' });
    const url = new URL(req.url ?? '/', 'http://x');
    if (!(await handleRememberedRoutes(req, res, url.pathname, url))) {
      res.statusCode = 418;
      res.end();
    }
  });
  await new Promise<void>((r) => {
    server.listen(0, r);
  });
  return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

let server: Server;
let bound: Server;
let base = '';
let boundBase = '';
const flagBefore = process.env.MEMORY_VIEW;
beforeAll(async () => {
  ({ server, base } = await listen(false));
  ({ server: bound, base: boundBase } = await listen(true));
});
afterAll(async () => {
  if (flagBefore === undefined) delete process.env.MEMORY_VIEW;
  else process.env.MEMORY_VIEW = flagBefore;
  for (const s of [server, bound]) {
    await new Promise<void>((r) => {
      s.close(() => r());
    });
  }
});
beforeEach(() => {
  process.env.MEMORY_VIEW = 'on';
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
    expect(control.listRemembered).toHaveBeenCalledWith('u-1', firestore);
  });

  it('forgets one of the caller’s facts, and says when there is no such fact', async () => {
    expect(
      (await fetch(`${base}/api/memories/remembered/f1`, { method: 'DELETE', headers: asUser }))
        .status
    ).toBe(200);
    expect(control.forgetRemembered).toHaveBeenCalledWith('u-1', 'f1', firestore);
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
    expect(control.correctRemembered).toHaveBeenCalledWith('u-1', 'f1', 'labradoodle', firestore);
    const empty = await fetch(`${base}/api/memories/remembered/f1`, {
      method: 'PATCH',
      headers: asUser,
      body: JSON.stringify({ value: '' }),
    });
    expect(empty.status).toBe(400);
  });

  it('answers 200 with not-kept when the correction was a code (the fact is gone, nothing to retry)', async () => {
    const res = await fetch(`${base}/api/memories/remembered/f1`, {
      method: 'PATCH',
      headers: asUser,
      body: JSON.stringify({ value: '5512' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, status: 'not-kept', reason: 'credential' });
  });

  it('leaves other paths and methods to other routes', async () => {
    expect(
      (await fetch(`${base}/api/memories/remembered/f1`, { method: 'POST', headers: asUser }))
        .status
    ).toBe(418);
    expect((await fetch(`${base}/api/memories/highlights`, { headers: asUser })).status).toBe(418);
  });
});

describe('/api/memories/remembered with MEMORY_VIEW off', () => {
  it('is not there at all: every method falls through, storage untouched', async () => {
    process.env.MEMORY_VIEW = 'off';
    for (const [method, path] of [
      ['GET', '/api/memories/remembered'],
      ['DELETE', '/api/memories/remembered/f1'],
      ['PATCH', '/api/memories/remembered/f1'],
    ] as const) {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: asUser,
        body: method === 'PATCH' ? '{"value":"x"}' : undefined,
      });
      expect(res.status, `${method} ${path}`).toBe(418);
    }
    delete process.env.MEMORY_VIEW;
    expect((await fetch(`${base}/api/memories/remembered`, { headers: asUser })).status).toBe(418);
    for (const f of Object.values(control)) expect(f).not.toHaveBeenCalled();
  });
});

describe('/api/memories/remembered behind the real identity binding', () => {
  it('ignores a claimed uid and acts only for the verified token', async () => {
    const spoofed = await fetch(`${boundBase}/api/memories/remembered?userId=victim`, {
      headers: { 'x-firebase-uid': 'victim' },
    });
    expect(spoofed.status).toBe(401);
    const forged = await fetch(`${boundBase}/api/memories/remembered/f1`, {
      method: 'DELETE',
      headers: { authorization: 'Bearer forged', 'x-firebase-uid': 'victim' },
    });
    expect(forged.status).toBe(401);
    expect(control.forgetRemembered).not.toHaveBeenCalled();
    const ok = await fetch(`${boundBase}/api/memories/remembered?userId=victim`, {
      headers: { authorization: 'Bearer tok-A', 'x-firebase-uid': 'victim' },
    });
    expect(ok.status).toBe(200);
    expect(control.listRemembered).toHaveBeenCalledWith('uid-A', firestore);
  });
});

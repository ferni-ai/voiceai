/**
 * Routes that name a user in the path only act for that user.
 *
 * /api/visual-storytelling/:userId/* and /api/household/:userId/members* checked that the
 * caller was signed in, then read and wrote the household / sleep pattern / milestones of
 * whatever id the path named. The door rewrites ?userId=, not path segments.
 */
import { Readable } from 'stream';
import type http from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requireAuth, docIds } = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  docIds: [] as string[],
}));

vi.mock('../auth-middleware.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requireAuth,
  rateLimit: vi.fn(() => false),
}));

const docRef = (id: string) => {
  docIds.push(id);
  return {
    get: vi.fn(async () => ({ exists: true, data: () => ({ members: [{ id: 'm1', name: 'Sam' }] }) })),
    set: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
  };
};
const db = { collection: () => ({ doc: docRef }) };
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => db }));
vi.mock('../../memory/firestore-factory.js', () => ({ getFirestore: () => db }));

const { requirePathOwner } = await import('../path-owner.js');
const { handleVisualStorytellingRoutes } = await import('../visual-storytelling-routes.js');
const { handleHouseholdRoutes } = await import('../household-routes.js');

function request(method: string, url: string, body?: object): http.IncomingMessage {
  const req = Readable.from(body ? [JSON.stringify(body)] : []) as unknown as http.IncomingMessage;
  Object.assign(req, { method, url, headers: { host: 'x', 'content-type': 'application/json' } });
  return req;
}

function response() {
  const res = {
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    setHeader: vi.fn(),
    writeHead: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    end: vi.fn(() => {
      res.writableEnded = true;
    }),
  };
  return res;
}
type Res = ReturnType<typeof response>;
const asRes = (r: Res) => r as unknown as http.ServerResponse;

const ATTACKER = { userId: 'attacker', isAdmin: false };

beforeEach(() => {
  requireAuth.mockReset();
  docIds.length = 0;
});

describe('requirePathOwner', () => {
  it('lets the named user and admins through, and refuses everyone else', async () => {
    requireAuth.mockResolvedValue({ userId: 'victim', isAdmin: false });
    expect(await requirePathOwner(request('GET', '/'), asRes(response()), 'victim')).toBe(true);
    requireAuth.mockResolvedValue({ userId: 'ops', isAdmin: true });
    expect(await requirePathOwner(request('GET', '/'), asRes(response()), 'victim')).toBe(true);

    requireAuth.mockResolvedValue(ATTACKER);
    const res = response();
    expect(await requirePathOwner(request('GET', '/'), asRes(res), 'victim')).toBe(false);
    expect(res.statusCode).toBe(403);

    requireAuth.mockResolvedValue(null); // 401 already sent by requireAuth
    expect(await requirePathOwner(request('GET', '/'), asRes(response()), 'victim')).toBe(false);
  });
});

describe('visual storytelling', () => {
  it.each([
    ['GET', '/api/visual-storytelling/victim', undefined],
    ['PUT', '/api/visual-storytelling/victim/sleep-pattern', { wakeTime: 7, sleepTime: 23 }],
    ['POST', '/api/visual-storytelling/victim/milestone/m1/celebrate', {}],
    ['GET', '/api/visual-storytelling/victim/infer-sleep', undefined],
  ])("%s %s refuses someone else and touches nothing", async (method, url, body) => {
    requireAuth.mockResolvedValue(ATTACKER);
    const res = response();
    expect(await handleVisualStorytellingRoutes(request(method, url, body), asRes(res), url)).toBe(true);
    expect(res.statusCode).toBe(403);
    expect(docIds).toEqual([]);
  });
});

describe('household members', () => {
  it("adding a member writes the caller's own household, whatever the path names", async () => {
    requireAuth.mockResolvedValue(ATTACKER);
    const url = '/api/household/victim/members';
    await handleHouseholdRoutes(request('POST', url, { name: 'Mallory' }), asRes(response()), url);
    expect(docIds).toEqual(['attacker']);
  });

  it("removing a member edits the caller's own household, whatever the path names", async () => {
    requireAuth.mockResolvedValue(ATTACKER);
    const url = '/api/household/victim/members/m1';
    await handleHouseholdRoutes(request('DELETE', url), asRes(response()), url);
    expect(docIds).toEqual(['attacker']);
  });
});

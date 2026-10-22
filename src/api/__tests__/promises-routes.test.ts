/**
 * GET /api/promises through real HTTP, the real route and the real
 * follow-through store module (over the store tests' Firestore fake): only
 * ever the verified caller's own follow-ups, 401 without one, 500 (never an
 * empty list) when the store can't be read, and nothing unless
 * PROMISES_PANEL=on. One server also runs the real bindVerifiedIdentity in
 * front, with token verification mocked.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FollowUpStore, NewFollowUp } from '../../services/follow-through/index.js';
import { createFollowUpStore } from '../../services/stores/follow-through-store.js';
import { fakeFirestore } from '../../services/stores/__tests__/fake-firestore.js';
import { storedTopic } from '../../memory/recall/session-recall.js';

vi.mock('../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token === 'tok-A' ? { uid: 'uid-A', claims: {}, isAnonymous: false } : null
  ),
}));

const { handlePromisesRoutes } = await import('../routes/promises.js');
const { bindVerifiedIdentity } = await import('../../servers/api/request-identity.js');

let store: FollowUpStore | null = null;
let forgotten: string[] | null = [];

async function listen(bind: boolean): Promise<{ server: Server; base: string }> {
  const server = createServer(async (req, res) => {
    if (bind) await bindVerifiedIdentity(req, { NODE_ENV: 'production' });
    const url = new URL(req.url ?? '/', 'http://x');
    if (
      !(await handlePromisesRoutes(
        req,
        res,
        url.pathname,
        url,
        () => store,
        async () => forgotten
      ))
    ) {
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
const flagBefore = process.env.PROMISES_PANEL;
beforeAll(async () => {
  ({ server, base } = await listen(false));
  ({ server: bound, base: boundBase } = await listen(true));
});
afterAll(async () => {
  if (flagBefore === undefined) delete process.env.PROMISES_PANEL;
  else process.env.PROMISES_PANEL = flagBefore;
  for (const s of [server, bound]) {
    await new Promise<void>((r) => {
      s.close(() => r());
    });
  }
});

const DAY = 86_400_000;
const follow = (userId: string, ref: string, over: Partial<NewFollowUp> = {}): NewFollowUp => ({
  userId,
  kind: 'commitment',
  text: `${userId}: call mom`,
  dueAt: new Date(Date.now() + DAY).toISOString(),
  zone: 'America/New_York',
  repeat: null,
  source: { store: 'commitments', ref },
  ...over,
});

beforeEach(async () => {
  process.env.PROMISES_PANEL = 'on';
  forgotten = [];
  store = createFollowUpStore(fakeFirestore().db);
  const now = new Date();
  await store.open(follow('u-1', 'later'), now);
  await store.open(
    follow('u-1', 'sooner', {
      text: 'u-1: overdue',
      dueAt: new Date(Date.now() - DAY).toISOString(),
    }),
    now
  );
  const kept = await store.open(follow('u-1', 'kept', { text: 'book the dentist' }), now);
  await store.save({ ...kept, status: 'done', closedAt: now.toISOString() }, kept.updatedAt);
  await store.open(follow('u-2', 'theirs', { text: 'u-2 secret' }), now);
  await store.open(follow('uid-A', 'a', { text: 'uid-A: walk the dog' }), now);
});

const asUser = (uid: string) => ({ 'x-firebase-uid': uid });
const texts = (rows: Array<{ text: string }>) => rows.map((r) => r.text);

describe('GET /api/promises', () => {
  it('answers 401 without a verified caller, even when ?userId= names one', async () => {
    expect((await fetch(`${base}/api/promises`)).status).toBe(401);
    expect((await fetch(`${base}/api/promises?userId=u-2`)).status).toBe(401);
  });

  it("returns only the caller's own: open soonest first, closed ones as recent", async () => {
    const res = await fetch(`${base}/api/promises?userId=u-2`, { headers: asUser('u-1') });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      open: Array<{ text: string; status: string }>;
      recent: Array<{ text: string; status: string }>;
    };
    expect(texts(body.open)).toEqual(['u-1: overdue', 'u-1: call mom']);
    expect(body.open.map((r) => r.status)).toEqual(['open', 'open']);
    expect(body.recent).toMatchObject([{ text: 'book the dentist', status: 'done' }]);
    expect(JSON.stringify(body)).not.toContain('u-2 secret');
  });

  it('behind the real identity binding, a forged uid header is replaced by the token', async () => {
    const res = await fetch(`${boundBase}/api/promises`, {
      headers: { authorization: 'Bearer tok-A', 'x-firebase-uid': 'u-2' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { open: Array<{ text: string }> };
    expect(texts(body.open)).toEqual(['uid-A: walk the dog']);
    expect((await fetch(`${boundBase}/api/promises`, { headers: asUser('u-2') })).status).toBe(401);
  });

  it('answers 500 when the store fails or is missing, never an empty list', async () => {
    store = {
      ...store!,
      live: async () => {
        throw new Error('index missing');
      },
    };
    expect((await fetch(`${base}/api/promises`, { headers: asUser('u-1') })).status).toBe(500);
    store = null;
    expect((await fetch(`${base}/api/promises`, { headers: asUser('u-1') })).status).toBe(500);
  });

  it('leaves out a topic the caller asked Ferni to forget, and answers 500 if those are unreadable', async () => {
    forgotten = [storedTopic('the dentist')];
    const res = await fetch(`${base}/api/promises`, { headers: asUser('u-1') });
    const body = (await res.json()) as { open: Array<{ text: string }>; recent: unknown[] };
    expect(texts(body.open)).toEqual(['u-1: overdue', 'u-1: call mom']);
    expect(body.recent).toEqual([]);
    forgotten = null;
    expect((await fetch(`${base}/api/promises`, { headers: asUser('u-1') })).status).toBe(500);
  });

  it('is not served unless PROMISES_PANEL=on', async () => {
    process.env.PROMISES_PANEL = 'off';
    expect((await fetch(`${base}/api/promises`, { headers: asUser('u-1') })).status).toBe(418);
  });
});

/**
 * /api/home is reachable through the engagement router with real token
 * verification (Firebase mocked), and Home shows the row the opener picks.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { followUp } from '../../../services/follow-through/__tests__/fixtures.js';
import type { FollowUpStore } from '../../../services/follow-through/index.js';

vi.mock('../../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token === 'tok-A' ? { uid: 'uid-A', claims: { admin: false }, isAnonymous: true } : null
  ),
}));
const rows = vi.hoisted(() => ({ reads: [] as string[] }));
vi.mock('../../../services/stores/follow-through-store.js', () => ({
  firestoreFollowUpStore: () =>
    ({
      live: async (uid: string) => {
        rows.reads.push(uid);
        return uid === 'uid-A'
          ? [followUp({ userId: 'uid-A', text: 'the interview on Thursday', dueAt: null })]
          : [followUp({ userId: uid, text: 'someone elses errand', dueAt: null })];
      },
    }) as unknown as FollowUpStore,
}));
vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => null }));
vi.mock('../../../memory/recall/forget.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  forgottenTopicsOrNull: async () => [],
}));

const { handleEngagementRoutes } = await import('../../engagement-routes.js');
const { createFollowThroughOpener } =
  await import('../../../agents/multi-agent/follow-through-opener.js');

let server: Server;
let base = '';
beforeAll(async () => {
  vi.stubEnv('FOLLOW_THROUGH_OPENER', 'on');
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    void handleEngagementRoutes(req, res, url.pathname, url).then((handled) => {
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

describe('GET /api/home through the engagement router', () => {
  it('answers an anonymous Firebase user with their own follow-up', async () => {
    rows.reads.length = 0;
    const res = await fetch(`${base}/api/home?userId=uid-B&tz=America/New_York`, {
      headers: { authorization: 'Bearer tok-A', 'x-user-id': 'uid-B' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { greeting: { kind: string; text: string } };
    expect(body.greeting).toMatchObject({ kind: 'followUp', text: 'the interview on Thursday' });
    expect(new Set(rows.reads)).toEqual(new Set(['uid-A']));
  });

  it('is 401 for a forged identity header with no valid token', async () => {
    rows.reads.length = 0;
    const res = await fetch(`${base}/api/home`, {
      headers: { 'x-firebase-uid': 'uid-A', authorization: 'Bearer forged' },
    });
    expect(res.status).toBe(401);
    expect(rows.reads).toEqual([]);
  });

  it('shows the same row the call opener would ask about', async () => {
    const store = {
      live: async () => [followUp({ text: 'the interview on Thursday', dueAt: null })],
    } as unknown as FollowUpStore;
    const opener = createFollowThroughOpener({ userId: 'uid-A', store, forgotten: async () => [] });
    await opener.ready;
    const res = await fetch(`${base}/api/home`, { headers: { authorization: 'Bearer tok-A' } });
    const body = (await res.json()) as { greeting: { text: string } };
    expect(opener.threads()).toEqual([body.greeting.text]);
  });
});

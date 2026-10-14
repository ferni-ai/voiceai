/**
 * Menu item 7, "When I'll Reach Out": what Ferni sent shows in the history tab.
 *
 * Write→read contract on the Firestore emulator: the REAL writer the outreach
 * orchestrator calls after every send (`recordOutreachAttempt`) records an attempt,
 * then the EXACT route the panel calls (`GET /api/outreach/history?limit=20`) returns
 * it, through the real handler and auth middleware. Only Firebase token verification
 * is mocked. Before this, the route read the decision engine's process memory and
 * always answered an empty list.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import admin from 'firebase-admin';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// src/tests/setup.ts mocks firebase-admin/firestore for every test; this one needs the
// real client so the writer and the route both talk to the emulator.
vi.unmock('firebase-admin/firestore');

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
process.env.GCLOUD_PROJECT ??= 'demo-menu-outreach';

const id = () => `u-${Math.random().toString(36).slice(2)}`;
const userA = id();
const userB = id();
const tokens: Record<string, string> = { 'tok-A': userA, 'tok-B': userB };
vi.mock('../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) => {
    const uid = tokens[token];
    return uid ? { uid, claims: { admin: false }, isAnonymous: false } : null;
  }),
}));

let server: Server;
let base = '';
beforeAll(async () => {
  if (!emulator) return;
  if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  const { handleOutreachRoutes } = await import('../outreach.routes.js');
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    void handleOutreachRoutes(req, res, url.pathname, url);
  });
  await new Promise<void>((r) => {
    server.listen(0, '127.0.0.1', r);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server?.close());

interface HistoryBody {
  success: boolean;
  history: Array<Record<string, unknown>>;
  count: number;
}
async function history(token: string): Promise<{ status: number; body: HistoryBody }> {
  const res = await fetch(`${base}/api/outreach/history?limit=20`, {
    headers: { authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: (await res.json()) as HistoryBody };
}

describe.skipIf(!emulator)('GET /api/outreach/history reads outreach_attempts', () => {
  it('returns what recordOutreachAttempt wrote, newest first', async () => {
    const { recordOutreachAttempt } = await import('../../services/outreach/outreach-history.js');
    const first = await recordOutreachAttempt(userA, {
      type: 'thinking_of_you',
      reason: 'burnout_approaching',
      channel: 'push',
      personaId: 'maya',
      status: 'delivered',
    });
    await new Promise((r) => {
      setTimeout(r, 5);
    });
    const second = await recordOutreachAttempt(userA, {
      type: 'check_in',
      reason: 'new_job',
      message: 'How did the first week go?',
      channel: 'voice',
      personaId: 'ferni',
      status: 'failed',
    });

    const { status, body } = await history('tok-A');

    expect(status).toBe(200);
    expect(body.history.map((h) => h.id)).toEqual([second, first]);
    expect(body.history[0]).toMatchObject({
      type: 'check_in',
      channel: 'call',
      personaId: 'ferni',
      personaName: 'Ferni',
      status: 'failed',
      message: 'How did the first week go?',
    });
    expect(body.history[1]).toMatchObject({
      type: 'thinking_of_you',
      channel: 'push',
      personaName: 'Maya',
      status: 'delivered',
    });
    expect(body.history[1]).not.toHaveProperty('message');
    expect(typeof body.history[0]?.sentAt).toBe('string');
  });

  it("never shows one person's outreach to another", async () => {
    const { status, body } = await history('tok-B');

    expect(status).toBe(200);
    expect(body).toMatchObject({ success: true, history: [], count: 0 });
  });
});

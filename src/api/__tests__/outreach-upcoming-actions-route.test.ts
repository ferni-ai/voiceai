/**
 * POST /api/outreach/upcoming/cancel and /reschedule change only the caller's own
 * item, the uid taken from the verified token, never from the body. Behind
 * REACH_OUT_ACTIONS (off: 404, and the list offers nothing). Real HTTP through
 * the real route, auth middleware and actions; Firestore is in-memory.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fakeFirestore as schedulingFake,
  type Row,
} from '../../services/scheduling/__tests__/fake-firestore.js';
import { fakeFirestore as storesFake } from '../../services/stores/__tests__/fake-firestore.js';
import { followUp as fixture } from '../../services/follow-through/__tests__/fixtures.js';
import { createFollowUpStore } from '../../services/stores/follow-through-store.js';

const tokens: Record<string, string> = { 'tok-A': 'uid-A', 'tok-B': 'uid-B' };
vi.mock('../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) => {
    const uid = tokens[token];
    return uid ? { uid, claims: { admin: false }, isAnonymous: false } : null;
  }),
}));

const NOW = new Date('2026-10-13T16:10:00.000Z');
const inMin = (m: number) => new Date(NOW.getTime() + m * 60_000).toISOString();
const state = vi.hoisted(() => ({
  rows: [] as Row[],
  fs: null as unknown as ReturnType<typeof storesFake>,
  callAllowed: true,
}));
vi.mock('../../services/outreach/upcoming-outreach-actions.js', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../services/outreach/upcoming-outreach-actions.js')
  >()),
  firestoreActionDeps: async () => ({
    db: schedulingFake(state.rows),
    followUps: createFollowUpStore(state.fs.db),
    callAllowedAt: async () => state.callAllowed,
    savedQuietAt: async () => false,
  }),
}));
vi.mock('../../services/outreach/upcoming-outreach.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/outreach/upcoming-outreach.js')>()),
  firestoreUpcomingDeps: async () => ({
    heldCalls: async (userId: string) =>
      state.rows.filter((r) => r.userId === userId).map((r) => ({ id: r.id, data: r.data })),
    followUps: async () => [],
    followUpTextsOn: async () => false,
  }),
}));

const { handleOutreachRoutes } = await import('../outreach.routes.js');

let server: Server;
let base = '';
beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    void handleOutreachRoutes(req, res, url.pathname, url);
  });
  await new Promise<void>((r) => {
    server.listen(0, '127.0.0.1', r);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(
  () =>
    new Promise<void>((r) => {
      server.close(() => r());
    })
);

const aCall = () => state.rows.find((r) => r.id === 'deferred_a')?.data ?? {};
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  vi.stubEnv('REACH_OUT_ACTIONS', 'on');
  state.callAllowed = true;
  state.fs = storesFake();
  state.rows = [
    {
      id: 'deferred_a',
      userId: 'uid-A',
      collection: 'deferred_calls',
      data: { kind: 'proactive', status: 'pending', scheduledFor: inMin(60), request: {} },
    },
  ];
  const f = fixture({ id: 'fa', userId: 'uid-A', source: { store: 'summaries', ref: 's' } });
  state.fs.docs.set('bogle_users/uid-A/follow_through/fa', { ...f });
});

const post = async (path: string, body: unknown, token?: string) => {
  const res = await fetch(`${base}/api/outreach/upcoming/${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token && { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
const cancelA = { type: 'held_call', id: 'deferred_a' };

describe('POST /api/outreach/upcoming/cancel', () => {
  it('cancels the caller’s own held call', async () => {
    expect(await post('cancel', cancelA, 'tok-A')).toEqual({
      status: 200,
      body: { success: true, ok: true },
    });
    expect(aCall().status).toBe('cancelled');
  });

  it('cancels the caller’s own follow-up', async () => {
    const out = await post('cancel', { type: 'follow_up', id: 'fa' }, 'tok-A');
    expect(out.status).toBe(200);
    expect(state.fs.docs.get('bogle_users/uid-A/follow_through/fa')?.status).toBe('released');
  });

  it('answers 401 without a token and changes nothing', async () => {
    expect((await post('cancel', cancelA)).status).toBe(401);
    expect(aCall().status).toBe('pending');
  });

  it("answers 404 to another user, even naming the owner in the body, and the owner's stays", async () => {
    expect((await post('cancel', cancelA, 'tok-B')).status).toBe(404);
    expect((await post('cancel', { ...cancelA, userId: 'uid-A' }, 'tok-B')).status).toBe(404);
    expect(
      (await post('cancel', { type: 'follow_up', id: 'fa', userId: 'uid-A' }, 'tok-B')).status
    ).toBe(404);
    expect(aCall().status).toBe('pending');
    expect(state.fs.docs.get('bogle_users/uid-A/follow_through/fa')?.status).toBe('open');
  });

  it('answers 409 once the job has taken it, never success', async () => {
    aCall().status = 'placing';
    expect(await post('cancel', cancelA, 'tok-A')).toMatchObject({
      status: 409,
      body: { success: false },
    });
  });

  it('answers 400 to an unknown kind or an id that is a path', async () => {
    expect((await post('cancel', { type: 'reminder', id: 'deferred_a' }, 'tok-A')).status).toBe(
      400
    );
    expect(
      (await post('cancel', { type: 'held_call', id: '../x/deferred_a' }, 'tok-A')).status
    ).toBe(400);
    expect(aCall().status).toBe('pending');
  });

  it('is not there while REACH_OUT_ACTIONS is off, and the list offers no cancel', async () => {
    vi.stubEnv('REACH_OUT_ACTIONS', '');
    expect((await post('cancel', cancelA, 'tok-A')).status).toBe(404);
    expect(aCall().status).toBe('pending');
    const res = await fetch(`${base}/api/outreach/upcoming`, {
      headers: { authorization: 'Bearer tok-A' },
    });
    const { upcoming } = (await res.json()) as { upcoming: Array<{ canCancel: boolean }> };
    expect(upcoming.map((u) => u.canCancel)).toEqual([false]);
  });

  it('the list offers cancel and move when REACH_OUT_ACTIONS is on', async () => {
    const res = await fetch(`${base}/api/outreach/upcoming`, {
      headers: { authorization: 'Bearer tok-A' },
    });
    const { upcoming } = (await res.json()) as { upcoming: Array<Record<string, unknown>> };
    expect(upcoming).toEqual([
      expect.objectContaining({ id: 'deferred_a', canCancel: true, canReschedule: true }),
    ]);
  });
});

describe('POST /api/outreach/upcoming/reschedule', () => {
  it('moves the caller’s own held call and answers the new time', async () => {
    const out = await post('reschedule', { ...cancelA, at: inMin(180) }, 'tok-A');
    expect(out).toEqual({
      status: 200,
      body: { success: true, ok: true, scheduledFor: inMin(180) },
    });
    expect(aCall().scheduledFor).toBe(inMin(180));
  });

  it('answers 422 to a past time or one outside their call hours, and keeps the old one', async () => {
    expect((await post('reschedule', { ...cancelA, at: inMin(-1) }, 'tok-A')).status).toBe(422);
    state.callAllowed = false;
    expect((await post('reschedule', { ...cancelA, at: inMin(180) }, 'tok-A')).status).toBe(422);
    expect(aCall().scheduledFor).toBe(inMin(60));
  });

  it('answers 404 to another user moving it', async () => {
    expect(
      (await post('reschedule', { ...cancelA, at: inMin(180), userId: 'uid-A' }, 'tok-B')).status
    ).toBe(404);
    expect(aCall().scheduledFor).toBe(inMin(60));
  });
});

/**
 * "When I'll Reach Out" lists what is really set to go out to the caller.
 *
 * GET /api/outreach/upcoming read the outreach engine's in-process trigger map,
 * which nothing fills on the servers that answer it, so it was always empty. It
 * now reads the held calls (deferred_calls) and, when the follow-up job would
 * text this person, their follow-ups with a time. Real HTTP through the real
 * route and reader; only the stores and token check are faked.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token === 'tok-A' ? { uid: 'uid-A', claims: { admin: false }, isAnonymous: false } : null
  ),
}));

const NOW = Date.parse('2026-10-18T12:00:00.000Z');
const inHours = (h: number): string => new Date(NOW + h * 3_600_000).toISOString();
const stores = vi.hoisted(() => ({
  fail: false,
  textsOn: false,
  reads: [] as string[],
  calls: [] as Array<{ id: string; data: Record<string, unknown> }>,
  followUps: [] as Array<Record<string, unknown>>,
}));
vi.mock('../../services/outreach/upcoming-outreach.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/outreach/upcoming-outreach.js')>()),
  firestoreUpcomingDeps: async () => ({
    heldCalls: async (userId: string) => {
      stores.reads.push(userId);
      if (stores.fail) throw new Error('firestore unavailable');
      return stores.calls;
    },
    followUps: async () => stores.followUps,
    followUpTextsOn: async () => stores.textsOn,
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
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  Object.assign(stores, { fail: false, textsOn: false, reads: [], calls: [], followUps: [] });
  stores.calls = [
    {
      id: 'held-1',
      data: {
        kind: 'proactive',
        status: 'pending',
        scheduledFor: inHours(9),
        request: {
          personaId: 'ferni',
          message: 'Morning! How did the interview go?',
          reason: 'interview',
        },
      },
    },
    // a call to someone else on their behalf is not Ferni reaching out to them
    { id: 'behalf-1', data: { kind: 'on_behalf', status: 'pending', scheduledFor: inHours(2) } },
    // too late to be placed: the job drops it
    { id: 'stale-1', data: { kind: 'proactive', status: 'pending', scheduledFor: inHours(-13) } },
  ];
  stores.followUps = [
    { id: 'fu-1', kind: 'reminder', text: 'call the dentist', dueAt: inHours(3) },
    { id: 'fu-2', kind: 'thread', text: 'whenever', dueAt: null },
  ];
});

type Item = {
  id: string;
  channel: string;
  scheduledFor: string;
  personaName: string;
  canCancel: boolean;
};
const get = async (query = '') => {
  const res = await fetch(`${base}/api/outreach/upcoming${query}`, {
    headers: { authorization: 'Bearer tok-A' },
  });
  return { res, body: (await res.json()) as { upcoming?: Item[]; success: boolean } };
};

describe('GET /api/outreach/upcoming', () => {
  it('lists a call held for their hours, and nothing that is not going to them', async () => {
    const { res, body } = await get();

    expect(res.status).toBe(200);
    expect(body.upcoming).toEqual([
      expect.objectContaining({
        id: 'held-1',
        channel: 'call',
        scheduledFor: inHours(9),
        personaName: 'Ferni',
        preview: { body: 'Morning! How did the interview go?' },
        canCancel: false,
        canReschedule: false,
      }),
    ]);
  });

  it('adds their timed follow-ups, soonest first, only when the follow-up job would text them', async () => {
    stores.textsOn = true;

    const { body } = await get();

    expect(body.upcoming!.map((u) => [u.id, u.channel])).toEqual([
      ['fu-1', 'sms'],
      ['held-1', 'call'],
    ]);
    expect((await get('?limit=1')).body.upcoming!.map((u) => u.id)).toEqual(['fu-1']);
  });

  it('answers 500, not an empty list, when a store cannot be read', async () => {
    stores.fail = true;

    const { res, body } = await get();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
  });

  it('reads for the signed-in caller, whatever userId the query names', async () => {
    await get('?userId=uid-B');

    expect(stores.reads).toEqual(['uid-A']);
    expect((await fetch(`${base}/api/outreach/upcoming`)).status).toBe(401);
  });

  it('leaves out a follow-up already due and texted: it is not upcoming', async () => {
    stores.textsOn = true;
    stores.followUps.push({
      id: 'fu-past',
      kind: 'reminder',
      text: 'take the bins out',
      dueAt: inHours(-2),
      status: 'surfaced',
      surfaced: [{ at: inHours(-2), via: 'text' }],
    });
    stores.followUps.push({ id: 'fu-now', kind: 'reminder', text: 'now', dueAt: inHours(0) });

    const { body } = await get();

    expect(body.upcoming!.map((u) => u.id)).toEqual(['fu-1', 'held-1']);
  });
});

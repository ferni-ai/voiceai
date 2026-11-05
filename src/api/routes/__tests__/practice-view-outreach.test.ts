/**
 * "What's Ahead" lists what Ferni is set to reach out about from the one source
 * "When I'll Reach Out" reads (services/outreach/upcoming-outreach.ts).
 *
 * It used to query a top-level `outreach` collection that nothing writes, so it
 * was always empty, and a failed read showed as "nothing planned". The real
 * GET /api/practice-view and GET /api/outreach/upcoming handlers run here
 * against the same faked stores (the seam outreach-upcoming-route.test.ts
 * uses), so the two can't drift apart.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const NOW = Date.parse('2026-10-18T12:00:00.000Z');
const inHours = (h: number): string => new Date(NOW + h * 3_600_000).toISOString();
const stores = vi.hoisted(() => ({
  fail: false,
  textsOn: false,
  calls: [] as Array<{ id: string; data: Record<string, unknown> }>,
  followUps: [] as Array<Record<string, unknown>>,
}));
vi.mock('../../../services/outreach/upcoming-outreach.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/outreach/upcoming-outreach.js')>()),
  firestoreUpcomingDeps: async () => ({
    heldCalls: async () => {
      if (stores.fail) throw new Error('firestore unavailable');
      return stores.calls;
    },
    followUps: async () => stores.followUps,
    followUpTextsOn: async () => stores.textsOn,
  }),
}));
// The view's other sections: no real Firestore or calendar in a unit test.
vi.mock('@google-cloud/firestore', () => ({
  Firestore: class {
    collection(): never {
      throw new Error('no Firestore in tests');
    }
  },
}));
vi.mock('../../../services/calendar/index.js', () => ({ getEvents: vi.fn(async () => []) }));
vi.mock('../../../services/superhuman/predictive-coaching.js', () => ({
  generatePredictions: vi.fn(async () => []),
}));

const { handleGetPracticeView } = await import('../practice-view.js');
const { handleUpcoming } = await import('../../outreach-upcoming-route.js');

const USER = 'test-user-outreach';

function capture(): { res: ServerResponse; status: () => number; body: () => any } {
  let raw = '';
  let code = 0;
  const res = {
    writeHead: vi.fn((s: number) => {
      code = s;
    }),
    setHeader: vi.fn(),
    end: vi.fn((data?: string) => {
      raw = data ?? '';
    }),
  } as unknown as ServerResponse;
  return { res, status: () => code, body: () => JSON.parse(raw) };
}

async function practiceView() {
  const out = capture();
  const req = { headers: { 'x-firebase-uid': USER }, method: 'GET' } as unknown as IncomingMessage;
  await handleGetPracticeView(req, out.res, new URL('http://localhost/api/practice-view'));
  return { status: out.status(), body: out.body() };
}

async function upcoming() {
  const out = capture();
  const req = { url: '/api/outreach/upcoming', method: 'GET' } as unknown as IncomingMessage;
  await handleUpcoming(req, out.res, USER, '/upcoming', 'GET');
  return out.body().upcoming as Array<Record<string, unknown>>;
}

/** What both answers must agree on: the item and who it is from, and whether it can change. */
const sameItem = ({
  id,
  type,
  personaId,
  personaName,
  channel,
  scheduledFor,
  preview,
  canReschedule,
  canCancel,
}: Record<string, unknown>) => ({
  id,
  type,
  personaId,
  personaName,
  channel,
  scheduledFor,
  preview,
  canReschedule,
  canCancel,
});

/** A held call from Peter (stored by alias, as callers write it) and a texted follow-up. */
function heldCallAndFollowUp(): void {
  stores.textsOn = true;
  stores.calls = [
    {
      id: 'held-1',
      data: {
        kind: 'proactive',
        status: 'pending',
        scheduledFor: inHours(9),
        request: { personaId: 'Peter', message: 'Want to look at that fund?', reason: 'test' },
      },
    },
    // a call to someone else on their behalf is not Ferni reaching out to them
    { id: 'behalf-1', data: { kind: 'on_behalf', status: 'pending', scheduledFor: inHours(2) } },
  ];
  stores.followUps = [
    {
      id: 'fu-1',
      kind: 'commitment',
      text: 'see how the interview went',
      dueAt: inHours(3),
      status: 'open',
      source: { store: 'summaries', ref: 'session-test-1' },
    },
  ];
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  Object.assign(stores, { fail: false, textsOn: false, calls: [], followUps: [] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('GET /api/practice-view pending outreach', () => {
  it('lists a held call and a texted follow-up exactly as GET /api/outreach/upcoming does', async () => {
    heldCallAndFollowUp();

    const { status, body } = await practiceView();
    const panel = await upcoming();

    expect(status).toBe(200);
    expect(
      body.pendingOutreach.map((o: Record<string, unknown>) => [o.id, o.personaId, o.personaName])
    ).toEqual([
      ['fu-1', 'ferni', 'Ferni'],
      ['held-1', 'peter-john', 'Peter'],
    ]);
    expect(body.pendingOutreach.map(sameItem)).toEqual(panel.map(sameItem));
  });

  it('with REACH_OUT_ACTIONS on, offers the same cancel and move as the panel', async () => {
    vi.stubEnv('REACH_OUT_ACTIONS', 'on');
    heldCallAndFollowUp();

    const { status, body } = await practiceView();
    const panel = await upcoming();

    expect(status).toBe(200);
    expect(
      body.pendingOutreach.map((o: Record<string, unknown>) => [o.id, o.canCancel, o.canReschedule])
    ).toEqual([
      ['fu-1', false, true],
      ['held-1', true, true],
    ]);
    expect(body.pendingOutreach.map(sameItem)).toEqual(panel.map(sameItem));
  });

  it('gives [] when nothing is set to go out: a true "nothing planned"', async () => {
    const { status, body } = await practiceView();

    expect(status).toBe(200);
    expect(body.pendingOutreach).toEqual([]);
  });

  it('gives null, not [], when the stores cannot be read, and the rest of the view still answers', async () => {
    stores.fail = true;

    const { status, body } = await practiceView();

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.week).toHaveLength(7);
    expect(body.pendingOutreach).toBeNull();
  });
});

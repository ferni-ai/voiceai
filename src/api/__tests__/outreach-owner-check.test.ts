/**
 * Cancelling or rescheduling outreach acts only on the caller's own outreach.
 *
 * DELETE /api/outreach/pending/:id and POST /api/outreach/reschedule looked the id
 * up across every user's pending triggers, so any signed-in user who had (or
 * guessed) another user's trigger id could cancel or move that user's outreach.
 * Now someone else's id answers 404, the same as an id that doesn't exist, and the
 * owner's outreach is left exactly as it was.
 *
 * Real HTTP requests go through the REAL route handler, REAL auth middleware and
 * the REAL decision engine (its in-memory trigger store). Only Firebase token
 * verification and trigger persistence are mocked.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const tokens: Record<string, string> = { 'tok-A': 'uid-A', 'tok-B': 'uid-B' };
vi.mock('../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) => {
    const uid = tokens[token];
    return uid ? { uid, claims: { admin: false }, isAnonymous: false } : null;
  }),
}));
vi.mock('../../services/outreach/firestore-persistence.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/outreach/firestore-persistence.js')>()),
  saveTrigger: vi.fn(async () => undefined),
}));

const { handleOutreachRoutes } = await import('../outreach.routes.js');
const { getOutreachDecisionEngine } = await import('../../services/outreach/decision-engine.js');

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

const engine = getOutreachDecisionEngine();
const originalTime = new Date('2026-11-01T15:00:00Z');
let aTriggerId = '';

beforeEach(() => {
  for (const uid of ['uid-A', 'uid-B']) {
    for (const t of [...engine.getPendingTriggers(uid)]) engine.cancelTrigger(t.id);
  }
  aTriggerId = engine.addTrigger({
    type: 'check_in',
    userId: 'uid-A',
    priority: 'low',
    reason: 'see how the new job is going',
    context: {},
    suggestedTime: originalTime,
  });
});

const send = (method: string, path: string, token: string, body?: unknown) =>
  fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe('DELETE /api/outreach/pending/:id', () => {
  it("answers 404 to user B cancelling user A's outreach, and A's stays scheduled", async () => {
    const res = await send('DELETE', `/api/outreach/pending/${aTriggerId}`, 'tok-B');

    expect(res.status).toBe(404);
    expect(engine.getPendingTriggers('uid-A').map((t) => t.id)).toEqual([aTriggerId]);
  });

  it('gives the same 404 for an id that does not exist, so it confirms nothing', async () => {
    const other = await send('DELETE', `/api/outreach/pending/${aTriggerId}`, 'tok-B');
    const missing = await send('DELETE', '/api/outreach/pending/trigger_nope', 'tok-B');

    expect(await other.json()).toEqual(await missing.json());
  });

  it('lets user A cancel their own outreach', async () => {
    const res = await send('DELETE', `/api/outreach/pending/${aTriggerId}`, 'tok-A');

    expect(res.status).toBe(200);
    expect(engine.getPendingTriggers('uid-A')).toEqual([]);
  });
});

describe('POST /api/outreach/reschedule', () => {
  const newTime = '2026-11-03T18:00:00.000Z';

  it("answers 404 to user B moving user A's outreach, and A's is unchanged", async () => {
    const res = await send('POST', '/api/outreach/reschedule', 'tok-B', {
      triggerId: aTriggerId,
      newTime,
    });

    expect(res.status).toBe(404);
    const aPending = engine.getPendingTriggers('uid-A');
    expect(aPending.map((t) => t.id)).toEqual([aTriggerId]);
    expect(aPending[0]?.suggestedTime).toEqual(originalTime);
    expect(engine.getPendingTriggers('uid-B')).toEqual([]);
  });

  it('lets user A move their own outreach to the new time', async () => {
    const res = await send('POST', '/api/outreach/reschedule', 'tok-A', {
      triggerId: aTriggerId,
      newTime,
    });

    expect(res.status).toBe(200);
    const aPending = engine.getPendingTriggers('uid-A');
    expect(aPending).toHaveLength(1);
    expect(aPending[0]?.id).not.toBe(aTriggerId);
    expect(aPending[0]?.suggestedTime?.toISOString()).toBe(newTime);
  });
});

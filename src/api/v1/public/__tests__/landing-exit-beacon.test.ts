/**
 * Engagement events on the public batch route are recorded, and an event type
 * the route does not record is reported, not counted as tracked.
 *
 * The route silently dropped any type other than exposure or conversion, and
 * counted it tracked. The landing page's own exit events (scroll depth, time on
 * page) now go through FerniExperiments as conversions (#1940,
 * src/tests/website/experiments-exit-events.test.ts covers that client); this
 * file covers the route: an `engagement` event with a visitor id is stored
 * through trackEvent, belonging to no experiment arm. Only the Firebase
 * verifier and the experiments store are mocked.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async () => null),
}));
const web = vi.hoisted(() => ({
  assignVariant: vi.fn(async () => null),
  trackExposure: vi.fn(async () => undefined),
  trackConversion: vi.fn(async () => undefined),
  trackEvent: vi.fn(async (_event: Record<string, unknown>) => undefined),
}));
vi.mock('../../../../services/experiments/web-experiments.js', () => web);

const { bindVerifiedIdentity } = await import('../../../../servers/api/request-identity.js');
const { handlePublicExperimentsRoutes } = await import('../experiments.js');

let server: Server;
let base = '';
beforeAll(async () => {
  server = createServer((req, res) => {
    void (async () => {
      await bindVerifiedIdentity(req, { NODE_ENV: 'production' });
      const url = new URL(req.url || '/', 'http://local');
      await handlePublicExperimentsRoutes(req, res, url.pathname, url);
    })();
  });
  await new Promise<void>((done) => {
    server.listen(0, '127.0.0.1', done);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((done) => {
    server.close(() => done());
  });
});
beforeEach(() => vi.clearAllMocks());

async function postBatch(body: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${base}/api/v1/public/experiments/track/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body,
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe('public batch route: engagement events', () => {
  it('records engagement events with a visitor id instead of dropping them', async () => {
    const anon = `anon_${Date.now()}_exit`;
    const events = [
      {
        experimentId: 'all',
        userId: anon,
        eventType: 'engagement',
        goalId: 'final_scroll_depth',
        value: 60,
      },
      {
        experimentId: 'all',
        userId: anon,
        eventType: 'engagement',
        goalId: 'time_on_page',
        value: 42,
      },
    ];
    const { status, json } = await postBatch(JSON.stringify({ events }));
    expect(status).toBe(200);
    expect(json).toMatchObject({ tracked: 2, failed: 0 });
    expect(
      web.trackEvent.mock.calls.map(([e]) => [
        e.experimentId,
        e.variantId,
        e.userId,
        e.eventType,
        e.goalId,
        e.value,
      ])
    ).toEqual([
      ['all', 'none', anon, 'engagement', 'final_scroll_depth', 60],
      ['all', 'none', anon, 'engagement', 'time_on_page', 42],
    ]);
    expect(web.trackConversion).not.toHaveBeenCalled();
  });

  it('reports an event type it does not record rather than counting it tracked', async () => {
    const anon = `anon_${Date.now()}_odd`;
    const events = [
      { experimentId: 'e1', variantId: 'v1', userId: anon, eventType: 'exposure' },
      { experimentId: 'e1', variantId: 'v1', userId: anon, eventType: 'pageview', goalId: 'g' },
    ];
    const { status, json } = await postBatch(JSON.stringify({ events }));
    expect(status).toBe(200);
    expect(json).toMatchObject({ tracked: 1, failed: 0, skipped: ['pageview: Invalid eventType'] });
    expect(web.trackExposure).toHaveBeenCalledTimes(1);
  });
});

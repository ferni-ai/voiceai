/**
 * The landing page's exit beacon is recorded.
 *
 * conversion-tracking.js sent `engagement` events (final scroll depth, time on
 * page) with no userId, so the public batch route refused every one with a 400
 * (254 in three days of prod logs), and even with an id the route silently
 * dropped any type other than exposure or conversion. These tests run the real
 * site script in a sandbox, capture the beacon it sends, and post that exact
 * body to the real handler. Only the Firebase verifier and the experiments
 * store are mocked.
 */
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
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

const SCRIPT = readFileSync(
  resolve(__dirname, '../../../../../apps/website/ferni-website/src/js/conversion-tracking.js'),
  'utf8'
);

/** Run conversion-tracking.js, fire beforeunload, and return what it beaconed. */
function exitBeacon(consented: boolean, userId: string): Array<{ url: string; body: string }> {
  const beacons: Array<{ url: string; body: string }> = [];
  const listeners: Record<string, Array<() => void>> = {};
  const on = (type: string, fn: () => void): void => {
    (listeners[type] ??= []).push(fn);
  };
  const window: Record<string, unknown> = {
    addEventListener: on,
    innerHeight: 800,
    scrollY: 0,
    FerniExperiments: {
      hasConsent: () => consented,
      getUserId: () => userId,
      trackConversionForAll: () => undefined,
    },
  };
  runInNewContext(SCRIPT, {
    window,
    document: {
      readyState: 'complete',
      addEventListener: on,
      querySelector: () => null,
      querySelectorAll: () => [],
      documentElement: { scrollHeight: 1600, clientHeight: 800 },
    },
    navigator: {
      sendBeacon: (url: string, body: string) => {
        beacons.push({ url, body });
        return true;
      },
    },
    IntersectionObserver: class {
      observe(): void {}
      unobserve(): void {}
    },
    setTimeout: () => 0,
    setInterval: () => 0,
    console,
    Date,
    Math,
  });
  for (const fn of listeners.beforeunload ?? []) fn();
  return beacons;
}

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

describe('landing exit beacon', () => {
  it('sends the visitor id on both exit events once the visitor has consented', () => {
    const anon = 'anon_1760000000000_abc123def';
    const [beacon, ...rest] = exitBeacon(true, anon);
    expect(rest).toEqual([]);
    expect(beacon.url).toBe('https://app.ferni.ai/api/v1/public/experiments/track/batch');
    const { events } = JSON.parse(beacon.body) as { events: Array<Record<string, unknown>> };
    expect(events.map((e) => [e.goalId, e.userId, e.eventType])).toEqual([
      ['final_scroll_depth', anon, 'engagement'],
      ['time_on_page', anon, 'engagement'],
    ]);
  });

  it('sends nothing before consent, since there is no visitor id to send', () => {
    expect(exitBeacon(false, 'anon_unused')).toEqual([]);
  });

  it('records the beacon the site sends instead of refusing it', async () => {
    const anon = `anon_${Date.now()}_exit`;
    const [beacon] = exitBeacon(true, anon);
    const { status, json } = await postBatch(beacon.body);
    expect(status).toBe(200);
    expect(json).toMatchObject({ tracked: 2, failed: 0 });
    expect(
      web.trackEvent.mock.calls.map(([e]) => [
        e.experimentId,
        e.variantId,
        e.userId,
        e.eventType,
        e.goalId,
      ])
    ).toEqual([
      ['all', 'none', anon, 'engagement', 'final_scroll_depth'],
      ['all', 'none', anon, 'engagement', 'time_on_page'],
    ]);
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

/**
 * ferni.ai's exit events (scroll depth, time on page) reach the experiments API
 * in a shape it accepts, and only after cookie consent.
 *
 * conversion-tracking.js sent them as a beacon straight to
 * app.ferni.ai/api/v1/public/experiments/track/batch with no userId, eventType
 * "engagement" and experimentId "all", whether or not the visitor had accepted
 * cookies. The route needs one anonymous visitor id per batch, so it answered
 * every one with 400 "userId is required" (new-person hunt, 2026-10-18).
 *
 * The real site scripts run here in a small fake browser; what they send is then
 * posted to the real route over HTTP, behind the real identity layer. Only the
 * Firebase verifier and the experiments store are mocked.
 */
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import vm from 'node:vm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async () => null),
}));
const store = vi.hoisted(() => ({
  assignVariant: vi.fn(async () => null),
  trackExposure: vi.fn(async () => undefined),
  trackConversion: vi.fn(async () => undefined),
  trackEvent: vi.fn(async (_event: Record<string, unknown>) => undefined),
}));
vi.mock('../../services/experiments/web-experiments.js', () => store);

const { bindVerifiedIdentity } = await import('../../servers/api/request-identity.js');
const { handlePublicExperimentsRoutes } = await import('../../api/v1/public/experiments.js');

const JS = join(process.cwd(), 'apps/website/ferni-website/src/js');
const EXPERIMENTS = readFileSync(join(JS, 'experiments.js'), 'utf8');
const TRACKING = readFileSync(join(JS, 'conversion-tracking.js'), 'utf8');

interface Sent {
  url: string;
  body: { events: Array<Record<string, unknown>> };
  /** fetch only: true lets the request outlive the page. */
  keepalive?: boolean;
}

/** Loads both scripts on a fake ferni.ai page, leaves it, and returns what was sent. */
function leavePage(opts: { consented: boolean; inExperiment?: boolean }): Sent[] {
  const storage = new Map<string, string>();
  if (opts.inExperiment !== false) {
    storage.set('ferni_experiments', JSON.stringify({ 'hero-test': { variantId: 'b', assignedAt: 1 } })); // prettier-ignore
  }
  if (opts.consented) storage.set('ferni_cookies', 'accepted');
  const sent: Sent[] = [];
  const listeners: Record<string, Array<() => void>> = {};
  const window: Record<string, unknown> = {
    location: { hostname: 'ferni.ai', search: '' },
    innerWidth: 390,
    innerHeight: 844,
    scrollY: 0,
    addEventListener: (type: string, fn: () => void) => (listeners[type] ??= []).push(fn),
  };
  const context = vm.createContext({
    window,
    document: {
      readyState: 'complete',
      visibilityState: 'visible',
      documentElement: { scrollTop: 0, scrollHeight: 2000 },
      addEventListener: () => undefined,
      querySelector: () => null,
      querySelectorAll: () => [],
    },
    localStorage: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
      removeItem: (k: string) => void storage.delete(k),
    },
    navigator: {
      sendBeacon: (url: string, body: string) => {
        sent.push({ url, body: JSON.parse(body) });
        return true;
      },
    },
    fetch: (url: string, init: { body: string; keepalive?: boolean }) => {
      sent.push({ url, body: JSON.parse(init.body), keepalive: init.keepalive });
      // Never settles: the page is gone.
      return new Promise(() => {
        /* pending */
      });
    },
    console: { warn: () => undefined, error: () => undefined, log: () => undefined },
    setTimeout: () => 0,
    clearTimeout: () => undefined,
    URLSearchParams,
    Date,
    Math,
    JSON,
    Object,
  });
  context.window = Object.assign(window, { FerniExperiments: undefined });
  vm.runInContext(EXPERIMENTS, context);
  vm.runInContext(TRACKING, context);
  for (const fn of listeners.beforeunload ?? []) fn();
  return sent;
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
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});
beforeEach(() => vi.clearAllMocks());

async function postBatch(
  body: unknown
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${base}/api/v1/public/experiments/track/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe('ferni.ai exit events', () => {
  it('sends nothing before cookie consent', () => {
    expect(leavePage({ consented: false })).toEqual([]);
  });

  it('after consent, sends scroll depth and time on page as conversions under the anonymous id', () => {
    const sent = leavePage({ consented: true });
    expect(sent.map((s) => s.url)).toEqual(['/api/landing/experiments/track/batch']);
    // Sent as the page unloads, so the request must be allowed to outlive it.
    expect(sent[0].keepalive).toBe(true);
    const { events } = sent[0].body;
    expect(events.map((e) => e.goalId)).toEqual(['final_scroll_depth', 'time_on_page']);
    for (const event of events) {
      expect(event).toMatchObject({
        experimentId: 'hero-test',
        variantId: 'b',
        eventType: 'conversion',
      });
      expect(event.userId).toMatch(/^anon_\d+_[a-z0-9]+$/);
      expect(typeof event.value).toBe('number');
    }
    // Nothing that names a person: ids, goal names and two numbers only.
    expect(Object.keys(events[0]).sort()).toEqual(
      ['eventType', 'experimentId', 'goalId', 'userId', 'value', 'variantId'].sort()
    );
    // In an experiment: sent through the experiment only, never also as engagement.
    expect(events.filter((e) => e.eventType !== 'conversion')).toEqual([]);
  });

  it('sends nothing before consent from a visitor in no experiment either', () => {
    expect(leavePage({ consented: false, inExperiment: false })).toEqual([]);
  });

  it('after consent, a visitor in no experiment sends the same metrics once, as engagement', () => {
    const sent = leavePage({ consented: true, inExperiment: false });
    expect(sent.map((s) => s.url)).toEqual(['/api/landing/experiments/track/batch']);
    expect(sent[0].keepalive).toBe(true);
    const { events } = sent[0].body;
    expect(events.map((e) => [e.goalId, e.eventType, e.experimentId])).toEqual([
      ['final_scroll_depth', 'engagement', 'all'],
      ['time_on_page', 'engagement', 'all'],
    ]);
    for (const event of events) {
      expect(event.userId).toMatch(/^anon_\d+_[a-z0-9]+$/);
      expect(typeof event.value).toBe('number');
      expect(event).not.toHaveProperty('variantId');
    }
    expect(events[1].userId).toBe(events[0].userId);
  });
});

describe('POST /api/v1/public/experiments/track/batch', () => {
  it("records the site's exit events", async () => {
    const [{ body }] = leavePage({ consented: true });
    const res = await postBatch(body);
    expect(res).toEqual({ status: 200, json: { success: true, tracked: 2, failed: 0 } });
    const { userId } = body.events[0];
    expect(store.trackConversion.mock.calls.map((c) => [c[2], c[3]])).toEqual([
      [userId, 'final_scroll_depth'],
      [userId, 'time_on_page'],
    ]);
  });

  it("records a visitor's exit metrics when they are in no experiment", async () => {
    const [{ body }] = leavePage({ consented: true, inExperiment: false });
    const res = await postBatch(body);
    expect(res).toEqual({ status: 200, json: { success: true, tracked: 2, failed: 0 } });
    const { userId } = body.events[0];
    expect(store.trackEvent.mock.calls.map(([e]) => [e.userId, e.eventType, e.goalId])).toEqual([
      [userId, 'engagement', 'final_scroll_depth'],
      [userId, 'engagement', 'time_on_page'],
    ]);
    expect(store.trackConversion).not.toHaveBeenCalled();
  });

  it('refuses the old exit beacon (no userId), recording nothing', async () => {
    const old = {
      events: [
        { experimentId: 'all', eventType: 'engagement', goalId: 'final_scroll_depth', value: 40 },
        { experimentId: 'all', eventType: 'engagement', goalId: 'time_on_page', value: 12 },
      ],
    };
    expect(await postBatch(old)).toEqual({ status: 400, json: { error: 'userId is required' } });
    expect(store.trackConversion).not.toHaveBeenCalled();
  });

  it.each([
    ['no events array', {}],
    ['an empty batch', { events: [] }],
    [
      'two visitors in one batch',
      {
        events: [
          { experimentId: 'e', variantId: 'v', userId: 'anon_1_a', eventType: 'exposure' },
          { experimentId: 'e', variantId: 'v', userId: 'anon_2_b', eventType: 'exposure' },
        ],
      },
    ],
  ])('refuses %s', async (_name, body) => {
    expect((await postBatch(body)).status).toBe(400);
    expect(store.trackExposure).not.toHaveBeenCalled();
  });
});

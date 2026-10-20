/**
 * ferni.ai's experiment events are stored.
 *
 * The site's experiments.js flushes to /api/landing/experiments/track/batch
 * (Firebase rewrites /api/landing/** to the API server). That handler logged the
 * batch and replied { success, received }, storing nothing, so every ferni.ai
 * exposure and conversion was acknowledged and dropped. It now records through
 * the same path as app.ferni.ai's route (handleTrackBatch).
 *
 * These tests post over HTTP to the LANDING path, through the real route and
 * store code; only Firestore (a fake that keeps writes) and the Firebase token
 * verifier are replaced.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

interface Write {
  path: string;
  data: Record<string, unknown>;
}
const fs = vi.hoisted(() => {
  const writes: Write[] = [];
  const docRef = (path: string): Record<string, unknown> => ({
    collection: (name: string) => colRef(`${path}/${name}`),
    set: async (data: Record<string, unknown>) => void writes.push({ path, data }),
    get: async () => ({ exists: false, data: () => undefined }),
  });
  const colRef = (path: string): Record<string, unknown> => ({
    doc: (id: string) => docRef(`${path}/${id}`),
    add: async (data: Record<string, unknown>) => void writes.push({ path, data }),
    get: async () => ({ docs: [], empty: true, size: 0 }),
  });
  return { writes, db: { collection: (name: string) => colRef(name) } };
});
vi.mock('firebase-admin', () => ({ default: { apps: [{}], initializeApp: vi.fn() } }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => fs.db,
  FieldValue: { serverTimestamp: () => 'SERVER_TS', increment: (n: number) => ({ increment: n }) },
}));
vi.mock('../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async () => null),
}));

const { bindVerifiedIdentity } = await import('../../servers/api/request-identity.js');
const { handleLandingIntelligenceRoutes } = await import('../landing-intelligence.routes.js');
const { EVENT_RETENTION_MS } = await import('../../services/experiments/event-retention.js');

let server: Server;
let base = '';
beforeAll(async () => {
  server = createServer((req, res) => {
    void (async () => {
      await bindVerifiedIdentity(req, { NODE_ENV: 'production' });
      const url = new URL(req.url || '/', 'http://local');
      const handled = await handleLandingIntelligenceRoutes(req, res, url.pathname);
      if (!handled) res.writeHead(404).end('{}');
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
beforeEach(() => {
  fs.writes.length = 0;
});

/** POST to the path the ferni.ai browser actually hits. */
async function postLanding(
  body: unknown
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${base}/api/landing/experiments/track/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 test' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

const eventsWritten = (): Write[] => fs.writes.filter((w) => w.path.endsWith('/events'));

describe('POST /api/landing/experiments/track/batch', () => {
  it('stores the exposure and the conversion the site sends', async () => {
    const anon = `anon_${Date.now()}_abc123`;
    const { status, json } = await postLanding({
      events: [
        { experimentId: 'hero-test', variantId: 'b', userId: anon, eventType: 'exposure' },
        {
          experimentId: 'hero-test',
          variantId: 'b',
          userId: anon,
          eventType: 'conversion',
          goalId: 'cta_click',
          value: 1,
        },
      ],
    });
    expect(status).toBe(200);
    expect(json).toEqual({ success: true, tracked: 2, failed: 0 });

    const rows = eventsWritten();
    expect(rows.map((r) => r.path)).toEqual([
      'web_experiments/hero-test/events',
      'web_experiments/hero-test/events',
    ]);
    expect(rows.map((r) => [r.data.userId, r.data.eventType, r.data.goalId])).toEqual([
      [anon, 'exposure', undefined],
      [anon, 'conversion', 'cta_click'],
    ]);
    // The variant's counters move too.
    expect(fs.writes.some((w) => w.path === 'web_experiments/hero-test/metrics/b')).toBe(true);
  });

  it('stores the anonymous id and the event only: no IP, user agent or client metadata', async () => {
    const anon = `anon_${Date.now()}_priv`;
    await postLanding({
      events: [
        {
          experimentId: 'hero-test',
          variantId: 'a',
          userId: anon,
          eventType: 'exposure',
          metadata: { email: 'someone@example.com', ip: '203.0.113.9' },
        },
      ],
    });
    const [row] = eventsWritten();
    expect(Object.keys(row.data).sort()).toEqual(
      ['eventType', 'experimentId', 'expireAt', 'timestamp', 'userId', 'variantId'].sort()
    );
  });

  it('gives each raw event an expireAt for the Firestore TTL policy', async () => {
    const before = Date.now();
    await postLanding({
      events: [
        { experimentId: 'e1', variantId: 'v', userId: `anon_${before}_ttl`, eventType: 'exposure' },
      ],
    });
    const expireAt = eventsWritten()[0].data.expireAt as Date;
    expect(expireAt).toBeInstanceOf(Date);
    expect(expireAt.getTime()).toBeGreaterThanOrEqual(before + EVENT_RETENTION_MS);
    expect(expireAt.getTime()).toBeLessThanOrEqual(Date.now() + EVENT_RETENTION_MS);
  });

  it('reports unknown event types and goal-less conversions instead of counting them', async () => {
    const anon = `anon_${Date.now()}_odd`;
    const { status, json } = await postLanding({
      events: [
        { experimentId: 'e1', variantId: 'v', userId: anon, eventType: 'exposure' },
        { experimentId: 'e1', variantId: 'v', userId: anon, eventType: 'pageview', goalId: 'g' },
        { experimentId: 'e1', variantId: 'v', userId: anon, eventType: 'conversion' },
      ],
    });
    expect(status).toBe(200);
    expect(json).toEqual({
      success: true,
      tracked: 1,
      failed: 0,
      skipped: [
        'pageview: Invalid eventType',
        'conversion: goalId is required for conversion events',
      ],
    });
    expect(eventsWritten()).toHaveLength(1);
  });

  it.each([
    ['no events array', {}],
    ['an empty batch', { events: [] }],
    ['no visitor id', { events: [{ experimentId: 'e', variantId: 'v', eventType: 'exposure' }] }],
    [
      'two visitors in one batch',
      {
        events: [
          { experimentId: 'e', variantId: 'v', userId: 'anon_1_a', eventType: 'exposure' },
          { experimentId: 'e', variantId: 'v', userId: 'anon_2_b', eventType: 'exposure' },
        ],
      },
    ],
    [
      'more than 50 events',
      {
        events: Array.from({ length: 51 }, () => ({
          experimentId: 'e',
          variantId: 'v',
          userId: 'anon_1_big',
          eventType: 'exposure',
        })),
      },
    ],
  ])('refuses %s, storing nothing', async (_name, body) => {
    expect((await postLanding(body)).status).toBe(400);
    expect(fs.writes).toEqual([]);
  });

  it('refuses a signed-in id without its token', async () => {
    const { status } = await postLanding({
      events: [
        { experimentId: 'e', variantId: 'v', userId: 'firebaseUid123', eventType: 'exposure' },
      ],
    });
    expect(status).toBe(401);
    expect(fs.writes).toEqual([]);
  });

  // Last: it spends this IP's budget for the minute.
  it('limits batches per IP, even when every batch names a new visitor id', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 130; i++) {
      const userId = `anon_${Date.now()}_ip${i}`;
      // eslint-disable-next-line no-await-in-loop -- one after another, so the count is exact
      const { status } = await postLanding({
        events: [{ experimentId: 'e1', variantId: 'v', userId, eventType: 'exposure' }],
      });
      statuses.push(status);
    }
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
    expect(statuses.filter((s) => s === 200).length).toBeLessThanOrEqual(120);
    // Once limited, nothing more is stored.
    const firstLimited = statuses.indexOf(429);
    expect(statuses.slice(firstLimited).every((s) => s === 429)).toBe(true);
    expect(eventsWritten()).toHaveLength(firstLimited);
  });
});

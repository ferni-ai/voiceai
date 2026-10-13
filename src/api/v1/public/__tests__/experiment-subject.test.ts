/**
 * Public experiment events are recorded only for an anonymous visitor id or
 * the verified caller.
 *
 * The public experiments routes took userId from the body (or query) as given,
 * so anyone could enroll any user, or record exposures and conversions in their
 * name. These tests drive the real handlers over a real HTTP server, behind the
 * real identity layer (production rules). Only the Firebase verifier and the
 * experiments services are mocked.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const TOKENS: Record<string, { uid: string; admin?: boolean }> = {
  'tok-alice': { uid: 'aliceUid0000000000000000000a' },
  'tok-admin': { uid: 'adminUid000000000000000000aa', admin: true },
};
const BOB = 'bobUid00000000000000000000bb';
vi.mock('../../../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) => {
    const who = TOKENS[token];
    return who ? { uid: who.uid, claims: { admin: who.admin === true } } : null;
  }),
}));

const web = vi.hoisted(() => ({
  assignVariant: vi.fn(async () => null),
  trackExposure: vi.fn(async () => undefined),
  trackConversion: vi.fn(async () => undefined),
}));
vi.mock('../../../../services/experiments/web-experiments.js', () => web);
const superhuman = vi.hoisted(() => ({
  enrollUser: vi.fn(async () => null),
  recordUserConversion: vi.fn(async () => ({ experimentId: 'e1', variantId: 'v1', success: true })),
  findExperimentsByTags: vi.fn(async () => ({ selectedExperiments: [], excludedExperiments: [] })),
  findExperimentsByIntent: vi.fn(async () => ({
    selectedExperiments: [],
    excludedExperiments: [],
  })),
}));
vi.mock('../../../../services/experiments/superhuman-experiments.js', () => superhuman);

const { bindVerifiedIdentity } = await import('../../../../servers/api/request-identity.js');
const { handlePublicExperimentsRoutes } = await import('../experiments.js');
const { handleSuperhumanExperimentsRoutes } = await import('../superhuman-experiments.js');
const { EVENTS_PER_SUBJECT_PER_MINUTE } = await import('../experiment-subject.js');

let server: Server;
let base = '';
beforeAll(async () => {
  server = createServer((req, res) => {
    void (async () => {
      await bindVerifiedIdentity(req, { NODE_ENV: 'production' });
      const url = new URL(req.url || '/', 'http://local');
      if (!(await handleSuperhumanExperimentsRoutes(req, res, url.pathname, url))) {
        await handlePublicExperimentsRoutes(req, res, url.pathname, url);
      }
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

async function call(method: string, path: string, body?: unknown, token?: string): Promise<number> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(`${base}${path}`, init);
  await res.text();
  return res.status;
}

const track = (userId: string) => ({
  experimentId: 'e1',
  variantId: 'v1',
  userId,
  eventType: 'exposure',
});
/** [route, method, path, body naming userId] */
const WRITES: Array<[string, string, (u: string) => string, (u: string) => unknown]> = [
  ['track', 'POST', () => '/api/v1/public/experiments/track', track],
  [
    'track batch',
    'POST',
    () => '/api/v1/public/experiments/track/batch',
    (u) => ({ events: [track(u)] }),
  ],
  ['variant', 'GET', (u) => `/api/v1/public/experiments/e1/variant?userId=${u}`, () => undefined],
  [
    'enroll',
    'POST',
    () => '/api/v1/public/superhuman/experiments/e1/enroll',
    (u) => ({ userId: u }),
  ],
  [
    'convert',
    'POST',
    () => '/api/v1/public/superhuman/experiments/e1/convert',
    (u) => ({ userId: u, success: true }),
  ],
];
/** Every user id the experiments services were asked to record for: [mock, index of its userId arg]. */
const USER_ARG: Array<[{ mock: { calls: unknown[][] } }, number]> = [
  [web.assignVariant, 1],
  [web.trackExposure, 2],
  [web.trackConversion, 2],
  [superhuman.enrollUser, 1],
  [superhuman.recordUserConversion, 1],
];
const recorded = (): unknown[] =>
  USER_ARG.flatMap(([fn, i]) => fn.mock.calls.map((args) => args[i]));

describe.each(WRITES)('%s', (_name, method, path, body) => {
  it("refuses a real user's id with no token, recording nothing", async () => {
    expect(await call(method, path(BOB), body(BOB))).toBe(401);
    expect(recorded()).toEqual([]);
  });

  it("refuses alice's token naming bob", async () => {
    expect(await call(method, path(BOB), body(BOB), 'tok-alice')).toBe(403);
    expect(recorded()).toEqual([]);
  });

  it('records for alice under her own token', async () => {
    const alice = TOKENS['tok-alice'].uid;
    expect(await call(method, path(alice), body(alice), 'tok-alice')).not.toBeGreaterThanOrEqual(
      400
    );
    expect(recorded()).toEqual([alice]);
  });

  it('records for an anonymous visitor id without a token', async () => {
    const anon = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    expect(await call(method, path(anon), body(anon))).not.toBeGreaterThanOrEqual(400);
    expect(recorded()).toEqual([anon]);
  });
});

describe('public experiments limits', () => {
  it('lets an admin name a user', async () => {
    expect(await call('POST', '/api/v1/public/experiments/track', track(BOB), 'tok-admin')).toBe(
      200
    );
    expect(web.trackExposure).toHaveBeenCalledWith('e1', 'v1', BOB, undefined);
  });

  it('refuses a batch that names more than one user', async () => {
    const events = [track('anon_a1'), track(BOB)];
    expect(await call('POST', '/api/v1/public/experiments/track/batch', { events })).toBe(400);
    expect(web.trackExposure).not.toHaveBeenCalled();
  });

  it('rate-limits one subject on its own', async () => {
    const anon = `anon_ratelimit_${Date.now()}`;
    const statuses: number[] = [];
    for (let i = 0; i <= EVENTS_PER_SUBJECT_PER_MINUTE; i++) {
      // eslint-disable-next-line no-await-in-loop -- requests must land in order to hit the limit
      statuses.push(await call('POST', '/api/v1/public/experiments/track', track(anon)));
    }
    expect(statuses.slice(0, EVENTS_PER_SUBJECT_PER_MINUTE).every((s) => s === 200)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
    // Another visitor is not affected
    expect(
      await call('POST', '/api/v1/public/experiments/track', track(`anon_other_${Date.now()}`))
    ).toBe(200);
  });
});

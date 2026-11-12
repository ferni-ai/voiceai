/**
 * Each route's rate limit counts in its own bucket.
 *
 * Route limits keyed a person as `user:<uid>` with no route prefix, so about
 * sixty routes shared one counter per person, and whichever route created the
 * entry set its window. A few GDPR calls could make /api/auth/migrate answer
 * 429, and migrate's one-hour window could keep a per-minute route from ever
 * resetting.
 *
 * Real handlers and the real in-memory limiter; the person is bound the way the
 * API server binds a verified uid at the door. No token is sent, so a request
 * that gets past the limit is answered 401 by the handler's auth check: 429
 * means "rate limited", anything else means "not rate limited".
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { rememberVerifiedUid } = await import('../rate-limit-identity.js');
const { handleMigrationRoutes } = await import('../migration-routes.js');
const { handleGDPRRoutes } = await import('../gdpr-routes.js');
const { limitServerRequest, API_GLOBAL_LIMIT } = await import('../global-rate-limit.js');
const { handlePlaidRoutes } = await import('../../servers/api/routes/plaid.js');
const { handleTokenRoutes } = await import('../../servers/api/routes/token.js');

const MIGRATE_PER_HOUR = 5;
const GDPR_PER_MINUTE = 10;

function response() {
  const res = {
    statusCode: 0,
    setHeader: () => res,
    writeHead: (c: number) => ((res.statusCode = c), res),
    end: () => res,
  };
  return res as unknown as ServerResponse & { statusCode: number };
}

function request(uid: string, method: string, url: string): IncomingMessage {
  const req = {
    url,
    method,
    headers: {},
    socket: { remoteAddress: '198.51.100.40' },
  } as unknown as IncomingMessage;
  rememberVerifiedUid(req, uid);
  return req;
}

async function migrateStatus(uid: string): Promise<number> {
  const res = response();
  await handleMigrationRoutes(request(uid, 'POST', '/api/auth/migrate'), res, '/api/auth/migrate');
  return res.statusCode;
}

async function gdprStatus(uid: string): Promise<number> {
  const res = response();
  await handleGDPRRoutes(request(uid, 'GET', '/api/gdpr/export'), res, '/api/gdpr/export');
  return res.statusCode;
}

async function statuses(n: number, call: () => Promise<number>): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(await call());
  return out;
}

afterEach(() => vi.useRealTimers());

describe('per-route rate-limit buckets', () => {
  it('spending one route budget does not 429 another route for the same person', async () => {
    const uid = 'uid-route-buckets-a';
    const gdpr = await statuses(GDPR_PER_MINUTE + 1, () => gdprStatus(uid));
    // GDPR's own limit still holds: ten get through, the eleventh is refused
    expect(gdpr.slice(0, GDPR_PER_MINUTE)).not.toContain(429);
    expect(gdpr[GDPR_PER_MINUTE]).toBe(429);

    expect(await migrateStatus(uid)).not.toBe(429);
  });

  it("one route's window does not set another's", async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-12T10:00:00Z') });
    const uid = 'uid-route-buckets-b';

    // Migrate (5 an hour) makes the first entry for this person. The GDPR calls
    // stay under ten even if counted with it, so only the window can refuse one.
    expect(await migrateStatus(uid)).not.toBe(429);
    expect(await statuses(GDPR_PER_MINUTE - 1, () => gdprStatus(uid))).not.toContain(429);

    // A minute later GDPR has a fresh minute, not the rest of migrate's hour
    vi.setSystemTime(new Date('2026-11-12T10:01:01Z'));
    expect(await statuses(GDPR_PER_MINUTE, () => gdprStatus(uid))).not.toContain(429);

    // and migrate keeps its hour: four more, then refused
    const migrate = await statuses(MIGRATE_PER_HOUR, () => migrateStatus(uid));
    expect(migrate.slice(0, MIGRATE_PER_HOUR - 1)).not.toContain(429);
    expect(migrate[MIGRATE_PER_HOUR - 1]).toBe(429);
  });
});

/** The server's order for one request: its global limit, then the route (with its own). */
async function serverStatus(uid: string, method: string, path: string): Promise<number> {
  const req = request(uid, method, path);
  const res = response();
  if (limitServerRequest(req, res, path)) return res.statusCode;
  const url = new URL(`http://localhost${path}`);
  if (path.startsWith('/plaid')) await handlePlaidRoutes(req, res, path, url);
  else if (path.startsWith('/api/')) await handleGDPRRoutes(req, res, path);
  else await handleTokenRoutes(req, res, path, url);
  return res.statusCode;
}

/** Calls the global limit on `path` until it refuses; the number of calls it let through. */
function useUpGlobalBudget(uid: string, path: string): number {
  for (let allowed = 0; allowed < 1000; allowed++) {
    if (limitServerRequest(request(uid, 'GET', path), response(), path)) return allowed;
  }
  throw new Error(`the global limit never refused ${path}`);
}

describe('global limits on the routes served outside /api/', () => {
  it('one caller using up the outside-/api/ budget is refused /plaid/exchange and /demo-claim', async () => {
    const uid = 'uid-route-buckets-c';
    // More calls than either route allows itself (5 and 10 a minute), none of them spent there
    expect(useUpGlobalBudget(uid, '/demo-status')).toBeGreaterThan(10);
    expect(await serverStatus(uid, 'POST', '/plaid/exchange')).toBe(429);
    expect(await serverStatus(uid, 'POST', '/demo-claim')).toBe(429);
  });

  it('using up the /api/ budget does not block /plaid/exchange', async () => {
    const uid = 'uid-route-buckets-d';
    expect(useUpGlobalBudget(uid, '/api/rituals')).toBe(API_GLOBAL_LIMIT.maxRequests);
    // Past both limits, the exchange route's own auth check answers (no token sent)
    expect(await serverStatus(uid, 'POST', '/plaid/exchange')).toBe(401);
  });

  it('an /api/ route does not spend or check the outside-/api/ budget', async () => {
    const uid = 'uid-route-buckets-e';
    useUpGlobalBudget(uid, '/token-url');
    expect(await serverStatus(uid, 'POST', '/plaid/exchange')).toBe(429);
    expect(
      limitServerRequest(request(uid, 'GET', '/api/rituals'), response(), '/api/rituals')
    ).toBe(false);
  });
});

/**
 * /api/admin/{callers,visitors,daily-stats,trigger-report} compared the caller's key
 * with process.env.ADMIN_API_KEY || 'ferni-admin-2026'. Production never set
 * ADMIN_API_KEY (it sets ADMIN_API_KEYS), so the hardcoded string was the live key.
 * PUT /api/landing/flags had no auth at all. Both now go through the real requireAdmin.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';

vi.hoisted(() => {
  process.env.ADMIN_API_KEYS = 'test-admin-key';
  delete process.env.ADMIN_API_KEY;
});

const firestore = vi.hoisted(() => {
  const get = vi.fn(async () => ({ docs: [], size: 0, empty: true }));
  const query: Record<string, unknown> = {};
  for (const m of ['where', 'orderBy', 'limit', 'select']) query[m] = () => query;
  query.get = get;
  return { get, collection: vi.fn(() => query) };
});

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collection: firestore.collection }),
  FieldValue: { serverTimestamp: () => 'ts' },
  Timestamp: { fromDate: (d: Date) => d, now: () => new Date() },
}));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));

import { handleAdminRoutes } from '../admin-routes.js';
import { handleLandingIntelligenceRoutes } from '../landing-intelligence.routes.js';
import { getLandingIntelligenceFlags } from '../../services/landing-intelligence/lifecycle.js';

function request(method: string, url: string, headers: Record<string, string>, body?: unknown) {
  const req = new EventEmitter() as IncomingMessage & { [Symbol.asyncIterator]?: unknown };
  req.method = method;
  req.url = url;
  req.headers = { host: 'app.ferni.ai', 'content-type': 'application/json', ...headers };
  (req as unknown as { socket: { remoteAddress: string } }).socket = {
    remoteAddress: '203.0.113.9',
  };
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  req[Symbol.asyncIterator] = async function* () {
    yield* chunks;
  };
  // parseBody (api/helpers.ts) reads 'data'/'end' events; send them once it listens.
  const on = req.on.bind(req);
  req.on = ((event: string, listener: (...args: unknown[]) => void) => {
    on(event, listener);
    if (event === 'end') {
      setTimeout(() => {
        for (const c of chunks) req.emit('data', c);
        req.emit('end');
      }, 0);
    }
    return req;
  }) as typeof req.on;
  return req;
}

function response(): ServerResponse & { status?: number } {
  const state: { status?: number; headersSent: boolean } = { headersSent: false };
  const res = Object.assign(state, {
    setHeader: () => res,
    getHeader: () => undefined,
    writeHead(status: number) {
      state.status = status;
      state.headersSent = true;
      return res;
    },
    end: () => res,
  }) as unknown as ServerResponse & { status?: number };
  return res;
}

beforeEach(() => vi.clearAllMocks());

describe('admin routes no longer accept the hardcoded key', () => {
  it.each([
    ['x-admin-api-key', 'ferni-admin-2026'],
    ['authorization', 'Bearer ferni-admin-2026'],
    ['x-api-key', 'ferni-admin-2026'],
  ])('refuses %s with the old fallback key and reads nothing', async (name, value) => {
    const res = response();
    const handled = await handleAdminRoutes(
      request('GET', '/api/admin/callers', { [name]: value }),
      res,
      '/api/admin/callers'
    );
    expect(handled).toBe(true);
    expect([401, 403]).toContain(res.status);
    expect(firestore.collection).not.toHaveBeenCalled();
  });

  it('refuses an anonymous request for visitors', async () => {
    const res = response();
    await handleAdminRoutes(request('GET', '/api/admin/visitors', {}), res, '/api/admin/visitors');
    expect([401, 403]).toContain(res.status);
    expect(firestore.collection).not.toHaveBeenCalled();
  });

  it('serves a real admin key from ADMIN_API_KEYS', async () => {
    const res = response();
    const handled = await handleAdminRoutes(
      request('GET', '/api/admin/callers', { 'x-api-key': 'test-admin-key' }),
      res,
      '/api/admin/callers'
    );
    expect(handled).toBe(true);
    expect(res.status).toBe(200);
    expect(firestore.collection).toHaveBeenCalledWith('call_records');
  });
});

describe('PUT /api/landing/flags is admin-only', () => {
  it('refuses an anonymous update and leaves the flags as they were', async () => {
    const before = JSON.stringify(getLandingIntelligenceFlags());
    const flipped = Object.fromEntries(
      Object.entries(getLandingIntelligenceFlags()).map(([k, v]) => [k, !v])
    );
    const res = response();
    const handled = await handleLandingIntelligenceRoutes(
      request('PUT', '/api/landing/flags', {}, flipped),
      res,
      '/api/landing/flags'
    );
    expect(handled).toBe(true);
    expect([401, 403]).toContain(res.status);
    expect(JSON.stringify(getLandingIntelligenceFlags())).toBe(before);
  });

  it('lets an admin key change a flag', async () => {
    const [key, value] = Object.entries(getLandingIntelligenceFlags())[0] as [string, boolean];
    const res = response();
    await handleLandingIntelligenceRoutes(
      request('PUT', '/api/landing/flags', { 'x-api-key': 'test-admin-key' }, { [key]: !value }),
      res,
      '/api/landing/flags'
    );
    expect(res.status ?? 200).toBe(200);
    expect((getLandingIntelligenceFlags() as unknown as Record<string, boolean>)[key]).toBe(!value);
  });

  it('still serves the flags to anyone (GET is public)', async () => {
    const res = response();
    const handled = await handleLandingIntelligenceRoutes(
      request('GET', '/api/landing/flags', {}),
      res,
      '/api/landing/flags'
    );
    expect(handled).toBe(true);
    expect(res.status ?? 200).toBe(200);
  });
});

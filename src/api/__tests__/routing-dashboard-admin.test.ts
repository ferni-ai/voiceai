/**
 * GET /api/observability/routing-dashboard shows every caller's routing decisions, so it
 * is for admins only (requireAdmin, the repo's admin guard). It used to need only a
 * sign-in, so any signed-in person could read it. The real auth middleware runs here,
 * over real HTTP, with a non-admin and an admin API key.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Read when auth-middleware loads, so set before anything imports it
vi.hoisted(() => {
  process.env.API_KEYS = 'test-member-key';
  process.env.ADMIN_API_KEYS = 'test-admin-key';
});

const { handleObservabilityRoutes } = await import('../observability-routes.js');

let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://local').pathname;
    void handleObservabilityRoutes(req, res, pathname);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => {
    server.close(resolve);
  });
  delete process.env.API_KEYS;
  delete process.env.ADMIN_API_KEYS;
});

const get = async (path: string, key?: string) =>
  fetch(`${base}${path}`, { headers: key ? { 'X-API-Key': key } : {} });

describe('routing dashboard is admin only', () => {
  it('refuses a signed-in non-admin with 403', async () => {
    const res = await get('/api/observability/routing-dashboard', 'test-member-key');
    expect(res.status).toBe(403);
    expect(JSON.stringify(await res.json())).not.toContain('recentRoutes');
  });

  it('refuses no sign-in with 401', async () => {
    expect((await get('/api/observability/routing-dashboard')).status).toBe(401);
  });

  it('serves an admin with 200', async () => {
    const res = await get('/api/observability/routing-dashboard', 'test-admin-key');
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveProperty('recentRoutes');
  });

  it('leaves the other observability reads open to a signed-in non-admin', async () => {
    const res = await get('/api/observability/semantic-routing', 'test-member-key');
    expect(res.status).toBe(200);
  });
});
